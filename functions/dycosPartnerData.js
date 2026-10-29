import { createHash } from 'node:crypto'
import { DycosMappingError } from './dycosOrderMapping.js'

const empty = (value) => value === '' || value === null || value === undefined
const text = (value, field) => {
  if (empty(value)) return ''
  if (!['string', 'number'].includes(typeof value) || String(value).length > 4000) throw new DycosMappingError(field)
  return String(value).trim()
}
const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const at = (data, path) => path.split('.').reduce((current, key) => current?.[key], data)
const set = (data, path, value) => {
  const keys = path.split('.'); let current = data
  for (const key of keys.slice(0, -1)) current = current[key] ||= {}
  current[keys.at(-1)] = value
}
const labels = {
  companyName: 'Firmenname', 'address.street': 'Straße', 'address.postalCode': 'PLZ', 'address.city': 'Ort', 'address.country': 'Land',
  'contact.phone': 'Telefon', 'contact.fax': 'Fax', 'contact.email': 'Allgemeine E-Mail', 'contact.website': 'Website',
  'companyData.vatId': 'USt-ID', 'companyData.taxNumber': 'Steuernummer', timocomNumber: 'TimoCom-Nummer',
  paymentTermDays: 'Zahlungsziel', creditNoteProcedure: 'Gutschriftverfahren', dycosCreatedAt: 'Erfasst am DyCoS', 'bankData.iban': 'IBAN', 'bankData.bic': 'BIC', 'bankData.ibanVerifiedAt': 'IBAN geprüft am',
}
const fieldPaths = Object.keys(labels)
const same = (path, left, right) => String(left ?? '').trim().normalize('NFC') === String(right ?? '').trim().normalize('NFC')
  || path.endsWith('email') && String(left).trim().toLowerCase() === String(right).trim().toLowerCase()

function sourceDate(value, field) {
  const source = text(value, field)
  if (!source || /^(?:1899|1900)-/.test(source)) return ''
  const date = source.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (!date || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new DycosMappingError(field)
  return date
}

function mapPartner(row, term, kind) {
  if (!row) return null
  const read = (key) => text(row[key], `${kind}.${key}`)
  const contacts = []
  const addContact = (key, entry) => {
    if (!Object.values(entry).some(Boolean)) return
    const addresses = entry.email.split(/[;,\s]+/).map((value) => value.replace(/^mailto:/i, '').replace(/[<>]/g, '')).filter(Boolean)
    if (addresses.length > 1) {
      for (const address of addresses) addContact(`${key}-${createHash('sha256').update(address.toLowerCase()).digest('hex').slice(0, 12)}`, { ...entry, email: address })
      return
    }
    entry.email = addresses[0] || ''
    const email = entry.email.toLowerCase()
    if (email && !emailPattern.test(email)) { warningCodes.add('PARTNER_CONTACT_DATA_INVALID'); entry.email = '' }
    if (!Object.values(entry).some(Boolean)) return
    const existing = email && contacts.find((contact) => contact.email.toLowerCase() === email)
    if (existing) {
      for (const [field, value] of Object.entries(entry)) if (!existing[field] && value) existing[field] = value
      return
    }
    contacts.push({ id: `dycos-${kind}-${row.ID}-${key}${email ? `-${createHash('sha256').update(email).digest('hex').slice(0, 12)}` : ''}`, ...entry })
  }
  const warningCodes = new Set()
  const groups = kind === 'customer' ? ['1', '2'] : ['', '2', '3']
  for (const suffix of groups) {
    const department = read(`AbteilungAnsp${suffix}`)
    addContact(`person${suffix || '1'}`, {
      name: read(`Ansprechpartner${suffix}`), department: department ? 'Sonstiges' : '', departmentOther: department,
      phone: read(`TelefonAnsp${suffix}`), mobile: '', email: read(`EMailAnsp${suffix}`),
    })
  }
  // Customer's unnumbered name has no equally named telephone/mail column.
  // Keep it without manufacturing a connection to the central/company email.
  if (kind === 'customer') {
    const department = read('AbteilungAnsp')
    addContact('unnumbered', { name: read('Ansprechpartner'), department: department ? 'Sonstiges' : '', departmentOther: department, phone: '', mobile: '', email: '' })
  }
  // The handset numbering is a separate SQL field family. Preserve numbers as
  // independent contact methods until their relation to person indices is confirmed.
  for (let index = 1; index <= 3; index++) addContact(`mobile${index}`, { name: '', department: '', departmentOther: '', phone: '', mobile: read(`Ansp${index}Handy${kind === 'customer' ? 'KD' : 'UTN'}`), email: '' })
  let generalEmail = kind === 'customer' ? read('EMailZentrale').toLowerCase() : ''
  if (generalEmail.split(/[;,\s]+/).filter(Boolean).length > 1) {
    addContact('central-email', { name: '', department: '', departmentOther: '', phone: '', mobile: '', email: generalEmail })
    warningCodes.add('PARTNER_MULTIPLE_GENERAL_EMAILS')
    generalEmail = ''
  }
  if (generalEmail && !emailPattern.test(generalEmail)) { warningCodes.add('PARTNER_CONTACT_DATA_INVALID'); generalEmail = '' }
  let website = read('Internet')
  if (website && emailPattern.test(website)) { addContact('internet-email', { name: '', department: '', departmentOther: '', phone: '', mobile: '', email: website.toLowerCase() }); website = '' }
  if (website) {
    if (/^www\./i.test(website)) website = `https://${website}`
    try { const parsed = new URL(website); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error() }
    catch { warningCodes.add('PARTNER_CONTACT_DATA_INVALID'); website = '' }
  }
  const iban = read('IBAN').replace(/\s/g, '').toUpperCase()
  const bic = read('SWIFT').replace(/\s/g, '').toUpperCase()
  const fields = {
    companyName: read(kind === 'customer' ? 'Firma' : 'Bezeichnung'),
    address: { street: read('Strasse'), postalCode: read('PLZ'), city: read('Ort'), country: read('Land') },
    contact: { phone: kind === 'customer' ? read('TelefonZentrale') : '', fax: kind === 'customer' ? read('FaxZentrale') : '', email: generalEmail, website },
    companyData: { vatId: read('USTID'), taxNumber: read('Steuernummer') },
    timocomNumber: /^0+$/.test(read('TimoComNummer')) ? '' : read('TimoComNummer'),
    paymentTermDays: term ? text(term.Bezeichnung, `${kind}.paymentTerm.Bezeichnung`) : '',
    ...(kind === 'customer' && typeof row.KundeSchicktGutschrift === 'boolean' ? { creditNoteProcedure: row.KundeSchicktGutschrift } : {}),
    dycosCreatedAt: sourceDate(row.Erfassungsdatum, `${kind}.Erfassungsdatum`),
    bankData: { iban: /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) ? iban : '', bic: /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(bic) ? bic : '', ibanVerifiedAt: row.IBANgeprueft === true ? sourceDate(row.IBANgeprueftDatum, `${kind}.IBANgeprueftDatum`) : '' },
    contacts,
  }
  if (iban && !fields.bankData.iban || bic && !fields.bankData.bic) warningCodes.add('PARTNER_BANK_DATA_INVALID')
  // Exclude arbitrary SQL fields, portal credentials, free-text Infos and
  // unconfirmed credit-limit/language semantics from this boundary.
  return { sourceKind: kind, sourceId: String(row.ID), fields, warningCodes: [...warningCodes] }
}

