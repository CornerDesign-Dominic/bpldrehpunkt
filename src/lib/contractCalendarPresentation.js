import { resolveVisibleCalendarIds } from './calendarSelection.js'
import { calendarPath } from './recordNavigation.js'

const text = value => typeof value === 'string' ? value.trim() : ''
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function contractCalendarEntries(sources) {
  const contracts = new Map((sources.cases?.contracts || []).map(contract => [`contracts/${contract.id}`, contract]))
  return (sources.deadlines || []).flatMap(deadline => {
    const contract = contracts.get(deadline.parentPath)
    if (!contract || deadline.completed === true || !validDate(deadline.date)) return []
    return [{
      id: `contract:${contract.id}:deadline:${deadline.id}`,
      title: [text(contract.partnerName) || text(contract.contractNumber) || 'Vertrag', text(deadline.title) || 'Termin / Frist'].join(' · '),
      date: deadline.date,
      time: text(deadline.time),
      targetPath: `/vertragsmanagement/vertraege/${encodeURIComponent(contract.id)}#termin=${encodeURIComponent(deadline.id)}`,
      description: text(deadline.note),
    }]
  })
}

export function contractCalendarDeepLink(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : '')
  const date = params.get('date')
  if (params.get('calendar') !== 'system-contracts' || !validDate(date)) return null
  const [year, month] = date.split('-').map(Number)
  // Date(year, month, day), used by the grid, reinterprets years 0–99.
  if (year < 100) return null
  const requestedEvent = params.get('event') || ''
  const eventId = requestedEvent.startsWith('contract:') && requestedEvent.length <= 1024 && ![...requestedEvent].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ? requestedEvent : ''
  return { date, year, month: month - 1, calendarId: 'system-contracts', eventId }
}

export function contractCalendarVisibleIds(availableCalendars, current, stored, deepLink) {
  const selected = resolveVisibleCalendarIds(availableCalendars, current, stored)
  if (!deepLink || !availableCalendars.some(calendar => calendar.id === deepLink.calendarId)) return selected
  return [...new Set([...selected, deepLink.calendarId])]
}

export function contractCalendarReturnSource(location, year, month, eventId) {
  const requested = contractCalendarDeepLink(location.search)
  const date = requested?.year === year && requested.month === month
    ? requested.date
    : `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-01`
  const path = calendarPath({ date, calendarId: 'system-contracts', eventId })
  return path ? { ...location, pathname: '/kalender', search: path.slice('/kalender'.length), hash: '' } : location
}
