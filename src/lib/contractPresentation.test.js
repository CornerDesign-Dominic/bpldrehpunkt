import assert from 'node:assert/strict'
import test from 'node:test'
import { contractCostTotals, nextContractCharge, parseContractMoney } from './contractPresentation.js'

test('contract costs parse exact cents without silently rounding excessive decimals', () => {
  assert.equal(parseContractMoney('19,99'), 1999)
  assert.equal(parseContractMoney('0.10'), 10)
  assert.equal(parseContractMoney('0'), 0)
  for (const input of ['', '-1', '1.234', '1,234', 'NaN', 'Infinity', '1e3', '1.2.3']) assert.equal(parseContractMoney(input), null)
})
test('five phone contracts and setup fees retain separate billing totals', () => {
  const phones = Array.from({ length: 5 }, () => ({ grossAmountCents: 1999, billingCycle: 'monthly' }))
  assert.deepEqual(contractCostTotals([...phones, { grossAmountCents: 5000, billingCycle: 'once' }, { grossAmountCents: 10000, billingCycle: 'yearly' }]), { monthly: 9995, quarterly: 0, 'half-yearly': 0, yearly: 10000, once: 5000 })
})
test('billing dates retain the original monthly anchor through short months and leap years', () => {
  assert.equal(nextContractCharge('2026-01-31', 'monthly', '2026-02-01'), '2026-02-28')
  assert.equal(nextContractCharge('2026-01-31', 'monthly', '2026-03-01'), '2026-03-31')
  assert.equal(nextContractCharge('2024-02-29', 'yearly', '2027-03-01'), '2028-02-29')
  assert.equal(nextContractCharge('2026-01-15', 'quarterly', '2026-04-16'), '2026-07-15')
  assert.equal(nextContractCharge('2026-01-15', 'half-yearly', '2026-07-15'), '2026-07-15')
  assert.equal(nextContractCharge('2026-01-15', 'once', '2026-11-05'), '2026-01-15')
})
