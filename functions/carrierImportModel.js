import { paymentTermText } from './paymentTerms.js'

const text = (value) => value === null || value === undefined ? '' : String(value).trim()
const empty = (value) => value === '' || value === null || value === undefined
const normalizeCustomerIdentifier = text
const matchesDebtorReference = (partner, number) => Boolean(normalizeCustomerIdentifier(number)) && [partner?.debtorNumber, ...(partner?.dycosReferences?.debtorNumbers || [])].some((candidate) => normalizeCustomerIdentifier(candidate) === normalizeCustomerIdentifier(number))
const unique = (values) => [...new Set(values.map(normalizeCustomerIdentifier).filter(Boolean))]
export const carrierReviewId = (number) => `carrier-review-${encodeURIComponent(normalizeCustomerIdentifier(number))}`
export const hasCarrierImportAccess = (profile) => profile?.role === 'superadmin' || (profile?.permissions?.dataImports === 'edit' && profile?.permissions?.masterData === 'edit')

export function resolveActivePartner(partners, candidate) {
  let current = candidate
  const visited = new Set()
  while (current?.mergedIntoPartnerId) {
    if (visited.has(current.id)) return null
    visited.add(current.id)
    current = partners.find((entry) => entry.id === current.mergedIntoPartnerId)
  }
  return current?.status === 'merged' ? null : current || null
}

export function carrierIdentity(partners, creditorNumber, debtorNumber) {
  const creditorMatches = partners.filter((entry) => Boolean(normalizeCustomerIdentifier(creditorNumber)) && [entry.creditorNumber, ...(entry.dycosReferences?.creditorNumbers || [])].some((candidate) => normalizeCustomerIdentifier(candidate) === normalizeCustomerIdentifier(creditorNumber)))
  const debtorMatches = debtorNumber ? partners.filter((entry) => matchesDebtorReference(entry, debtorNumber)) : []
  const activeMatches = (entries) => {
    const direct = entries.filter((entry) => !entry.mergedIntoPartnerId && entry.status !== 'merged')
    return [...new Map((direct.length ? direct : entries.map((entry) => resolveActivePartner(partners, entry)).filter(Boolean)).map((entry) => [entry.id, entry])).values()]
  }
  const creditors = activeMatches(creditorMatches)
  const debtors = activeMatches(debtorMatches)
  const creditor = creditors[0] || null
  const debtor = debtors[0] || null
  const ambiguity = [...creditorMatches, ...debtorMatches].some((entry) => !resolveActivePartner(partners, entry)) ? 'Die Nummer verweist auf ein archiviertes Stammdatenblatt ohne erreichbaren Zielpartner.' : creditors.length > 1 ? 'Die Kreditorennummer ist mehreren aktiven Stammdatenblättern zugeordnet.' : debtors.length > 1 ? 'Die zugeordnete Debitorennummer ist mehreren aktiven Stammdatenblättern zugeordnet.' : ''
  const merge = creditor && debtor && creditor.id !== debtor.id ? { partnerIds: [creditor.id, debtor.id], suggestedTargetId: creditor.id, creditorPartnerId: creditor.id, debtorPartnerId: debtor.id } : null
  return { creditor, debtor, partner: creditor || debtor, merge, ambiguity, assignment: creditor ? { kind: 'creditor', number: normalizeCustomerIdentifier(creditorNumber) } : debtor ? { kind: 'debtor', number: normalizeCustomerIdentifier(debtorNumber) } : { kind: 'new' } }
}

export function carrierPayload(row, runId, now) {
  const data = row.data || {}
  const creditorNumber = normalizeCustomerIdentifier(row.creditorNumber)
  const debtorNumber = normalizeCustomerIdentifier(data.linkedDebtorNumber)
  return {
    id: `dycos-creditor-${encodeURIComponent(creditorNumber)}`, companyName: text(row.companyName), creditorNumber, debtorNumber,
    dycosReferences: { creditorNumbers: [creditorNumber], debtorNumbers: debtorNumber ? [debtorNumber] : [] },
    status: 'active', timocomNumber: text(data.timocomNumber), transeuNumber: '', dplNumber: '', pakiNumber: '',
    paymentTermDays: text(data.paymentTermsOriginal || data.paymentTermDays), paymentTermsOriginal: text(data.paymentTermsOriginal), dycosCreatedAt: text(data.dycosCreatedAt),
    address: { street: text(data.street), houseNumber: '', postalCode: text(data.postalCode), city: text(data.city), country: text(data.country) },
    contact: { phone: '', fax: '', email: '', website: text(data.website) }, contacts: data.contacts || [], portals: [],
    companyData: { vatId: text(data.vatId), taxNumber: text(data.taxNumber), commercialRegisterNumber: '', registerCourt: '' },
    bankData: { iban: text(data.iban), bic: text(data.bic), ibanVerifiedAt: text(data.ibanVerifiedAt) },
    creditNoteProcedure: false, creditLimit: null, palletNote: '', crmStatus: '', potential: '', language: '',
    importOrigin: { source: 'dycosCarrierImport', importRunId: runId, createdAt: now }, importRawValues: data.rawValues || {}, createdAt: now, updatedAt: now,
  }
}

