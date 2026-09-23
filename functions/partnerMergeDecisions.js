import { paymentTermText } from './paymentTerms.js'

const fields = [
  ['companyName', 'Firma'], ['status', 'Status'], ['timocomNumber', 'Timocom-Nummer'], ['transeuNumber', 'Trans.eu-Nummer'],
  ['dplNumber', 'DPL-Nummer'], ['pakiNumber', 'Paki-Nummer'], ['paymentTermDays', 'Zahlungsziel'],
  ['creditNoteProcedure', 'Gutschriftverfahren'], ['creditLimit', 'Kreditlimit'],
  ['palletNote', 'Palettenhinweis'], ['crmStatus', 'CRM-Status'], ['potential', 'Potenzial'], ['language', 'Sprache'],
  ['dycosCreatedAt', 'Erfasst am DyCoS'],
  ['address.street', 'Straße'], ['address.houseNumber', 'Hausnummer'], ['address.postalCode', 'PLZ'],
  ['address.city', 'Ort'], ['address.country', 'Land'],
  ['contact.email', 'Standard-E-Mail'], ['contact.phone', 'Telefon'], ['contact.fax', 'Fax'], ['contact.website', 'Website'],
  ['companyData.vatId', 'USt-ID'], ['companyData.taxNumber', 'Steuernummer'],
  ['companyData.commercialRegisterNumber', 'Handelsregisternummer'], ['companyData.registerCourt', 'Registergericht'],
  ['bankData.iban', 'IBAN'], ['bankData.bic', 'BIC'], ['bankData.ibanVerifiedAt', 'IBAN geprüft am'],
]
const listFields = {
  contacts: [['name', 'Name'], ['department', 'Abteilung'], ['departmentOther', 'Weitere Abteilung'], ['email', 'E-Mail'], ['phone', 'Telefon'], ['mobile', 'Mobiltelefon']],
  portals: [['name', 'Name'], ['url', 'URL'], ['username', 'Benutzername'], ['accessNumber', 'Zugangsnummer'], ['purpose', 'Zweck']],
}
const listLabels = { contacts: 'Kontakt', portals: 'Portal' }
const read = (record, path) => path === 'paymentTermDays' ? paymentTermText(record) : path.split('.').reduce((value, part) => value?.[part], record)
const filled = (value) => value !== null && value !== undefined && String(value).trim() !== ''
const normalizedEmail = (value) => String(value ?? '').trim().toLocaleLowerCase('de-DE')
const comparable = (path, value) => path.endsWith('email') ? normalizedEmail(value) : String(value ?? '').trim()

export const mergeValueText = (value) => value === true ? 'Ja' : value === false ? 'Nein' : value === null || value === undefined ? '' : String(value)

function addRow(rows, key, label, path, sourceValue, targetValue, extra = {}) {
  if (!filled(sourceValue) || comparable(path, sourceValue) === comparable(path, targetValue)) return
  const kind = filled(targetValue) ? 'conflict' : 'addition'
  rows.push({ key, label, path, sourceValue, targetValue, kind, ...extra })
}

function matchingListIndex(targetList, sourceItem) {
  const email = normalizedEmail(sourceItem?.email)
  if (email) {
    const index = targetList.findIndex((item) => normalizedEmail(item?.email) === email)
    if (index >= 0) return index
  }
  const url = String(sourceItem?.url ?? '').trim().toLocaleLowerCase('de-DE')
  if (url) {
    const index = targetList.findIndex((item) => String(item?.url ?? '').trim().toLocaleLowerCase('de-DE') === url)
    if (index >= 0) return index
  }
  const id = String(sourceItem?.id ?? '')
  return id ? targetList.findIndex((item) => String(item?.id ?? '') === id) : -1
}

export function buildPartnerMergeRows(target, source) {
  const rows = []
  fields.forEach(([path, label]) => addRow(rows, path, label, path, read(source, path), read(target, path)))
  Object.entries(listFields).forEach(([collection, properties]) => {
    const targetList = Array.isArray(target?.[collection]) ? target[collection] : []
    const sourceList = Array.isArray(source?.[collection]) ? source[collection] : []
    sourceList.forEach((sourceItem, sourceIndex) => {
      const targetIndex = matchingListIndex(targetList, sourceItem)
      const targetItem = targetList[targetIndex] || {}
      const itemLabel = `${listLabels[collection]} ${sourceIndex + 1}${sourceItem?.name ? ` (${sourceItem.name})` : ''}`
      properties.forEach(([field, label]) => addRow(rows, `${collection}.${sourceIndex}.${field}`, `${itemLabel} · ${label}`, field, sourceItem?.[field], targetItem[field], { collection, sourceIndex, targetIndex, field }))
    })
  })
  return rows
}

export function partnerMergePreview(partner) {
  const keys = new Set(fields.map(([path]) => path.split('.')[0]))
  return { id: partner.id, debtorNumber: partner.debtorNumber, creditorNumber: partner.creditorNumber, dycosReferences: partner.dycosReferences || {}, contacts: partner.contacts || [], portals: partner.portals || [], ...Object.fromEntries([...keys].map((key) => [key, key === 'paymentTermDays' ? paymentTermText(partner) : partner[key] ?? null])) }
}

