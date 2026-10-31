import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarPath, createReturnState, deadlineIdFromHash, linkedRecordNavigation, recordDetailPath, resolveReturnNavigation, validReturnPath } from './recordNavigation.js'

test('mutual order/tracking links restore the original tab and remove the return cycle', () => {
  const origin = { pathname: '/transportauftraege/dycos-123', search: '?tab=partners', hash: '#kontakt', state: { returnTo: '/schaeden/1' } }
  const tracking = { pathname: '/sendungsverfolgung/dycos-123', state: createReturnState(origin) }
  assert.deepEqual(linkedRecordNavigation(tracking, '/transportauftraege/dycos-123'), { to: '/transportauftraege/dycos-123?tab=partners#kontakt', state: { returnTo: '/schaeden/1', returnState: null } })
  assert.deepEqual(linkedRecordNavigation({ pathname: '/sendungsverfolgung/1', state: { returnTo: 'https://example.com' } }, '/transportauftraege/1'), { to: '/transportauftraege/1', state: { returnTo: '/sendungsverfolgung/1', returnState: null } })
})

test('record routes preserve literal percent signs, separators and Unicode IDs', () => {
  assert.equal(recordDetailPath('insolvency', '50% Müller/alt'), '/insolvenzen/50%25%20M%C3%BCller%2Falt')
  assert.equal(recordDetailPath('damage', ''), '')
  assert.equal(recordDetailPath('unknown', 'case'), '')
})

test('calendar, case and order navigation retains the exact return chain', () => {
  const calendar = { pathname: '/kalender', search: '?date=2026-09-18&calendar=system-damages', hash: '', state: null }
  const caseOrigin = createReturnState(calendar)
  const orderOrigin = createReturnState({ pathname: '/schaeden/fall', search: '', hash: '#termin=frist', state: caseOrigin })
  const backToCase = resolveReturnNavigation(orderOrigin, '/transportauftraege')
  assert.equal(backToCase.to, '/schaeden/fall#termin=frist')
  assert.deepEqual(resolveReturnNavigation(backToCase.state, '/schaeden'), { to: calendar.pathname + calendar.search, state: null })
})

test('external, malformed and self-referencing return targets fall back to the module', () => {
  for (const path of ['https://example.com', '//example.com', '/\\example.com', 'javascript:alert(1)', '/kalender\n', '/kalender-anders', '/login']) {
    assert.equal(validReturnPath(path), false, path)
    assert.deepEqual(resolveReturnNavigation({ returnTo: path }, '/todos'), { to: '/todos', state: null })
  }
  assert.deepEqual(resolveReturnNavigation({ returnTo: '/todos/1' }, '/todos', '/todos/1'), { to: '/todos', state: null })
})

test('return state is bounded and only retains navigation data', () => {
  const state = { returnTo: '/todos/1', profile: { secret: 'not carried' } }
  state.returnState = state
  const result = createReturnState({ pathname: '/transportauftraege/1', state })
  assert.doesNotThrow(() => JSON.stringify(result))
  assert.equal(JSON.stringify(result).includes('secret'), false)
})

test('calendar dates and deadline IDs are explicit and round-trip without inference', () => {
  assert.equal(calendarPath({ date: '2026-02-30' }), '')
  const path = calendarPath({ date: '2026-11-04', calendarId: 'system-damages', eventId: 'damage:A%:B' })
  const url = new URL(path, 'https://example.test')
  assert.equal(url.searchParams.get('event'), 'damage:A%:B')
  assert.equal(url.searchParams.get('calendar'), 'system-damages')
  assert.equal(deadlineIdFromHash('#termin=Frist%25%20%C3%A4'), 'Frist% ä')
  assert.equal(deadlineIdFromHash(''), '')
})
