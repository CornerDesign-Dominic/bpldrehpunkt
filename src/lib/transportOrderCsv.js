export const TRANSPORT_ORDER_REQUIRED_COLUMNS = ['Nummer', 'KundenNr.', 'FZ Name', 'Unternehmer']

const field = (value) => typeof value === 'string' ? value.trim() : ''
const text = (value) => field(value) || null
const dateTimePattern = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/
const isoDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/
const timePattern = /^(\d{1,2}):(\d{2})$/

function normalizeHeader(value) { return field(value).replace(/\s+/g, ' ') }

function detectDelimiter(line) {
  let quoted = false; let commas = 0; let semicolons = 0
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && line[index] === ';') semicolons += 1
    else if (!quoted && line[index] === ',') commas += 1
  }
  return semicolons >= commas ? ';' : ','
}

function parseDelimited(textValue, delimiter) {
  const rows = []; let row = []; let value = ''; let quoted = false
  for (let index = 0; index < textValue.length; index += 1) {
    const character = textValue[index]
    if (character === '"') {
      if (quoted && textValue[index + 1] === '"') { value += '"'; index += 1 } else quoted = !quoted
    } else if (!quoted && character === delimiter) { row.push(value); value = '' } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && textValue[index + 1] === '\n') index += 1
      row.push(value); rows.push(row); row = []; value = ''
    } else value += character
  }
  if (quoted) throw new Error('Die CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.')
  if (value || row.length) { row.push(value); rows.push(row) }
  return rows
}

function toIsoDateTime(value, label, errors) {
  const source = field(value)
  if (!source) return null
  const match = source.match(dateTimePattern) || source.match(isoDateTimePattern)
  if (!match) { errors.push(`${label}: ungültiges Datum oder ungültige Uhrzeit.`); return null }
  const [, first, second, third, hourValue, minuteValue] = match
  const german = Boolean(source.match(dateTimePattern))
  const year = german ? third : first; const month = german ? second : second; const day = german ? first : third
  const hour = hourValue ?? '0'; const minute = minuteValue ?? '0'
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)))
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59) { errors.push(`${label}: ungültiges Datum oder ungültige Uhrzeit.`); return null }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function toWindow(from, until, label, errors) {
  const start = toIsoDateTime(from, `${label} von`, errors)
  const slot = field(until)
  if (!slot) return { from: start, until: null }
  const time = slot.match(timePattern)
  const end = time && start ? `${start.slice(0, 10)}T${String(time[1]).padStart(2, '0')}:${time[2]}` : toIsoDateTime(slot, `${label} bis`, errors)
  if (time && (!start || Number(time[1]) > 23 || Number(time[2]) > 59)) errors.push(`${label} bis: ungültige Uhrzeit.`)
  return { from: start, until: end }
}

function toNumber(value, label, errors, integer = false) {
  const source = field(value)
  if (!source) return null
  const compact = source.replace(/\s/g, '')
  const normalized = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : (/^[-+]?\d{1,3}(\.\d{3})+$/.test(compact) ? compact.replace(/\./g, '') : compact)
  const number = Number(normalized)
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number))) { errors.push(`${label}: ungültiger Zahlenwert.`); return null }
  return number
}

function importData(row, rowNumber) {
  const errors = []
  const externalNumber = field(row.Nummer)
  TRANSPORT_ORDER_REQUIRED_COLUMNS.forEach((column) => { if (!field(row[column])) errors.push(`${column}: Pflichtwert fehlt.`) })
  const loading = toWindow(row['Ankunft (Plan) 1.LD'], row['Slot (Plan) 1.LD'], 'Erste Ladestelle', errors)
  const unloading = toWindow(row['Ankunft (Plan) letzte ED'], row['Slot (Plan) letzte ED'], 'Letzte Entladestelle', errors)
  const imported = {
    externalNumber,
    relation: text(row.Relation),
    customerReference: text(row['Ref.Nr']),
    customer: { debtorNumber: field(row['KundenNr.']), name: field(row['FZ Name']), snapshot: { country: text(row['FZ Land']), postalCode: text(row['FZ PLZ']), city: text(row['FZ Ort']), street: text(row['FZ Strasse']) } },
    carrier: { originalName: field(row.Unternehmer), matchStatus: 'pending' },
    loading: { city: text(row.Ladestellenort), originalText: text(row.Ladestelle), window: loading, note: text(row['Bemerkung 1.LD']), reference: text(row['L/E Referenz erste LD']) },
    unloading: { city: text(row.Entladestellenort), originalText: text(row.Entladestelle), window: unloading, note: text(row['Bemerkung letzte ED']), reference: text(row['L/E Referenz letzte ED']) },
    financial: { costNet: toNumber(row.Kosten, 'Kosten', errors), revenueNet: toNumber(row.Ertrag, 'Ertrag', errors) },
    shipment: { licensePlate: field(row['LKW-Kennz.']) === '.' ? null : text(row['LKW-Kennz.']), weightKg: toNumber(row.Gewicht, 'Gewicht', errors), loadingMeters: toNumber(row.LDM, 'LDM', errors), vehicleType: text(row.Fahrzeugart), packages: toNumber(row.Kolli, 'Kolli', errors, true) },
    contacts: { carrierForOrder: text(row['Info-1']), carrierStandardEmail: text(row['Standard E-Mailadresse UTN']), customerForOrder: text(row['Im Auftrag']), customerStandardEmail: text(row['Standard E-Mailadresse Frachtzahler']) },
    dispatch: { sentAt: toIsoDateTime(row['Mailversanddatum der TA'], 'Mailversanddatum der TA', errors), sentTo: text(row['Mail TA zuletzt versendet an']) },
  }
  return { rowNumber, externalNumber, imported, errors }
}

export function parseTransportOrderCsv(csvText) {
  const source = String(csvText ?? '').replace(/^\uFEFF/, '')
  const firstLine = source.split(/\r?\n/).find((line) => line.trim()) || ''
  if (!firstLine) return { rows: [], missingHeaders: TRANSPORT_ORDER_REQUIRED_COLUMNS, headers: [] }
  const rows = parseDelimited(source, detectDelimiter(firstLine)).filter((row) => row.some((value) => field(value)))
  const headers = (rows.shift() || []).map(normalizeHeader)
  const missingHeaders = TRANSPORT_ORDER_REQUIRED_COLUMNS.filter((column) => !headers.includes(column))
  const parsedRows = rows.map((values, index) => importData(Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ''])), index + 2))
  const occurrences = new Map()
  parsedRows.forEach((row) => { if (row.externalNumber) occurrences.set(row.externalNumber, (occurrences.get(row.externalNumber) || 0) + 1) })
  parsedRows.forEach((row) => { if (row.externalNumber && occurrences.get(row.externalNumber) > 1) row.errors.push('Nummer kommt in dieser Datei mehrfach vor.') })
  return { headers, missingHeaders, rows: parsedRows }
}

export function transportOrderFingerprint(imported) { return JSON.stringify(imported) }