export function initialPartnerMergeDecisions(rows) {
  return Object.fromEntries(rows.map((row) => [row.key, { value: mergeValueText(row.kind === 'addition' ? row.sourceValue : row.targetValue), resolution: row.kind === 'addition' ? 'source' : '' }]))
}

export function mergeComparison(merge, targetId) {
  const target = merge?.partners?.find((partner) => partner.id === targetId)
  const source = merge?.partners?.find((partner) => partner.id !== targetId)
  const rows = target && source ? buildPartnerMergeRows(target, source) : []
  return { rows, decisions: initialPartnerMergeDecisions(rows) }
}

export function mergeDecisionSummary(rows, decisions) {
  return {
    additions: rows.filter((row) => row.kind === 'addition' && filled(decisions[row.key]?.value)).length,
    open: rows.filter((row) => row.kind === 'conflict' && !decisions[row.key]?.resolution).length,
  }
}

function typedValue(path, value) {
  const raw = String(value ?? '')
  const entered = raw.trim()
  if (path === 'creditNoteProcedure' && ['ja', 'nein'].includes(entered.toLocaleLowerCase('de-DE'))) return entered.toLocaleLowerCase('de-DE') === 'ja'
  if (path === 'creditLimit') return entered === '' ? null : Number.isFinite(Number(entered)) ? Number(entered) : entered
  return raw
}

function assign(record, path, value) {
  const parts = path.split('.')
  if (parts.length === 1) record[path] = value
  else record[parts[0]] = { ...(record[parts[0]] || {}), [parts[1]]: value }
}

function deduplicateEmails(items) {
  const result = []
  items.forEach((item) => {
    const email = normalizedEmail(item.email)
    const index = email ? result.findIndex((other) => normalizedEmail(other.email) === email) : -1
    if (index < 0) result.push(item)
    else result[index] = { ...result[index], ...Object.fromEntries(Object.entries(item).filter(([, value]) => filled(value))), id: result[index].id || item.id }
  })
  return result
}

export function applyPartnerMergeDecisions(target, source, decisions) {
  const rows = buildPartnerMergeRows(target, source)
  const expectedKeys = new Set(rows.map((row) => row.key))
  if (!decisions || typeof decisions !== 'object' || Object.keys(decisions).some((key) => !expectedKeys.has(key))) throw new Error('Die Zusammenführungsentscheidungen sind nicht mehr aktuell.')
  const patch = {}
  const audit = []
  const lists = {}
  for (const row of rows) {
    const decision = decisions[row.key]
    if (!decision || !['source', 'target', 'omit', 'manual'].includes(decision.resolution) || (row.kind === 'conflict' && !decision.resolution)) throw new Error(`Bitte über ${row.label} entscheiden.`)
    if (typeof decision.value !== 'string' || decision.value.length > 10000) throw new Error(`Ungültiger Ergebniswert für ${row.label}.`)
    const value = decision.resolution === 'source' ? row.sourceValue : decision.resolution === 'target' || decision.resolution === 'omit' && row.kind === 'conflict' ? row.targetValue : decision.resolution === 'omit' ? '' : typedValue(row.path, decision.value)
    if (row.collection) {
      if (!lists[row.collection]) lists[row.collection] = (Array.isArray(target[row.collection]) ? target[row.collection] : []).map((item) => ({ ...item }))
      const items = lists[row.collection]
      const targetIndex = row.targetIndex < 0 ? (items.findIndex((item) => item.__mergeSourceIndex === row.sourceIndex)) : row.targetIndex
      if (targetIndex < 0) {
        if (filled(value)) items.push({ id: source[row.collection][row.sourceIndex]?.id || `merge-${source.id || 'source'}-${row.sourceIndex}`, __mergeSourceIndex: row.sourceIndex, [row.field]: value })
      } else items[targetIndex][row.field] = value
    } else if (String(value ?? '') !== String(row.targetValue ?? '')) assign(patch, row.path, value)
    audit.push({ key: row.key, label: row.label, sourceValue: row.sourceValue ?? null, targetValue: row.targetValue ?? null, resultValue: value, resolution: decision.resolution })
  }
  Object.entries(lists).forEach(([collection, items]) => {
    const cleaned = items.map((item) => { const copy = { ...item }; delete copy.__mergeSourceIndex; return copy })
    patch[collection] = collection === 'contacts' ? deduplicateEmails(cleaned) : cleaned
  })
  return { patch, audit, rows }
}

export function mergeValueWarning(row, value) {
  const entered = String(value ?? '').trim()
  if (!entered) return ''
  if (row.path.toLowerCase().endsWith('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entered)) return 'Die E-Mail-Adresse sieht ungewöhnlich aus.'
  if (['phone', 'mobile', 'fax'].includes(row.path.split('.').at(-1)) && !/^[+\d][\d\s()+./-]{3,}$/.test(entered)) return 'Die Telefonnummer sieht ungewöhnlich aus.'
  if (row.path === 'creditLimit' && (!Number.isFinite(Number(entered)) || Number(entered) < 0)) return 'Das Kreditlimit sieht ungewöhnlich aus.'
  if (row.path === 'creditNoteProcedure' && !['ja', 'nein'].includes(entered.toLocaleLowerCase('de-DE'))) return 'Für das Gutschriftverfahren ist Ja oder Nein üblich.'
  return ''
}