const labels = { companyName: 'Unternehmer', timocomNumber: 'TimoCom-Nr', paymentTermDays: 'Zahlungsziel', dycosCreatedAt: 'Partner seit', 'address.street': 'Straße', 'address.postalCode': 'PLZ', 'address.city': 'Ort', 'address.country': 'Land', 'contact.website': 'Internet', 'companyData.vatId': 'USt-ID', 'companyData.taxNumber': 'Steuernummer', 'bankData.iban': 'IBAN', 'bankData.bic': 'BIC', 'bankData.ibanVerifiedAt': 'IBAN geprüft Datum' }
export const carrierComparisonLabel = (path) => labels[path] || (path.startsWith('contacts.') ? `Kontakt ${Number(path.split('.')[1]) + 1}: ${({ name: 'Name', department: 'Abteilung', phone: 'Telefon', mobile: 'Handy', email: 'E-Mail' })[path.split('.')[2]] || path}` : path)
export const carrierReadPath = (source, path) => path === 'paymentTermDays' ? paymentTermText(source) : path.split('.').reduce((value, part) => value?.[part], source)
export const sameCarrierValue = (path, left, right) => empty(left) && empty(right) || (path.endsWith('email') ? text(left).toLowerCase() === text(right).toLowerCase() : text(left) === text(right))
const conflict = (path, currentValue, incomingValue) => ({ path, label: carrierComparisonLabel(path), current: empty(currentValue) ? '—' : text(currentValue), incoming: empty(incomingValue) ? '—' : text(incomingValue), currentValue: currentValue ?? '', incomingValue: incomingValue ?? '' })

export function carrierAdditions(existing, row) {
  const incoming = carrierPayload(row, 'preview', null)
  const patch = {}; const conflicts = []
  const addField = (path, current, next) => {
    if (empty(next)) return
    if (empty(current)) {
      const [head, field] = path.split('.')
      if (field) patch[head] = { ...(existing[head] || {}), ...(patch[head] || {}), [field]: next }
      else patch[head] = next
    } else if (!sameCarrierValue(path, current, next)) conflicts.push(conflict(path, current, next))
  }
  for (const field of ['companyName', 'timocomNumber', 'dycosCreatedAt']) addField(field, existing[field], incoming[field])
  if (incoming.paymentTermDays) {
    const currentTerm = paymentTermText(existing)
    if (!currentTerm || currentTerm === incoming.paymentTermDays) {
      if (existing.paymentTermDays !== incoming.paymentTermDays) patch.paymentTermDays = incoming.paymentTermDays
    } else conflicts.push(conflict('paymentTermDays', currentTerm, incoming.paymentTermDays))
  }
  if (incoming.paymentTermsOriginal && empty(existing.paymentTermsOriginal)) patch.paymentTermsOriginal = incoming.paymentTermsOriginal
  for (const parent of ['address', 'contact', 'companyData', 'bankData']) for (const [field, value] of Object.entries(incoming[parent] || {})) addField(`${parent}.${field}`, existing[parent]?.[field], value)
  const references = { ...(existing.dycosReferences || {}) }
  for (const [field, referenceField] of [['creditorNumber', 'creditorNumbers'], ['debtorNumber', 'debtorNumbers']]) {
    const number = normalizeCustomerIdentifier(incoming[field])
    if (!number) continue
    const known = unique([existing[field], ...(references[referenceField] || [])])
    if (!existing[field]) patch[field] = number
    references[referenceField] = unique([...known, number])
  }
  if (JSON.stringify(references) !== JSON.stringify(existing.dycosReferences || {})) patch.dycosReferences = references
  const contacts = (existing.contacts || []).map((entry) => ({ ...entry }))
  for (const entry of incoming.contacts || []) {
    const email = text(entry.email).toLowerCase()
    if (email && text(existing.contact?.email).toLowerCase() === email) continue
    const index = contacts.findIndex((item) => email && text(item.email).toLowerCase() === email || item.id === entry.id)
    if (index < 0) { contacts.push(entry); continue }
    for (const field of ['name', 'department', 'phone', 'mobile', 'email']) {
      if (empty(entry[field])) continue
      if (empty(contacts[index][field])) contacts[index][field] = entry[field]
      else if (!sameCarrierValue(`contacts.${index}.${field}`, contacts[index][field], entry[field])) conflicts.push(conflict(`contacts.${index}.${field}`, contacts[index][field], entry[field]))
    }
  }
  if (JSON.stringify(contacts) !== JSON.stringify(existing.contacts || [])) patch.contacts = contacts
  return { patch, conflicts }
}

export function carrierDecisionDetails(row, additions, existing = null) {
  void row
  void existing
  const reasons = []
  const comparisons = [...additions.conflicts]
  return { reasons, comparisons }
}

export function carrierActions(existing, row, applied = {}) {
  if (applied.created) return ['created']
  const actions = []
  if (!existing) return ['unchanged']
  if (row.creditorNumber && ![existing.creditorNumber, ...(existing.dycosReferences?.creditorNumbers || [])].some((value) => text(value) === text(row.creditorNumber))) actions.push('creditorAdded')
  if (row.data.linkedDebtorNumber && ![existing.debtorNumber, ...(existing.dycosReferences?.debtorNumbers || [])].some((value) => text(value) === text(row.data.linkedDebtorNumber))) actions.push('debtorAdded')
  if (Object.keys(applied).some((key) => !['creditorNumber', 'debtorNumber', 'dycosReferences'].includes(key))) actions.push('updated')
  return actions.length ? actions : ['unchanged']
}
