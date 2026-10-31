export function resolveVisibleCalendarIds(availableCalendars, current, storedValue) {
  const availableIds = availableCalendars.map((calendar) => calendar.id)
  let source = current
  if (!Array.isArray(source)) {
    try { source = storedValue === null ? null : JSON.parse(storedValue) } catch { source = null }
  }
  if (!Array.isArray(source)) return availableIds
  // An intentionally empty selection differs from a missing preference.
  if (!source.length) return []
  const valid = [...new Set(source.filter((id) => typeof id === 'string' && availableIds.includes(id)))]
  return valid.length ? valid : availableIds
}
