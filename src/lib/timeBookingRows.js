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

function creationMethod(event) {
  return ['live', 'offline'].includes(event?.source) ? 'Gestempelt' : event?.source === 'correction' ? 'Manuell erfasst' : 'Nicht erfasst'
}

// A version is an effective state, not a save operation. Unchanged saves are
// kept separately so thirty states always mean one current and 29 earlier rows.
export function bookingVersions(row) {
  const versions = []
  const saves = []
  for (const change of row.changes) {
    if (change.unchanged) { saves.push(change); continue }
    const previous = versions.at(-1)
    if (change.before && (!previous || !same(previous.event, change.before))) {
      versions.push({ id: `before-${change.id}`, event: change.before, method: creationMethod(change.before), client: change.before.client, createdAt: change.before.receivedAt || null, changed: {} })
    }
    versions.push({
      ...change,
      event: change.after || null,
      displayEvent: change.after || change.before,
      method: change.kind === 'stamp' ? 'Gestempelt' : !change.after ? 'Gelöscht' : !change.before ? 'Manueller Nachtrag' : 'Korrektur',
      client: change.kind === 'stamp' ? change.after?.client : change.client,
      changed: { at: Boolean(change.before && change.after && change.before.at !== change.after.at), type: Boolean(change.before && change.after && change.before.type !== change.after.type) },
    })
  }
  const latest = versions.at(-1)
  const matchesCurrent = latest && (row.deleted ? !latest.event : same(latest.event, row.event))
  const current = matchesCurrent ? latest : { id: `current-${row.id}`, event: row.deleted ? null : row.event, displayEvent: row.event, method: row.deleted ? 'Gelöscht' : creationMethod(row.event), client: row.event.client, createdAt: row.event.receivedAt || null, changed: {} }
  return { current, previous: (matchesCurrent ? versions.slice(0, -1) : versions).reverse(), saves: saves.reverse() }
}

export function bookingClient(value) {
  return value === 'web' ? 'Web' : value === 'mobile' ? 'Handy' : 'Nicht erfasst'
}
