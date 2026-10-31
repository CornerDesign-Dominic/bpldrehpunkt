import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveVisibleCalendarIds } from './calendarSelection.js'

const available = [{ id: 'personal-1' }, { id: 'shared|calendar' }]
test('an empty stored calendar selection remains empty after page reload', () => {
  assert.deepEqual(resolveVisibleCalendarIds(available, null, '[]'), [])
  assert.deepEqual(resolveVisibleCalendarIds(available, [], '["personal-1"]'), [])
  assert.deepEqual(resolveVisibleCalendarIds(available, null, null), ['personal-1', 'shared|calendar'])
})
test('invalid preferences cannot break calendar loading and removed access cannot become selected', () => {
  for (const value of ['{}', 'null', '"calendar"', '{broken']) assert.deepEqual(resolveVisibleCalendarIds(available, null, value), ['personal-1', 'shared|calendar'])
  assert.deepEqual(resolveVisibleCalendarIds(available, null, '["missing", "shared|calendar", "shared|calendar", 5]'), ['shared|calendar'])
})
