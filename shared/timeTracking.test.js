import test from 'node:test'
import assert from 'node:assert/strict'
import { berlinTimeDate, calculateTimeDay, canCorrectOwnTime, effectiveTimeVacations, normalizeTimeEvents, progressiveTimeBreak, timeModelsOverlap, validTimeDate, vacationTimeDay, vacationTimeFactor } from './timeTracking.js'

const date = '2026-11-10'
const now = new Date('2026-11-10T20:00:00Z')
const rules = [{ afterMinutes: 360, requiredMinutes: 30 }, { afterMinutes: 540, requiredMinutes: 45 }]
const model = { weekdays: { '2': { targetMinutes: 480, breaks: rules } } }
const event = (type, at) => ({ id: `${type}-${at}`, type, at: `${date}T${at}:00Z` })

test('progressive pause grows after each threshold and higher tier is total requirement', () => {
  for (const [worked, booked, expected] of [[360, 0, 0], [361, 0, 1], [375, 0, 15], [390, 0, 30], [540, 0, 30], [541, 0, 31], [555, 0, 45], [600, 20, 25], [361, 20, 1], [541, 35, 1], [600, 50, 0]]) assert.equal(progressiveTimeBreak(worked, booked, rules), expected, `${worked}/${booked}`)
})
test('work, actual breaks and automatic differential remain distinct', () => {
  const events = [event('come', '07:00'), event('pause_start', '11:00'), event('pause_end', '11:20'), event('go', '16:20')]
  const day = calculateTimeDay({ date, events, model, now })
  assert.equal(day.workedMinutes, 540)
  assert.equal(day.bookedBreakMinutes, 20)
  assert.equal(day.automaticBreakMinutes, 10)
  assert.equal(day.creditedMinutes, 530)
  assert.equal(day.balanceMinutes, 50)
  assert.equal(day.status, 'away')
})
test('half vacation halves target while long actual work still applies pause rules', () => {
  const events = [event('come', '07:00'), event('go', '16:30')]
  const day = calculateTimeDay({ date, events, model, vacationFactor: 0.5, now })
  assert.equal(day.targetMinutes, 240)
  assert.equal(day.automaticBreakMinutes, 45)
  assert.equal(day.balanceMinutes, 285)
  const holiday = calculateTimeDay({ date, events, model, holiday: true, now })
  assert.equal(holiday.targetMinutes, 0)
  assert.equal(holiday.creditedMinutes, 570)
})
test('forgotten go never accrues overnight; new day independently begins', () => {
  const previous = calculateTimeDay({ date: '2026-11-09', events: [{ id: '1', type: 'come', at: '2026-11-09T07:00:00Z' }], model, now })
  assert.equal(previous.workedMinutes, 0)
  assert.equal(previous.incomplete, true)
  const current = calculateTimeDay({ date, events: [event('come', '07:00')], model, now: new Date(`${date}T08:00:00Z`) })
  assert.equal(current.workedMinutes, 60)
  assert.equal(current.incomplete, false)
})
test('Berlin calendar correction limit includes previous seven days across UTC boundary', () => {
  const afterMidnight = new Date('2026-11-10T23:30:00Z')
  assert.equal(berlinTimeDate(afterMidnight), '2026-11-11')
  assert.equal(canCorrectOwnTime('2026-11-04', afterMidnight), true)
  assert.equal(canCorrectOwnTime('2026-11-03', afterMidnight), false)
  assert.equal(canCorrectOwnTime('2026-11-12', afterMidnight), false)
})
test('models have inclusive end and beginning with no overlapping periods', () => {
  const a = { validFrom: '2026-01-01', validTo: '2026-06-30' }
  assert.equal(timeModelsOverlap(a, { validFrom: '2026-06-30', validTo: '' }), true)
  assert.equal(timeModelsOverlap(a, { validFrom: '2026-07-01', validTo: '' }), false)
})
test('input rejects impossible dates, duplicate IDs, mismatched calendar day and future', () => {
  assert.equal(validTimeDate('2026-02-30'), false)
  for (const events of [[{ id: '1', type: 'come', at: '2026-02-30T08:00:00Z' }], [event('come', '22:00')], [event('come', '07:00'), event('come', '07:00')]]) assert.throws(() => normalizeTimeEvents(events, date, now))
  assert.throws(() => normalizeTimeEvents([{ id: '1', type: 'come', at: '2026-11-09T08:00:00Z' }], date, now))
})
test('paid duration uses real elapsed time through daylight saving fold', () => {
  const day = calculateTimeDay({ date: '2026-10-25', events: [{ id: 'a', type: 'come', at: '2026-10-25T00:30:00Z' }, { id: 'b', type: 'go', at: '2026-10-25T02:30:00Z' }], now })
  assert.equal(day.workedMinutes, 120)
  assert.equal(day.calculationIncomplete, true)
  assert.equal(day.incomplete, false)
})
test('vacation factors ignore pending changes and allocate explicit half day only', () => {
  const base = { startDate: '2026-11-09', endDate: '2026-11-11', status: 'approved', days: 2.5, halfDayDate: date }
  assert.equal(vacationTimeFactor(date, [base]), 0.5)
  assert.equal(vacationTimeFactor('2026-11-09', [base]), 0)
  assert.equal(vacationTimeFactor(date, [{ ...base, status: 'pending' }]), 1)
  assert.equal(vacationTimeFactor(date, [{ ...base, requestKind: 'cancellation' }]), 1)
})
test('overtime leave consumes nominal daily hours, half-day half, including multi-day explicit allocation', () => {
  const request = { id: 'overtime-root', startDate: '2026-11-09', endDate: '2026-11-11', days: 2.5, halfDayDate: date, status: 'approved', vacationType: 'overtime' }
  const half = calculateTimeDay({ date, model, now, ...vacationTimeDay(date, [request]) })
  assert.equal(half.targetMinutes, 240)
  assert.equal(half.overtimeDebitMinutes, 240)
  assert.equal(half.balanceMinutes, -480) // Four hours ordinary work still due.
  assert.deepEqual(half.overtimeRequestIds, ['overtime-root'])
  const halfWorked = calculateTimeDay({ date, model, now, events: [event('come', '07:00'), event('go', '11:00')], ...vacationTimeDay(date, [request]) })
  assert.equal(halfWorked.balanceMinutes, -240)
  const full = calculateTimeDay({ date, model, now, ...vacationTimeDay(date, [{ ...request, halfDayDate: '2026-11-09' }]) })
  assert.equal(full.targetMinutes, 0)
  assert.equal(full.overtimeDebitMinutes, 480)
  assert.equal(full.balanceMinutes, -480)
  const holiday = calculateTimeDay({ date, model, now, holiday: true, ...vacationTimeDay(date, [request]) })
  assert.equal(holiday.overtimeDebitMinutes, 0)
  const freeDayModel = { weekdays: { '2': { targetMinutes: 0, breaks: [] } } }
  assert.equal(calculateTimeDay({ date, model: freeDayModel, now, ...vacationTimeDay(date, [request]) }).overtimeDebitMinutes, 0)
})
test('approved change children cannot duplicate or overwrite effective root absence', () => {
  const root = { id: 'root', startDate: date, endDate: date, status: 'approved', days: 0.5, vacationType: 'overtime' }
  const child = { ...root, id: 'child', days: 1, originalRequestId: 'root', vacationId: 'root', changeRequest: {} }
  assert.deepEqual(effectiveTimeVacations([root, child]), [root])
  assert.equal(vacationTimeFactor(date, [root, child]), 0.5)
  const effect = vacationTimeDay(date, [root, child])
  assert.equal(effect.overtimeFraction, 0.5)
  assert.deepEqual(effect.overtimeRequestIds, ['root'])
})
test('cancelled and rejected overtime requests never debit and overlaps do not double debit', () => {
  const root = { id: 'root', startDate: date, endDate: date, status: 'approved', days: 1, vacationType: 'overtime' }
  for (const status of ['cancelled', 'rejected', 'pending', 'withdrawn']) {
    const effect = vacationTimeDay(date, [{ ...root, status }])
    assert.equal(effect.overtimeFraction, 0)
    assert.equal(effect.vacationFactor, 1)
  }
  assert.equal(vacationTimeDay(date, [root, { ...root, id: 'duplicate' }]).overtimeFraction, 1)
  assert.equal(vacationTimeDay(date, [{ ...root, vacationType: 'normal' }]).overtimeFraction, 0)
})
