import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { berlinToday, reminderMinuteState, resolveReminderTime } from './reminderTime.js'

const resolve = (date, time = '09:00', occurrence) => resolveReminderTime({ date, time, occurrence })
test('normal Berlin wall times resolve to one exact UTC instant in winter and summer', () => {
  assert.deepEqual(resolve('2026-01-15'), { valid: true, dueAt: '2026-01-15T08:00:00.000Z', ambiguous: false, candidates: ['2026-01-15T08:00:00.000Z'], occurrence: null })
  assert.equal(resolve('2026-07-15').dueAt, '2026-07-15T07:00:00.000Z')
  assert.equal(resolve('2026-01-15', '00:00').dueAt, '2026-01-14T23:00:00.000Z')
  assert.equal(resolve('2026-07-15', '23:59').dueAt, '2026-07-15T21:59:00.000Z')
  assert.equal(resolve('2026-01-15', '09:00', 'later').occurrence, null)
})

test('dates are real Gregorian dates, with century leap years and years below 100 preserved', () => {
  for (const date of ['2024-02-29', '2000-02-29', '2400-02-29', '0099-12-31', '0001-01-01', '9999-12-31']) assert.equal(resolve(date).valid, true, date)
  assert.equal(resolve('0099-12-31').dueAt.slice(0, 4), '0099')
  for (const date of ['2026-02-29', '2027-02-29', '1900-02-29', '2100-02-29', '2026-02-30', '2026-04-31', '2026-06-31', '2026-09-31', '2026-11-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '0000-01-01', '10000-01-01', '26-01-01', '2026-1-01', '2026-01-1', ' 2026-01-01', '2026-01-01 ', '2026-01-01T00:00:00Z', '', null, 20260101]) {
    const result = resolve(date)
    assert.equal(result.valid, false, String(date)); assert.equal(result.code, 'invalid-date'); assert.deepEqual(result.candidates, [])
  }
})

test('wall-clock input is strict and never defaults or normalizes an invalid time or occurrence', () => {
  for (const time of ['', null, undefined, 900, '9:00', '09:0', '24:00', '23:60', '25:99', '-1:00', '09:00:00', ' 09:00', '09:00 ', '09:00Z']) {
    const result = resolveReminderTime({ date: '2026-01-15', time })
    assert.equal(result.valid, false, String(time)); assert.equal(result.code, 'invalid-time')
  }
  for (const occurrence of ['', 'first', 'EARLIER', 0, false]) assert.equal(resolve('2026-01-15', '09:00', occurrence).code, 'invalid-occurrence')
  for (const input of [undefined, null, false, 0, '2026-01-15', []]) assert.equal(resolveReminderTime(input).code, 'invalid-date')
})

for (const [year, spring, autumn, beforeAutumn] of [[2026, '03-29', '10-25', '2026-10-24'], [2027, '03-28', '10-31', '2027-10-30']]) {
  test(`spring ${year}: before/after transition stay exact, and every missing minute is rejected`, () => {
    assert.equal(resolve(`${year}-${spring}`, '01:30').dueAt, `${year}-${spring}T00:30:00.000Z`)
    assert.equal(resolve(`${year}-${spring}`, '03:30').dueAt, `${year}-${spring}T01:30:00.000Z`)
    for (let minute = 0; minute < 60; minute++) {
      const result = resolve(`${year}-${spring}`, `02:${String(minute).padStart(2, '0')}`)
      assert.equal(result.valid, false); assert.equal(result.code, 'nonexistent-time'); assert.deepEqual(result.candidates, [])
    }
  })
  test(`autumn ${year}: both occurrences require explicit choice and remain distinct`, () => {
    assert.equal(resolve(`${year}-${autumn}`, '01:30').dueAt, `${beforeAutumn}T23:30:00.000Z`)
    assert.equal(resolve(`${year}-${autumn}`, '03:30').dueAt, `${year}-${autumn}T02:30:00.000Z`)
    for (let minute = 0; minute < 60; minute++) {
      const clock = `02:${String(minute).padStart(2, '0')}`
      const candidates = [`${year}-${autumn}T00:${String(minute).padStart(2, '0')}:00.000Z`, `${year}-${autumn}T01:${String(minute).padStart(2, '0')}:00.000Z`]
      const undecided = resolve(`${year}-${autumn}`, clock)
      assert.deepEqual(undecided.candidates, candidates); assert.equal(undecided.valid, false); assert.equal(undecided.code, 'ambiguous-time'); assert(undecided.message.length)
      const earlier = resolve(`${year}-${autumn}`, clock, 'earlier'), later = resolve(`${year}-${autumn}`, clock, 'later')
      assert.equal(earlier.valid, true); assert.equal(earlier.ambiguous, true); assert.equal(earlier.occurrence, 'earlier'); assert.equal(earlier.dueAt, candidates[0])
      assert.equal(later.valid, true); assert.equal(later.ambiguous, true); assert.equal(later.occurrence, 'later'); assert.equal(later.dueAt, candidates[1])
    }
  })
}

test('Berlin today uses local date at winter/summer midnight, year boundary and DST transitions', () => {
  for (const [instant, day] of [
    ['2026-01-15T22:59:59.999Z', '2026-01-15'], ['2026-01-15T23:00:00.000Z', '2026-01-16'],
    ['2026-07-15T21:59:59.999Z', '2026-07-15'], ['2026-07-15T22:00:00.000Z', '2026-07-16'],
    ['2026-12-31T23:00:00.000Z', '2027-01-01'], ['2026-03-28T23:30:00.000Z', '2026-03-29'],
    ['2027-10-30T22:30:00.000Z', '2027-10-31'],
  ]) assert.equal(berlinToday(new Date(instant)), day)
  assert.match(berlinToday(), /^\d{4}-\d{2}-\d{2}$/)
  assert.throws(() => berlinToday(new Date(NaN)), RangeError)
})

test('reminder minute is a half-open exact 60-second window, never a catch-up window', () => {
  const dueAt = '2026-10-31T08:00:00.000Z', due = Date.parse(dueAt)
  for (const [offset, expected] of [[-86400000, 'upcoming'], [-1, 'upcoming'], [0, 'due'], [1, 'due'], [59999, 'due'], [60000, 'missed'], [60001, 'missed'], [86400000, 'missed']]) assert.equal(reminderMinuteState(dueAt, new Date(due + offset)), expected, String(offset))
  assert.equal(reminderMinuteState(new Date(due), new Date(due)), 'due')
  assert.equal(reminderMinuteState('2026-10-31T09:00:00+01:00', new Date(due)), 'due')
  assert.equal(reminderMinuteState('2026-10-31T08:00:30.500Z', new Date('2026-10-31T08:01:30.499Z')), 'due')
  assert.equal(reminderMinuteState('2026-10-31T08:00:30.500Z', new Date('2026-10-31T08:01:30.500Z')), 'missed')
})

test('invalid instants and local/normalized date strings cannot trigger reminder delivery', () => {
  const now = new Date('2026-10-31T08:00:00Z')
  for (const value of [undefined, null, '', 0, NaN, Infinity, {}, '2026-10-31', '2026-10-31T08:00:00', '2026-02-30T08:00:00Z', '2026-10-31T25:00:00Z', '2026-10-31T08:00:60Z', '2026-10-31T08:00:00+24:00', new Date(NaN)]) assert.equal(reminderMinuteState(value, now), 'invalid', String(value))
  assert.equal(reminderMinuteState('2026-10-31T08:00:00Z', new Date(NaN)), 'invalid')
})

test('the earliest supported Berlin date can round-trip an ISO instant in astronomical UTC year zero', () => {
  const result = resolve('0001-01-01', '00:00')
  assert.equal(result.valid, true)
  assert.equal(berlinToday(result.dueAt), '0001-01-01')
  assert.equal(reminderMinuteState(result.dueAt, new Date(result.dueAt)), 'due')
})

test('Berlin date and resolution stay identical under UTC and widely different host timezones', () => {
  const url = new URL('./reminderTime.js', import.meta.url).href
  const code = `import { berlinToday, resolveReminderTime } from ${JSON.stringify(url)};process.stdout.write(JSON.stringify([berlinToday(new Date('2026-07-15T22:30:00Z')),resolveReminderTime({date:'2026-03-29',time:'01:30'}).dueAt]))`
  for (const tz of ['UTC', 'Pacific/Honolulu', 'Pacific/Kiritimati']) {
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, TZ: tz } }))
    assert.deepEqual(result, ['2026-07-16', '2026-03-29T00:30:00.000Z'], tz)
  }
})
