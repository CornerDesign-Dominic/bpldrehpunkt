import { timeBookingRows } from './timeBookingRows.js'

export const TIME_BOOKINGS_PAGE_SIZE = 50
const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to)

export function bookingRangeCursor(to) {
  if (!to || to === '2199-12-31') return undefined
  const date = new Date(`${to}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

// The existing own-data endpoint pages by day. Keep complete histories intact,
// but show a fixed number of booking IDs per screen, even within a busy day.
export async function loadTimeBookingPage({ cache, from = '', to = '', index = 0, fetchPage, isActive = () => true }) {
  let state = cache || { days: [], history: [], rows: [], nextBefore: bookingRangeCursor(to), initialized: false }
  const needed = (index + 1) * TIME_BOOKINGS_PAGE_SIZE + 1
  while (!state.initialized || state.rows.length < needed && state.nextBefore) {
    if (!isActive()) return null
    const cursor = state.nextBefore
    const result = await fetchPage(cursor ? { before: cursor } : {})
    if (!isActive()) return null
    let nextBefore = result.nextBefore || null
    if (nextBefore && nextBefore === cursor) throw new Error('Der nächste Buchungsabschnitt konnte nicht geladen werden.')
    if (from && result.days.some(day => day.date <= from)) nextBefore = null
    const days = [...new Map([...state.days, ...result.days.filter(day => inRange(day.date, from, to))].map(day => [day.date, day])).values()]
    const history = [...new Map([...state.history, ...result.history.filter(entry => inRange(entry.date, from, to))].map(entry => [entry.id, entry])).values()]
    state = { days, history, rows: timeBookingRows(days, history), nextBefore, initialized: true }
  }
  return state
}