export function mapDycosPartnerData(payload) {
  return {
    customer: mapPartner(payload.kunde, payload.zahlungsbedingungKunde, 'customer'),
    carrier: mapPartner(payload.unternehmerstamm, payload.zahlungsbedingungUnternehmer, 'carrier'),
  }
}

export const hasDycosMasterDataAccess = (profile) => profile?.role === 'superadmin' || profile?.permissions?.masterData === 'edit'

/** Build only additions. False and zero are populated values, never blanks. */
export function dycosPartnerAdditions(existing, incoming) {
  const patch = {}; const conflicts = []; const changedFields = []
  const add = (path, value) => {
    if (empty(value)) return
    const current = path === 'paymentTermDays' && empty(existing.paymentTermDays) ? existing.paymentTermsOriginal : at(existing, path)
    if (empty(current)) { set(patch, path, value); changedFields.push(path) }
    else if (!same(path, current, value)) conflicts.push({ path, label: labels[path] || 'Ansprechpartner', currentValue: current, incomingValue: value })
  }
  for (const path of fieldPaths) add(path, at(incoming, path))
  const contacts = structuredClone(existing.contacts || [])
  for (const candidate of incoming.contacts || []) {
    const email = candidate.email.toLowerCase()
    const index = contacts.findIndex((entry) => email ? String(entry.email || '').toLowerCase() === email : entry.id === candidate.id)
    // The general address is already represented. Do not duplicate it as a
    // nameless contact, but keep actual named contacts using that address.
    if (index < 0 && email && email === String(existing.contact?.email || incoming.contact?.email || '').toLowerCase() && !candidate.name && !candidate.phone && !candidate.mobile) continue
    if (index < 0) { contacts.push(structuredClone(candidate)); changedFields.push('contacts'); continue }
    for (const field of ['name', 'department', 'departmentOther', 'phone', 'mobile']) {
      if (!candidate[field]) continue
      const path = `contacts.${index}.${field}`
      if (empty(contacts[index][field])) { contacts[index][field] = candidate[field]; changedFields.push(path) }
      else if (!same(path, contacts[index][field], candidate[field])) conflicts.push({ path, label: 'Ansprechpartner', currentValue: contacts[index][field], incomingValue: candidate[field] })
    }
  }
  if (contacts.length > 200) throw new DycosMappingError('partner.contacts')
  if (JSON.stringify(contacts) !== JSON.stringify(existing.contacts || [])) patch.contacts = contacts
  return { patch, conflicts, changedFields: [...new Set(changedFields)] }
}

export function dycosPartnerReviewFingerprint(conflicts) {
  return createHash('sha256').update(JSON.stringify(conflicts)).digest('hex')
}

// A shared partner may be both customer and carrier. Never choose one side's
// conflicting payment term/address just because its plan was iterated first.
export function combineDycosPartnerSources(sources) {
  const fields = { contacts: sources.flatMap((source) => source.fields.contacts) }; const conflicts = []
  for (const path of fieldPaths) {
    const values = sources.map((source) => at(source.fields, path)).filter((value) => !empty(value))
    if (!values.length) continue
    if (values.some((value) => !same(path, value, values[0]))) conflicts.push({ path, label: labels[path], currentValue: null, incomingValue: [...new Set(values)].join(' / ') })
    else set(fields, path, values[0])
  }
  return { fields, conflicts }
}
