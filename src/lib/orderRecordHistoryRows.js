import { transportOrderHistoryRows } from './transportOrderHistoryPresentation.js'
import { recordHistoryTime } from './recordHistoryPresentation.js'

export function orderRecordHistoryTime(value) {
  const time = recordHistoryTime(value)
  if (time) return time
  return Number.isFinite(value?.seconds) ? value.seconds * 1000 : 0
}

const refreshDate = (entry) => entry.completedAt || entry.startedAt || entry.createdAt

// The underlying presentation contract groups import changes. Flatten only
// their field rows; retain creation, legacy and no-change refresh records.
export function orderRecordHistoryRows(order, changes = [], refreshes = []) {
  const rows = transportOrderHistoryRows(order, changes).flatMap((entry, entryIndex) => {
    const key = entry.id || `history-${entryIndex}`
    const timestamp = entry.createdAt || entry.recordedAt || entry.eventTime
    if (entry.creation || entry.legacy || !entry.changes?.length) return [{ id: `change-${key}`, type: entry.creation ? 'creation' : 'legacy', entry, timestamp }]
    return entry.changes.map((change, index) => ({ id: `change-${key}-${index}`, type: 'change', entry, change, timestamp }))
  })
  const seen = new Set()
  for (const entry of refreshes) {
    if (entry.id && seen.has(entry.id)) continue
    if (entry.id) seen.add(entry.id)
    rows.push({ id: `refresh-${entry.id || rows.length}`, type: 'refresh', entry, timestamp: refreshDate(entry) })
  }
  return rows.sort((left, right) => orderRecordHistoryTime(right.timestamp) - orderRecordHistoryTime(left.timestamp))
}

// Do not hide duration reports, events without changedFields or unknown types.
export function trackingRecordHistoryRows(events = []) {
  return events.map((entry, index) => ({ id: entry.id || `tracking-${index}`, entry, timestamp: entry.eventTime || entry.recordedAt, recordedAt: entry.recordedAt }))
    .sort((left, right) => orderRecordHistoryTime(right.recordedAt || right.timestamp) - orderRecordHistoryTime(left.recordedAt || left.timestamp))
}
