import { recordHistoryTime, recordHistoryValue } from './recordHistoryPresentation.js'

const stopFields = [
  ['type', 'Art'], ['address.company', 'Firma'], ['address.street', 'Straße'], ['address.postalCode', 'PLZ'], ['address.city', 'Ort'], ['address.country', 'Land'],
  ['window.from', 'Von'], ['window.until', 'Bis'], ['slotUntilTime', 'Bis-Uhrzeit'], ['note', 'Bemerkung'], ['deliveryInformation', 'Zustellinformation'], ['deliveryNoteNumber', 'Lieferscheinnummer'],
  ['cargo.weightKg', 'Gewicht'], ['cargo.packages', 'Kolli'], ['cargo.loadingMeters', 'Lademeter'], ['palletExchange', 'Palettentausch'],
]
const positionFields = [['description', 'Leistung'], ['quantity', 'Menge'], ['unit', 'Einheit'], ['unitPriceNet', 'Einzelpreis netto'], ['amountNet', 'Gesamt netto']]
const at = (data, path) => path.split('.').reduce((value, key) => value?.[key], data)
const blank = (value) => value === undefined || value === null || value === '' ? null : value
function scalar(path, label, before, after) {
  const oldValue = blank(before); const newValue = blank(after)
  return JSON.stringify(oldValue) === JSON.stringify(newValue) ? [] : [{ path, label, oldValue, newValue }]
}
function itemChanges(entry, fields, kind) {
  const left = Array.isArray(entry.oldValue) ? entry.oldValue : []
  const right = Array.isArray(entry.newValue) ? entry.newValue : []
  const key = (item, index) => String(kind === 'Station' ? item.sourceId ?? index : item.sourceCounter ?? item.sequence ?? index)
  const indexed = (items) => {
    const occurrences = new Map()
    return new Map(items.map((item, index) => {
      const base = key(item, index); const occurrence = (occurrences.get(base) || 0) + 1
      occurrences.set(base, occurrence)
      return [`${base}-${occurrence}`, item]
    }))
  }
  const before = indexed(left); const after = indexed(right)
  return [...new Set([...before.keys(), ...after.keys()])].flatMap((id, index) => {
    const oldItem = before.get(id); const newItem = after.get(id)
    const number = newItem?.sequence ?? oldItem?.sequence ?? index + 1
    return fields.flatMap(([field, label]) => scalar(`${entry.field}.${id}.${field}`, `${kind} · ${number} · ${label}`, at(oldItem, field), at(newItem, field)))
  })
}

function changesFor(entry) {
  if (Array.isArray(entry.metadata?.changes)) return entry.metadata.changes
  if (!Object.hasOwn(entry, 'oldValue') && !Object.hasOwn(entry, 'newValue')) return null
  if (entry.field === 'source') return scalar('source.createdBy', 'Erfassender Bearbeiter (DyCoS)', entry.oldValue?.createdBy, entry.newValue?.createdBy)
  if (entry.field === 'stops') return itemChanges(entry, stopFields, 'Station')
  if (entry.field === 'financial.revenuePositions') return itemChanges(entry, positionFields, 'Ertragsposition')
  if (entry.field === 'financial.costPositions') return itemChanges(entry, positionFields, 'Kostenposition')
  return scalar(entry.field || entry.id, entry.fieldLabel || entry.field || 'Auftragsdaten', entry.oldValue, entry.newValue)
}

export function transportOrderHistoryRows(order, history) {
  const creations = history.filter((entry) => entry.eventType === 'transport_order_created' || entry.action === 'created')
  const creation = creations.sort((a, b) => recordHistoryTime(a.recordedAt || a.createdAt) - recordHistoryTime(b.recordedAt || b.createdAt))[0] || {
    id: 'order-created', createdAt: order?.createdAt, createdByName: order?.createdByName, createdByUserId: order?.createdBy,
  }
  const rows = []; const groups = new Map()
  for (const entry of history) {
    if (creations.includes(entry)) continue
    const changes = changesFor(entry)
    if (changes && !changes.length) continue
    const row = { ...entry, createdAt: entry.recordedAt || entry.createdAt || entry.eventTime, changes, legacy: !changes }
    const groupKey = changes ? entry.importRunId || entry.metadata?.operationId : null
    if (!groupKey) rows.push(row)
    else if (groups.has(groupKey)) groups.get(groupKey).changes.push(...changes)
    else { const grouped = { ...row, changes: [...changes] }; groups.set(groupKey, grouped); rows.push(grouped) }
  }
  if (creations.length || order?.createdAt) rows.push({ ...creation, createdAt: creation.recordedAt || creation.createdAt, creation: true, changes: [] })
  return rows.sort((a, b) => recordHistoryTime(b.createdAt) - recordHistoryTime(a.createdAt))
}

export function transportOrderHistoryValue(value, language = 'de', change = {}) {
  if (value === null || value === undefined || value === '') return '—'
  const locale = language === 'en' ? 'en-GB' : 'de-DE'
  if (typeof value === 'number') {
    if (/financial\.(revenueNet|costNet)$|\.(unitPriceNet|amountNet)$/.test(change.path)) return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value)
    return recordHistoryValue(value, language) + (/weightKg$/.test(change.path) ? ' kg' : '')
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    const [day, time] = value.split('T'); const [year, month, date] = day.split('-')
    return language === 'en' ? `${date}/${month}/${year}, ${time.slice(0, 5)}` : `${date}.${month}.${year}, ${time.slice(0, 5)}`
  }
  if (/\.type$/.test(change.path)) return ({ loading: language === 'en' ? 'Loading point' : 'Ladestelle', unloading: language === 'en' ? 'Unloading point' : 'Entladestelle', unknown: language === 'en' ? 'Unknown' : 'Unbekannt' })[value] || value
  return recordHistoryValue(value, language)
}
