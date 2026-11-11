const same = (a, b) => a?.type === b?.type && a?.at === b?.at
const events = value => Array.isArray(value) ? value : value ? [value] : []

// Stable event IDs connect the current booking to every recorded change,
// including deleted bookings and edits which were subsequently reverted.
export function timeBookingRows(days = [], history = []) {
  const rows = new Map()
  for (const day of days) {
    for (const event of day.events || []) rows.set(`${day.date}/${event.id}`, { id: `${day.date}/${event.id}`, date: day.date, event, deleted: false, changes: [] })
  }
  const ordered = [...history].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || (a.id || '').localeCompare(b.id || ''))
  for (const entry of ordered) {
    const before = events(entry.before)
    const after = events(entry.after)
    for (const eventId of new Set([...before, ...after].map(event => event.id))) {
      const previous = before.find(event => event.id === eventId)
      const next = after.find(event => event.id === eventId)
      const unchanged = Boolean(previous && next && same(previous, next))
      const key = `${entry.date}/${eventId}`
      if (!rows.has(key)) rows.set(key, { id: key, date: entry.date, event: next || previous, deleted: true, changes: [] })
      if (rows.get(key).deleted) rows.get(key).event = next || previous
      rows.get(key).changes.push({ ...entry, before: previous, after: next, unchanged, method: entry.kind === 'stamp' ? 'Originalbuchung' : unchanged ? 'Unverändert gespeichert' : !previous ? 'Manuell nachgetragen' : !next ? 'Gelöscht' : 'Geändert' })
    }
  }
  return [...rows.values()].sort((a, b) => b.date.localeCompare(a.date) || a.event.at.localeCompare(b.event.at) || a.id.localeCompare(b.id))
}

export function bookingStatus(row) {
  const changes = row.changes.filter(change => !change.unchanged)
  const latest = changes.at(-1)
  const first = changes[0]
  const origin = first?.kind === 'stamp' || (!first && ['live', 'offline'].includes(row.event.source)) ? 'Originalbuchung' : first && !first.before ? 'Manueller Nachtrag' : 'Nicht eindeutig erfasst'
  const edited = changes.some(change => change.before && change.after)
  const status = row.deleted ? 'deleted' : edited ? 'edited' : origin === 'Manueller Nachtrag' ? 'manual' : origin === 'Originalbuchung' ? 'original' : row.event.source === 'correction' ? 'manual-unknown' : 'unknown'
  const labels = { deleted: 'Gelöscht', edited: 'Geändert', manual: 'Manuell nachgetragen', original: 'Original', 'manual-unknown': 'Manuell erfasst', unknown: 'Nicht eindeutig erfasst' }
  return { status, label: labels[status], origin, latest, saved: row.changes.at(-1), edits: changes.filter(change => change.before && change.after).length, unchangedSaves: row.changes.filter(change => change.unchanged).length }
}

export function bookingClient(value) {
  return value === 'web' ? 'Web' : value === 'mobile' ? 'Handy' : 'Nicht erfasst'
}
