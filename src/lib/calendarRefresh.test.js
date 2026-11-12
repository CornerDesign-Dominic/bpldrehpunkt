import test from 'node:test'
import assert from 'node:assert/strict'
import { subscribeCalendarRefresh } from './calendarRefresh.js'

test('open calendar refreshes on visible polling, focus and return, and removes subscriptions on unmount', () => {
  const window = new EventTarget()
  const document = new EventTarget()
  document.visibilityState = 'visible'
  let poll
  let cleared = false
  window.setInterval = (callback, milliseconds) => { assert.equal(milliseconds, 30_000); poll = callback; return 7 }
  window.clearInterval = (id) => { assert.equal(id, 7); cleared = true }
  let loads = 0
  const unsubscribe = subscribeCalendarRefresh({ window, document, onRefresh: () => { loads += 1 } })
  poll()
  assert.equal(loads, 1)
  window.dispatchEvent(new Event('focus'))
  assert.equal(loads, 2)
  document.visibilityState = 'hidden'
  poll()
  window.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(loads, 2, 'Hidden calendars must not repeatedly query source data')
  document.visibilityState = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(loads, 3, 'Returning immediately rechecks current source authorization')
  unsubscribe()
  assert.equal(cleared, true)
  window.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(loads, 3)
})
