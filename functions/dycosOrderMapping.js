import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

// The source connector returns entire SQL rows. Only explicitly selected business
// fields may cross this boundary; raw partner rows contain credentials and bank data.
export class DycosMappingError extends Error {
  constructor(field) {
    super(`Die DyCoS-Antwort enthält ungültige oder widersprüchliche Daten (${field}).`)
    this.name = 'DycosMappingError'
    this.code = 'INVALID_SOURCE_DATA'
    this.field = field
  }
}

const fail = (field) => { throw new DycosMappingError(field) }
const missing = (value) => value === undefined || value === null || value === ''
const objectKeys = ['auftrag', 'kunde', 'tour', 'unternehmerstamm', 'fahrzeugart', 'relation', 'zahlungsbedingungKunde', 'zahlungsbedingungUnternehmer']
const arrayKeys = ['ladeEntladestellen', 'auftragspreise', 'tourkosten', 'fakturaZeilen', 'fakturaKopf', 'LadeEntladestellen2']
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype

export const dycosUnmappedImportPaths = Object.freeze([
  'loading.reference',
  'unloading.reference',
  'contacts.carrierForOrder',
  'contacts.carrierStandardEmail',
  'contacts.customerStandardEmail',
])

export function preserveDycosUnmappedFields(previous, next) {
  const imported = structuredClone(next)
  const preservedPaths = []
  for (const path of dycosUnmappedImportPaths) {
    const [section, key] = path.split('.')
    const value = previous?.[section]?.[key]
    if (typeof value === 'string' && value.trim()) {
      if (value.length > 4000) fail(path)
      imported[section][key] = value
      preservedPaths.push(path)
    }
  }
  // CSV quantities are order totals, not quantities of a particular station.
  // Preserve an existing total only when the new source provides no value.
  // An explicitly supplied zero remains a real source value.
  for (const field of ['weightKg', 'packages', 'loadingMeters']) {
    const value = previous?.shipment?.[field]
    if (imported.shipment?.[field] === null && typeof value === 'number' && Number.isFinite(value)) {
      imported.shipment[field] = value
      preservedPaths.push(`shipment.${field}`)
    }
  }
  return { imported, preservedPaths }
}

function sourceText(value, field) {
  if (missing(value)) return null
  if (typeof value !== 'string' || value.length > 4000) fail(field)
  return value.trim() || null
}

function sourceNumber(value, field, { integer = false, positive = false, fallback = null } = {}) {
  if (missing(value) || (typeof value === 'string' && !value.trim())) return fallback
  let normalized = value
  if (typeof value === 'string') {
    normalized = value.trim().replace(/\s/g, '')
    if (normalized.includes(',')) {
      if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(normalized)) fail(field)
      normalized = normalized.replace(/\./g, '').replace(',', '.')
    }
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) fail(field)
    normalized = Number(normalized)
  }
  if (typeof normalized !== 'number' || !Number.isFinite(normalized) || Math.abs(normalized) > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(normalized)) || (positive && normalized < 0)) fail(field)
  return normalized
}

function sourceId(value, field, required = false) {
  const number = sourceNumber(value, field, { integer: true, positive: true })
  if (number === null || number === 0) {
    if (required) fail(field)
    return null
  }
  return String(number)
}

function businessNumber(value, field) {
  if (missing(value)) return ''
  if (typeof value === 'string') {
    const result = value.trim()
    if (!/^\d{1,120}$/.test(result)) fail(field)
    return /^0+$/.test(result) ? '' : result
  }
  const number = sourceNumber(value, field, { integer: true, positive: true })
  return number === 0 ? '' : String(number)
}

function localDateTime(value, field) {
  if (missing(value)) return null
  if (typeof value !== 'string') fail(field)
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T| )(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,7})?)?(?:Z|[+-]\d{2}:\d{2})?$/)
  if (!match) fail(field)
  const [, year, month, day, hour, minute, second = '0'] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) fail(field)
  // Connector Z suffixes do not authorize shifting these operational local clocks.
  return `${year}-${month}-${day}T${hour}:${minute}`
}

function plannedDate(value, field) {
  const result = localDateTime(value, field)
  return result && Number(result.slice(0, 4)) > 1900 ? result : null
}

function slotClock(value, field) {
  const result = localDateTime(value, field)
  return result?.slice(11) || null
}

