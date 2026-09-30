const whitespace = /\s+/g
const plannedDateTimePaths = new Set(['loading.window.from', 'loading.window.until', 'unloading.window.from', 'unloading.window.until', 'dispatch.sentAt'])
const numericPaths = new Set(['financial.revenueNet', 'financial.costNet', 'shipment.packages', 'shipment.weightKg', 'shipment.loadingMeters'])

const fields = Object.freeze([
  ['relation', 'Mitarbeiterrelation'],
  ['customerReference', 'Kundenreferenz'],
  ['customer.debtorNumber', 'Debitorennummer Kunde'],
  ['customer.name', 'Kunde'],
  ['customer.snapshot.street', 'Kundenadresse – Straße'],
  ['customer.snapshot.postalCode', 'Kundenadresse – PLZ'],
  ['customer.snapshot.city', 'Kundenadresse – Ort'],
  ['customer.snapshot.country', 'Kundenadresse – Land'],
  ['carrier.originalName', 'Unternehmer'],
  ['loading.originalText', 'Adresse Ladestelle', { routeRelevant: true }],
  ['loading.city', 'Ort Ladestelle', { routeRelevant: true }],
  ['loading.window.from', 'Termin Ladestelle – von', { scheduleRelevant: true }],
  ['loading.window.until', 'Termin Ladestelle – bis', { scheduleRelevant: true }],
  ['loading.note', 'Bemerkung Ladestelle'],
  ['loading.reference', 'Referenz Ladestelle'],
  ['unloading.originalText', 'Adresse Entladestelle', { routeRelevant: true }],
  ['unloading.city', 'Ort Entladestelle', { routeRelevant: true }],
  ['unloading.window.from', 'Termin Entladestelle – von', { scheduleRelevant: true }],
  ['unloading.window.until', 'Termin Entladestelle – bis', { scheduleRelevant: true }],
  ['unloading.note', 'Bemerkung Entladestelle'],
  ['unloading.reference', 'Referenz Entladestelle'],
  ['financial.revenueNet', 'Ertrag netto'],
  ['financial.costNet', 'Kosten netto'],
  ['shipment.licensePlate', 'Import-Kennzeichen'],
  ['shipment.vehicleType', 'Fahrzeugart'],
  ['shipment.packages', 'Kolli'],
  ['shipment.weightKg', 'Gewicht'],
  ['shipment.loadingMeters', 'Lademeter'],
  ['contacts.customerStandardEmail', 'Standard-E-Mail Kunde'],
  ['contacts.customerForOrder', 'Info Kunde im Auftrag'],
  ['contacts.carrierStandardEmail', 'Standard-E-Mail Unternehmer'],
  ['contacts.carrierForOrder', 'Info Unternehmer im Auftrag'],
  ['dispatch.sentAt', 'TA-Versandzeitpunkt'],
  ['dispatch.sentTo', 'TA zuletzt versendet an'],
])

function valueAtPath(value, path) {
  return path.split('.').reduce((current, segment) => current && typeof current === 'object' ? current[segment] : undefined, value)
}

function normalizedText(value, path) {
  const normalized = value.normalize('NFC').replace(/\u00a0/g, ' ').replace(whitespace, ' ').trim()
  const dateTime = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (plannedDateTimePaths.has(path) && dateTime) return `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}T${dateTime[4].padStart(2, '0')}:${dateTime[5]}`
  if (numericPaths.has(path)) {
    const compact = normalized.replace(whitespace, '')
    const numeric = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : (/^[-+]?\d{1,3}(\.\d{3})+$/.test(compact) ? compact.replace(/\./g, '') : compact)
    const parsed = Number(numeric)
    if (Number.isFinite(parsed)) return parsed
  }
  return /(?:Email|sentTo)$/.test(path) ? normalized.toLocaleLowerCase('de-DE') : normalized
}

export function normalizeTransportOrderImportValue(value, path = '') {
  if (typeof value === 'string') return normalizedText(value, path)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.map((entry, index) => normalizeTransportOrderImportValue(entry, `${path}.${index}`))
  if (typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeTransportOrderImportValue(value[key], path ? `${path}.${key}` : key)]))
}

export function transportOrderImportFingerprint(imported) {
  return JSON.stringify(fields.map(([path]) => [path, normalizeTransportOrderImportValue(valueAtPath(imported, path), path)]))
}

export function transportOrderImportChanges(previousImported, nextImported) {
  return fields.flatMap(([path, label, options = {}]) => {
    const oldValue = normalizeTransportOrderImportValue(valueAtPath(previousImported, path), path)
    const newValue = normalizeTransportOrderImportValue(valueAtPath(nextImported, path), path)
    return JSON.stringify(oldValue) === JSON.stringify(newValue) ? [] : [{ path, label, oldValue, newValue, ...options }]
  })
}

export function loadingScheduleMovedEarlier(previousImported, nextImported) {
  const before = normalizeTransportOrderImportValue(valueAtPath(previousImported, 'loading.window.from'), 'loading.window.from')
  const after = normalizeTransportOrderImportValue(valueAtPath(nextImported, 'loading.window.from'), 'loading.window.from')
  return typeof before === 'string' && typeof after === 'string' && after < before
}
