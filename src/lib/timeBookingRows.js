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
      if (previous && next && same(previous, next)) continue
      const key = `${entry.date}/${eventId}`
      if (!rows.has(key)) rows.set(key, { id: key, date: entry.date, event: next || previous, deleted: true, changes: [] })
      if (rows.get(key).deleted) rows.get(key).event = next || previous
      rows.get(key).changes.push({ ...entry, before: previous, after: next, method: entry.kind === 'stamp' ? 'Schaltfläche' : !previous ? 'Nachtrag' : !next ? 'Gelöscht' : 'Bearbeitet' })
    }
  }
  return [...rows.values()].sort((a, b) => b.date.localeCompare(a.date) || a.event.at.localeCompare(b.event.at) || a.id.localeCompare(b.id))
}

export function bookingClient(value) {
  return value === 'web' ? 'Web' : value === 'mobile' ? 'Handy' : 'Nicht erfasst'
}
