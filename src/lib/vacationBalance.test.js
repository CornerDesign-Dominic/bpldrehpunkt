import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateVacationYearBalance } from './vacationBalance.js'

test('approved replacement counts the root once and overtime never consumes annual leave', () => {
  const root = { id: 'root', startDate: '2026-11-10', endDate: '2026-11-11', days: 2, vacationType: 'normal', status: 'approved' }
  const result = calculateVacationYearBalance({ annualVacationEntitlement: 30, vacationTrackingStartYear: 2026, vacationTrackingOpeningBalance: 30, year: 2026, entries: [
    root,
    { ...root, id: 'change', originalRequestId: 'root', changeRequest: {} },
    { ...root, id: 'overtime', vacationType: 'overtime' },
    { ...root, id: 'cancel', cancellationRequest: true },
  ] })
  assert.equal(result.takenDays, 2)
  assert.equal(result.remainingDays, 28)
})
