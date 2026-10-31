const routes = Object.freeze({
  damage: '/schaeden', insolvency: '/insolvenzen', legalDispute: '/legal-disputes',
  inkasso: '/inkasso', todo: '/todos', transportOrder: '/transportauftraege',
  partner: '/kunden-unternehmer/stammdaten',
})
const returnRoots = ['/sendungsverfolgung', '/kalender', '/schaeden', '/insolvenzen', '/legal-disputes', '/inkasso', '/todos', '/transportauftraege', '/kunden-unternehmer', '/crm', '/paletten']

export function recordDetailPath(type, id) {
  return routes[type] && typeof id === 'string' && id.length > 0
    ? `${routes[type]}/${encodeURIComponent(id)}` : ''
}

export function validReturnPath(value) {
  if (typeof value !== 'string' || value.includes('\\') || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false
  const pathname = value.split(/[?#]/, 1)[0]
  return returnRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`))
}

function returnState(state, depth = 0) {
  if (depth >= 5 || !validReturnPath(state?.returnTo)) return null
  return { returnTo: state.returnTo, returnState: returnState(state.returnState, depth + 1) }
}

export function createReturnState(location) {
  const returnTo = `${location.pathname}${location.search || ''}${location.hash || ''}`
  return validReturnPath(returnTo) ? { returnTo, returnState: returnState(location.state) } : {}
}

export function resolveReturnNavigation(state, fallback, currentPath = '') {
  return validReturnPath(state?.returnTo) && state.returnTo !== currentPath
    ? { to: state.returnTo, state: returnState(state.returnState) }
    : { to: fallback, state: null }
}

// A mutual record link returns to the exact source view (including its tab),
// removing that source from the return chain rather than creating a cycle.
export function linkedRecordNavigation(location, targetPath) {
  const origin = location.state?.returnTo
  if (typeof origin === 'string' && origin.split(/[?#]/, 1)[0] === targetPath) {
    return resolveReturnNavigation(location.state, targetPath, `${location.pathname}${location.search || ''}${location.hash || ''}`)
  }
  return { to: targetPath, state: createReturnState(location) }
}

export function calendarPath({ date, calendarId, eventId } = {}) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const parsed = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return ''
  const query = new URLSearchParams({ date })
  if (calendarId) query.set('calendar', calendarId)
  if (eventId) query.set('event', eventId)
  return `/kalender?${query}`
}

export function deadlineIdFromHash(hash) {
  return new URLSearchParams(typeof hash === 'string' ? hash.replace(/^#/, '') : '').get('termin') || ''
}
