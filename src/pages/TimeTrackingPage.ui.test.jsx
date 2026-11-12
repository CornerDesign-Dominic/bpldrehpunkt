import assert from 'node:assert/strict'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import TimeTrackingPage from './TimeTrackingPage.jsx'
import TimeBookings from '../components/time/TimeBookings.jsx'
import { addDays, timeDate, weekRange } from '../lib/timeTracking.js'

const today = timeDate()
const week = weekRange(today)
const day = date => ({ date, events: [{ id: date, type: 'come', at: `${date}T07:00:00Z` }], workedMinutes: 470, bookedBreakMinutes: 20, automaticBreakMinutes: 10, creditedMinutes: 460, targetMinutes: 480, balanceMinutes: -20 })
const calls = []
globalThis.timeUiApi = {
  workspace: async data => {
    calls.push(data)
    const days = []
    for (let date = data.from; date <= data.to; date = addDays(date, 1)) days.push(day(date))
    return { user: { id: 'test-user' }, account: { startDate: today }, days, history: [], unresolvedDays: [], balanceMinutes: 0 }
  },
  bookings: async () => ({ days: [{ date: today, events: [{ id: 'one', type: 'come', at: `${today}T07:00:00Z`, client: 'web' }] }], history: [], nextBefore: null }),
}
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
await act(async () => { root.render(<TimeTrackingPage />) })
const clickTab = async label => { await act(async () => { [...host.querySelectorAll('[role="tab"]')].find(node => node.textContent === label).click() }) }
assert.equal(host.querySelector('[aria-selected="true"]').textContent, 'Aktuelle Woche')
assert.equal(host.querySelectorAll('[role="tabpanel"] tbody tr').length, 7)
assert.ok(host.querySelector('[role="tabpanel"]').textContent.includes(new Date(`${week.from}T12:00:00Z`).toLocaleDateString('de-DE')))
await clickTab('Monatsübersicht')
assert.ok(host.querySelector('input[type="month"]'))
assert.ok(host.querySelectorAll('[role="tabpanel"] tbody tr').length >= 28)
assert.deepEqual([...host.querySelectorAll('[role="tabpanel"] th')].map(node => node.textContent), ['Tag', 'Sollzeit', 'Istzeit', 'Pause gesamt', 'Arbeitszeit', 'Plus / Minus'])
const monthCells = [...host.querySelector('[role="tabpanel"] tbody tr').cells].map(node => node.textContent)
assert.deepEqual(monthCells.slice(1), ['08:00', '08:10', '00:30', '07:40', '−00:20'])
assert.equal(host.querySelectorAll('[role="tabpanel"] .time-event-cell').length, 0)
assert.equal(host.querySelectorAll('[role="tabpanel"] button').length, 0)
await clickTab('Alle Buchungen')
assert.equal(host.querySelectorAll('[role="tabpanel"] tbody tr').length, 1)
assert.ok(host.querySelector('[role="tabpanel"]').textContent.includes('Web'))
assert.ok(!host.querySelector('input[type="month"]'))
await clickTab('Aktuelle Woche')
await act(async () => { host.querySelector('[aria-selected="true"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
assert.equal(host.querySelector('[aria-selected="true"]').textContent, 'Monatsübersicht')
assert.ok(host.querySelector('.time-stamp-panel').textContent.includes('Heute'))
assert.ok(calls.every(call => call.ownOnly === true))
await act(async () => { root.unmount() })
host.remove()
console.log('Time UI: default week, monthly table, individual bookings, keyboard navigation and own-data scope verified.')

let olderAttempts = 0
const olderDate = addDays(today, -40)
const first = { id: 'first', type: 'come', at: `${today}T07:00:00Z`, client: 'web' }
globalThis.timeUiApi.bookings = async ({ before } = {}) => {
  if (!before) return { days: [{ date: today, events: [first] }], history: [], nextBefore: today }
  if (++olderAttempts === 1) throw new Error('Verbindung unterbrochen')
  return { days: [{ date: olderDate, events: [] }], history: [{ id: 'deleted', kind: 'correction', date: olderDate, before: [{ ...first, id: 'old', at: `${olderDate}T07:00:00Z` }], after: [], createdByName: 'Test Manager', createdAt: `${today}T09:00:00Z`, client: 'web' }], nextBefore: null }
}
const bookingsHost = document.createElement('div')
document.body.append(bookingsHost)
const bookingsRoot = createRoot(bookingsHost)
await act(async () => { bookingsRoot.render(<TimeBookings />) })
await act(async () => { [...bookingsHost.querySelectorAll('button')].find(node => node.textContent === 'Ältere Buchungen laden').click() })
assert.ok(bookingsHost.querySelector('[role="alert"]').textContent.includes('Verbindung unterbrochen'))
assert.equal(bookingsHost.querySelectorAll('tbody tr').length, 1)
await act(async () => { [...bookingsHost.querySelectorAll('button')].find(node => node.textContent === 'Erneut versuchen').click() })
assert.equal(bookingsHost.querySelectorAll('tbody tr').length, 2)
assert.ok(bookingsHost.textContent.includes('Gelöscht'))
assert.ok(bookingsHost.textContent.includes('Test Manager'))
await act(async () => { [...bookingsHost.querySelectorAll('.time-booking-toggle')].at(-1).click() })
const trail = bookingsHost.querySelector('.time-booking-version-row')
assert.equal(trail.cells.length, 9)
assert.ok(trail.textContent.includes('Kommen'))
assert.deepEqual([...bookingsHost.querySelectorAll('th')].map(node => node.textContent), ['Datum', 'Uhrzeit', 'Buchung', 'Erfassung', 'Über', 'Bearbeiter', 'Gespeichert am', 'Grund', 'Verlauf'])
assert.ok(!bookingsHost.querySelector('[role="alert"]'))
await act(async () => { bookingsRoot.unmount() })
bookingsHost.remove()
console.log('Time UI: cross-month pagination, retry without duplicate rows and deleted-booking audit trail verified.')

const edited = { ...first, id: 'edited', at: `${today}T08:00:00Z` }
const manual = { ...first, id: 'manual', at: `${today}T09:00:00Z` }
const historyEntry = (id, kind, before, after, hour, createdByName = 'Original Actor') => ({ id, kind, date: today, before, after, createdByName, client: 'web', createdAt: `${today}T${hour}:00:00Z` })
globalThis.timeUiApi.bookings = async () => ({ days: [{ date: today, events: [first, edited, manual] }], history: [
  historyEntry('stamp-first', 'stamp', null, first, '07'),
  historyEntry('stamp-edited', 'stamp', null, { ...edited, at: `${today}T07:30:00Z` }, '08'),
  historyEntry('manual', 'addition', [], [manual], '09'),
  { ...historyEntry('edit', 'correction', [{ ...edited, at: `${today}T07:30:00Z` }], [edited], '10'), reason: 'wrong_booking', note: 'Startzeit berichtigt' },
  historyEntry('same', 'correction', [first], [first], '11', 'Later Actor'),
], nextBefore: null })
const statusHost = document.createElement('div')
document.body.append(statusHost)
const statusRoot = createRoot(statusHost)
await act(async () => { statusRoot.render(<TimeBookings />) })
const mainRows = [...statusHost.querySelectorAll('.time-booking-row')]
assert.deepEqual(mainRows.map(row => row.cells[3].textContent), ['Gestempelt', 'Korrektur', 'Manueller Nachtrag'])
assert.ok(!statusHost.textContent.includes('Originalbuchung'))
const originalRow = mainRows[0]
assert.ok(originalRow.textContent.includes('Original Actor'))
assert.ok(!originalRow.textContent.includes('Later Actor'))
assert.ok(originalRow.textContent.includes('1 Speicherung'))
await act(async () => { originalRow.querySelector('button').click() })
assert.ok(statusHost.querySelector('.time-booking-save-row').textContent.includes('Unverändert gespeichert'))
assert.ok(statusHost.querySelector('.time-booking-save-row').textContent.includes('Later Actor'))
await act(async () => { mainRows[1].querySelector('button').click() })
const older = statusHost.querySelector('.time-booking-version-row')
assert.equal(older.cells.length, 9)
assert.equal(older.cells[3].textContent, 'Gestempelt')
assert.equal(older.cells[1].textContent, '08:30')
assert.ok(mainRows[1].querySelector('.time-booking-value-changed'))
assert.ok(mainRows[1].cells[7].querySelector('.time-booking-reason').textContent.includes('Startzeit berichtigt'))
assert.equal(mainRows[1].cells[8].querySelector('.time-booking-reason'), null)
assert.equal(mainRows[1].cells[7].querySelector('summary').textContent, 'Fehlbuchung')
await act(async () => { mainRows[1].querySelector('button').click() })
assert.equal(statusHost.querySelector('.time-booking-version-row'), null)
await act(async () => { statusRoot.unmount() })
statusHost.remove()
console.log('Time UI: compact nine-column current and earlier rows, separate unchanged saves and accurate attribution verified.')

const states = Array.from({ length: 30 }, (_, index) => ({ ...first, at: new Date(Date.parse(`${today}T07:00:00Z`) + index * 60000).toISOString() }))
const longHistory = states.map((state, index) => ({ id: `long-${index}`, date: today, kind: index ? 'correction' : 'stamp', before: index ? [states[index - 1]] : null, after: index ? [state] : state, createdByName: `Bearbeiter ${index}`, createdAt: new Date(Date.parse(`${today}T08:00:00Z`) + index * 60000).toISOString(), client: 'web' }))
globalThis.timeUiApi.bookings = async () => ({ days: [{ date: today, events: [states[29]] }], history: longHistory, nextBefore: null })
const longHost = document.createElement('div')
document.body.append(longHost)
const longRoot = createRoot(longHost)
await act(async () => { longRoot.render(<TimeBookings />) })
assert.equal(longHost.querySelectorAll('tbody tr').length, 1)
assert.ok(longHost.querySelector('tbody').textContent.includes('29 frühere Stände'))
await act(async () => { longHost.querySelector('.time-booking-toggle').click() })
assert.equal(longHost.querySelectorAll('.time-booking-version-row').length, 29)
assert.equal(longHost.querySelectorAll('tbody tr').length, 30)
assert.ok([...longHost.querySelectorAll('tbody tr')].every(row => row.cells.length === 9))
assert.equal(longHost.querySelector('tbody tr').cells[5].textContent, 'Bearbeiter 29')
assert.equal(longHost.querySelector('tbody tr:last-child').cells[5].textContent, 'Bearbeiter 0')
await act(async () => { longRoot.unmount() })
longHost.remove()
console.log('Time UI: thirty effective versions render one current row and 29 aligned earlier rows.')
