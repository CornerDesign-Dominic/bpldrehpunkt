import assert from 'node:assert/strict'
import test from 'node:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import CalendarPage from './CalendarPage.jsx'
import { LanguageContext } from '../i18n/languageContext.js'
import { berlinToday } from '../../shared/reminderTime.js'

test('already-open calendar refetches changed sources on focus, visible polling and return; profile changes remove old department dates', async () => {
  const profile = { active: true, role: 'user', department: 'Buchhaltung', permissions: { calendar: 'view', todos: 'view' } }
  const entry = { id: 'todo:task:deadline:date', calendarId: 'todo-department:Buchhaltung', calendarName: 'Buchhaltung', calendarColor: '#55758d', title: 'Original source date', startDate: berlinToday(), endDate: berlinToday(), allDay: true, todoDeadline: true, hasReminder: true, reminderEnabled: true }
  const state = globalThis.__calendarUiTest = { actor: { user: { uid: 'alice' }, profile }, entries: [entry], loads: 0 }
  const originalSetInterval = window.setInterval
  const originalClearInterval = window.clearInterval
  let poll
  let cleared = false
  window.setInterval = (callback, milliseconds) => { assert.equal(milliseconds, 30_000); poll = callback; return 42 }
  window.clearInterval = (id) => { assert.equal(id, 42); cleared = true }
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const render = () => root.render(<MemoryRouter initialEntries={['/kalender']}><LanguageContext.Provider value={{ language: 'de', t: key => key }}><CalendarPage /></LanguageContext.Provider></MemoryRouter>)
  try {
    await act(async () => render())
    assert.match(container.textContent, /Original source date/)
    assert(container.querySelector('.calendar-event-bar[title*="Mail-Erinnerung: An"]'))
    state.entries = [{ ...entry, title: 'Changed source date' }]
    await act(async () => window.dispatchEvent(new Event('focus')))
    assert.match(container.textContent, /Changed source date/)
    assert(!container.textContent.includes('Original source date'))
    state.entries = []
    await act(async () => poll())
    assert(!container.textContent.includes('Changed source date'), 'Removal by another employee is reflected without reopening the page')
    const loads = state.loads
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await act(async () => { poll(); document.dispatchEvent(new Event('visibilitychange')) })
    assert.equal(state.loads, loads)
    state.entries = [{ ...entry, title: 'Returned source date' }]
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    assert.match(container.textContent, /Returned source date/)
    state.actor = { ...state.actor, profile: { ...profile, department: 'Vertrieb' } }
    state.entries = []
    await act(async () => render())
    assert(!container.textContent.includes('Returned source date'))
    assert(!container.querySelector('.calendar-selector').textContent.includes('Buchhaltung'))
    assert.match(container.querySelector('.calendar-selector').textContent, /Vertrieb/)
    state.actor = { ...state.actor, profile: { ...profile, permissions: { calendar: 'view', todos: 'none' } } }
    const beforeRevocation = state.loads
    await act(async () => render())
    assert.equal(state.loads, beforeRevocation, 'Revoked To-do access stops source requests')
    assert(!container.querySelector('.calendar-selector').textContent.includes('Buchhaltung'))
  } finally {
    await act(async () => root.unmount())
    container.remove()
    window.setInterval = originalSetInterval
    window.clearInterval = originalClearInterval
    assert.equal(cleared, true)
  }
})

test('calendar left open across Berlin midnight refreshes the upcoming cutoff without changing selected month', async () => {
  const NativeDate = globalThis.Date
  let instant = '2026-11-12T22:59:00Z'
  globalThis.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [instant])) }
    static now() { return new NativeDate(instant).getTime() }
  }
  const profile = { active: true, role: 'user', department: 'Buchhaltung', permissions: { calendar: 'view', todos: 'view' } }
  const state = globalThis.__calendarUiTest = { actor: { user: { uid: 'alice' }, profile }, entries: [], loads: 0, ranges: [] }
  const originalSetInterval = window.setInterval
  const originalClearInterval = window.clearInterval
  let poll
  window.setInterval = (callback) => { poll = callback; return 17 }
  window.clearInterval = () => {}
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={['/kalender']}><LanguageContext.Provider value={{ language: 'de', t: key => key }}><CalendarPage /></LanguageContext.Provider></MemoryRouter>))
    assert.equal(state.ranges.at(-1).upcomingFrom, '2026-11-12')
    const initialFrom = state.ranges.at(-1).from
    instant = '2026-11-12T23:01:00Z'
    await act(async () => poll())
    assert.equal(state.ranges.at(-1).upcomingFrom, '2026-11-13')
    assert.equal(state.ranges.at(-1).from, initialFrom)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    globalThis.Date = NativeDate
    window.setInterval = originalSetInterval
    window.clearInterval = originalClearInterval
  }
})
