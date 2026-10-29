export function recordHistoryTime(value) {
  const date = value?.toDate?.() || (value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null)
  return date && Number.isFinite(date.getTime()) ? date.getTime() : 0
}

export function recordHistoryActor(entry) {
  return entry.createdByName || entry.actor?.name || entry.recordedByName || entry.createdByUserId || entry.recordedBy || entry.actor?.userId || entry.actor?.id || 'Nicht protokolliert'
}


export function recordHistoryValue(value, language = 'de') {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein'
  if (Array.isArray(value)) return value.map((item) => recordHistoryValue(item, language)).join(', ') || '—'
  if (typeof value === 'number') return new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'de-DE').format(value)
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${recordHistoryValue(item, language)}`).join('\n')
  return String(value)
}