function verifyObjectLink(row, expectedId, field) {
  if (!row) return
  const actualId = sourceId(row.ID, `${field}.ID`, true)
  if (actualId !== expectedId) fail(`${field}.ID`)
}

function address(row, field) {
  return {
    company: sourceText(row?.Firma, `${field}.Firma`),
    street: sourceText(row?.Strasse, `${field}.Strasse`),
    postalCode: sourceText(row?.PLZ, `${field}.PLZ`),
    city: sourceText(row?.Ort, `${field}.Ort`),
    country: sourceText(row?.Land, `${field}.Land`),
  }
}

function addressText(value) {
  return [value.company, value.street, [value.country, value.postalCode, value.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null
}

function stopView(stop) {
  return {
    city: stop?.address.city || null,
    originalText: stop ? addressText(stop.address) : null,
    window: stop?.window || { from: null, until: null },
    note: stop?.note || null,
    // LieferscheinNr and Zustellinformation are not confirmed equivalents of
    // the old L/E reference column. Preserve them separately in stops instead.
    reference: null,
  }
}

function plate(...values) {
  const parts = values.map((value, index) => sourceText(value, `tour.licensePlate.${index}`)).filter((value) => value && /[\p{L}\p{N}]/u.test(value))
  return parts.filter((part, index) => !parts.slice(0, index).some((previous) => previous.localeCompare(part, 'de', { sensitivity: 'accent' }) === 0)).join(' / ') || null
}

function sourceBoolean(value, field) {
  if (missing(value)) return null
  if (typeof value === 'boolean') return value
  if (value === 0 || value === 1) return value === 1
  fail(field)
}

function pricePositions(rows, field) {
  const positions = rows.map((row) => ({
    sourceCounter: sourceId(row.Zaehler, `${field}.Zaehler`),
    sequence: sourceNumber(row.AuftragPos ?? row.TourenPos, `${field}.sequence`, { integer: true, positive: true }),
    serviceId: sourceId(row.LeistungID, `${field}.LeistungID`),
    stationSourceId: sourceId(row.LadeEntladestellenID, `${field}.LadeEntladestellenID`),
    description: sourceText(row.LeistungText, `${field}.LeistungText`),
    quantity: sourceNumber(row.Menge, `${field}.Menge`),
    unit: sourceText(row.Einheit, `${field}.Einheit`),
    unitPriceNet: sourceNumber(row.Preis, `${field}.Preis`, { fallback: 0 }),
    amountNet: sourceNumber(row.Gesamt, `${field}.Gesamt`, { fallback: 0 }),
    currency: 'EUR',
    // Technical references only. Document types/issuers remain unclassified
    // until the meaning of the DyCoS document codes has been confirmed.
    documentSourceId: sourceId(row.RechKopfID, `${field}.RechKopfID`),
    documentLineSourceId: sourceId(row.FakturaPosID, `${field}.FakturaPosID`),
  }))
  // SQL connector IDs change on each request. Use business fields and preserve
  // duplicate positions rather than treating two identical charges as one.
  positions.sort((left, right) => (left.sequence ?? -1) - (right.sequence ?? -1) || JSON.stringify(left).localeCompare(JSON.stringify(right), 'en'))
  const duplicates = new Map()
  return positions.map((position) => {
    const fingerprint = createHash('sha256').update(JSON.stringify(position)).digest('hex').slice(0, 24)
    const occurrence = (duplicates.get(fingerprint) || 0) + 1
    duplicates.set(fingerprint, occurrence)
    return { id: `${field}-${fingerprint}-${occurrence}`, ...position }
  })
}

export function mapDycosOrder(payload, requestedTa) {
  if (typeof requestedTa !== 'string' || !/^\d{1,120}$/.test(requestedTa)) fail('taNummer')
  if (!plainObject(payload)) fail('Antwort')
  for (const key of objectKeys) {
    if (!Object.hasOwn(payload, key) || (payload[key] !== null && !plainObject(payload[key]))) fail(key)
  }
  for (const key of arrayKeys) {
    if (!Array.isArray(payload[key]) || payload[key].length > 2000 || payload[key].some((entry) => !plainObject(entry))) fail(key)
  }
  const order = payload.auftrag
  if (!order || String(order.Nummer) !== requestedTa) fail('auftrag.Nummer')
  const orderId = sourceId(order.ID, 'auftrag.ID', true)
  const tourId = sourceId(order.TourenID, 'auftrag.TourenID')
  const customerId = sourceId(order.FrachtzahlerID, 'auftrag.FrachtzahlerID')
  const carrierId = sourceId(payload.tour?.UnternehmerID, 'tour.UnternehmerID')
  verifyObjectLink(payload.kunde, customerId, 'kunde')
  verifyObjectLink(payload.tour, tourId, 'tour')
  verifyObjectLink(payload.unternehmerstamm, carrierId, 'unternehmerstamm')
  verifyObjectLink(payload.fahrzeugart, sourceId(order.FahrzeugartID, 'auftrag.FahrzeugartID'), 'fahrzeugart')
  verifyObjectLink(payload.relation, sourceId(order.RelationsID, 'auftrag.RelationsID'), 'relation')
  verifyObjectLink(payload.zahlungsbedingungKunde, sourceId(payload.kunde?.Zahlungsbedingung, 'kunde.Zahlungsbedingung'), 'zahlungsbedingungKunde')
  verifyObjectLink(payload.zahlungsbedingungUnternehmer, sourceId(payload.unternehmerstamm?.Zahlungsbedingung, 'unternehmerstamm.Zahlungsbedingung'), 'zahlungsbedingungUnternehmer')

  const warnings = new Set()
  const slots = new Map()
  for (const row of payload.LadeEntladestellen2) {
    const id = sourceId(row.LadeEntladestellenID, 'LadeEntladestellen2.LadeEntladestellenID', true)
    if (slots.has(id)) fail('LadeEntladestellen2.duplicateStation')
    slots.set(id, row)
  }
  const stopIds = new Set()
  const stops = payload.ladeEntladestellen.map((row) => {
    const id = sourceId(row.ID, 'ladeEntladestellen.ID', true)
    if (stopIds.has(id) || sourceId(row.AuftragsID, 'ladeEntladestellen.AuftragsID', true) !== orderId) fail('ladeEntladestellen.ID')
    stopIds.add(id)
    const type = sourceText(row.Lade_Entladestelle, 'ladeEntladestellen.Lade_Entladestelle')
    const from = plannedDate(row.Ankunft, 'ladeEntladestellen.Ankunft')
    const clock = slotClock(slots.get(id)?.Slotzeit, 'LadeEntladestellen2.Slotzeit')
    let until = from && clock ? `${from.slice(0, 10)}T${clock}` : null
    if (clock === '00:00') { warnings.add('SLOT_MIDNIGHT_UNCONFIRMED'); until = null }
    if (until && until < from) { warnings.add('SLOT_OVERNIGHT_UNCONFIRMED'); until = null }
    if (type && type !== 'L' && type !== 'E') warnings.add('UNKNOWN_STOP_TYPE')
    return {
      sourceId: id,
      sequence: sourceNumber(row.Zeile_In_Auftrag, 'ladeEntladestellen.Zeile_In_Auftrag', { integer: true, positive: true }),
      type: type === 'L' ? 'loading' : type === 'E' ? 'unloading' : 'unknown',
      address: address(row, 'ladeEntladestellen'),
      window: { from, until },
      slotUntilTime: clock,
      note: sourceText(row.Bemerkung, 'ladeEntladestellen.Bemerkung'),
      deliveryInformation: sourceText(row.Zustellinformation, 'ladeEntladestellen.Zustellinformation'),
      deliveryNoteNumber: sourceText(row.LieferscheinNr, 'ladeEntladestellen.LieferscheinNr'),
      cargo: {
        weightKg: sourceNumber(row.Gewicht, 'ladeEntladestellen.Gewicht', { positive: true }),
        packages: sourceNumber(row.Kolli, 'ladeEntladestellen.Kolli', { integer: true, positive: true }),
        loadingMeters: sourceNumber(row.Lademeter, 'ladeEntladestellen.Lademeter', { positive: true }),
      },
      palletExchange: sourceBoolean(row.Palettentausch, 'ladeEntladestellen.Palettentausch'),
    }
  }).sort((left, right) => (left.sequence ?? -1) - (right.sequence ?? -1) || Number(left.sourceId) - Number(right.sourceId))
  for (const id of slots.keys()) if (!stopIds.has(id)) fail('LadeEntladestellen2.LadeEntladestellenID')

  const sum = (rows, field, requireOrder = true) => {
    let total = 0
    for (const row of rows) {
      const rowOrderId = sourceId(row.AuftragID, `${field}.AuftragID`)
      if (requireOrder && rowOrderId !== orderId) fail(`${field}.AuftragID`)
      if (!requireOrder) {
        if (sourceId(row.TourenID, `${field}.TourenID`, true) !== tourId) fail(`${field}.TourenID`)
        if (rowOrderId !== orderId) { warnings.add('TOUR_COSTS_NOT_ASSIGNED_TO_ORDER'); continue }
      }
      total += sourceNumber(row.Gesamt, `${field}.Gesamt`, { fallback: 0 })
      if (!Number.isFinite(total) || Math.abs(total) > 1e12) fail(`${field}.Gesamt`)
    }
    return Math.round((total + Number.EPSILON) * 100) / 100
  }
  const revenueNet = sum(payload.auftragspreise, 'auftragspreise')
  const costNet = sum(payload.tourkosten, 'tourkosten', false)
  const revenuePositions = pricePositions(payload.auftragspreise, 'revenue')
  const costPositions = pricePositions(payload.tourkosten.filter((row) => sourceId(row.AuftragID, 'tourkosten.AuftragID') === orderId), 'cost')
  for (const row of payload.fakturaZeilen) if (sourceId(row.AuftragID, 'fakturaZeilen.AuftragID', true) !== orderId) fail('fakturaZeilen.AuftragID')
  const customerAddress = address(payload.kunde, 'kunde')
  const carrierAddress = address(payload.unternehmerstamm, 'unternehmerstamm')
  delete customerAddress.company
  delete carrierAddress.company
  const imported = {
    externalNumber: requestedTa,
    relation: sourceText(payload.relation?.Bezeichnung, 'relation.Bezeichnung'),
    customerReference: sourceText(order.Referenznummer, 'auftrag.Referenznummer'),
    customer: { debtorNumber: businessNumber(payload.kunde?.Debitorennummer, 'kunde.Debitorennummer'), name: sourceText(payload.kunde?.Firma, 'kunde.Firma') || '', snapshot: customerAddress },
    carrier: { originalName: sourceText(payload.unternehmerstamm?.Bezeichnung, 'unternehmerstamm.Bezeichnung') || '', creditorNumber: businessNumber(payload.unternehmerstamm?.Kreditorennummer, 'unternehmerstamm.Kreditorennummer'), snapshot: carrierAddress, matchStatus: 'pending' },
    loading: stopView(stops.find((stop) => stop.type === 'loading')),
    unloading: stopView(stops.filter((stop) => stop.type === 'unloading').at(-1)),
    financial: { revenueNet, costNet, currency: 'EUR', revenuePositions, costPositions },
    shipment: { licensePlate: plate(payload.tour?.LKWNummer, payload.tour?.Trailer), weightKg: sourceNumber(order.Gewicht, 'auftrag.Gewicht', { positive: true }), loadingMeters: sourceNumber(order.Lademeter, 'auftrag.Lademeter', { positive: true }), packages: sourceNumber(order.AnzahlKolli, 'auftrag.AnzahlKolli', { integer: true, positive: true }), vehicleType: sourceText(payload.fahrzeugart?.Bezeichnung, 'fahrzeugart.Bezeichnung') },
    // Standard-address selection and Info-1 equivalence have not been confirmed.
    contacts: { carrierForOrder: null, carrierStandardEmail: null, customerForOrder: sourceText(order.ImAuftrag, 'auftrag.ImAuftrag'), customerStandardEmail: null },
    dispatch: { sentAt: plannedDate(payload.tour?.TAPerMailDatum, 'tour.TAPerMailDatum'), sentTo: sourceText(payload.tour?.TAPerMailVersendetAn, 'tour.TAPerMailVersendetAn') },
    stops,
    source: { system: 'dycos', schemaVersion: 2, orderId, tourId, customerId, carrierId, createdBy: sourceText(order.BearbeiterErfassung, 'auftrag.BearbeiterErfassung'), warningCodes: [...warnings].sort() },
  }
  if (Buffer.byteLength(JSON.stringify(imported), 'utf8') > 256 * 1024) fail('Antwortumfang')
  return imported
}
