import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeContractCostCategoryInput } from './contractCostCategories.js'
import { normalizeContractMutation } from './contracts.js'

const base = { recordId: 'category-1', mutationId: 'mutation-1', expectedRevision: 0, values: { name: '  IT & Kommunikation ', active: true } }
const root = (action, values) => normalizeContractMutation({ contractId: 'contract-1', mutationId: 'root-mutation', action, expectedRevision: 3, values })

test('contract cost categories require a bounded name, explicit status and revision and reject forged fields', () => {
  assert.equal(normalizeContractCostCategoryInput(base).values.name, 'IT & Kommunikation')
  for (const input of [
    { ...base, recordId: '../other' }, { ...base, mutationId: '' }, { ...base, expectedRevision: -1 }, { ...base, updatedBy: 'forged' },
    ...[{ name: '' }, { name: 'A'.repeat(241) }, { name: 'Line\nBreak' }, { active: 'true' }, { revision: 3 }].map((values) => ({ ...base, values: { ...base.values, ...values } })),
  ]) assert.throws(() => normalizeContractCostCategoryInput(input), { code: 'invalid-argument' })
})

test('contract payment settings require a complete real schedule or an explicit complete clear', () => {
  assert.equal(root('payment', { paymentCycle: 'half-yearly', paymentAnchorDate: '2028-02-29' }).recordId, 'contract-1')
  assert.deepEqual(root('payment', { paymentCycle: '', paymentAnchorDate: '' }).values, { paymentCycle: '', paymentAnchorDate: '' })
  for (const values of [{}, { paymentCycle: '', paymentAnchorDate: '2026-11-05' }, { paymentCycle: 'monthly', paymentAnchorDate: '' }, { paymentCycle: 'weekly', paymentAnchorDate: '2026-11-05' }, { paymentCycle: 'monthly', paymentAnchorDate: '2026-02-29' }, { paymentCycle: 'monthly', paymentAnchorDate: '2026-11-05', transportOrderId: 'forged' }]) assert.throws(() => root('payment', values), { code: 'invalid-argument' })
})

test('contract remarks are bounded multiline root values and allocations are exact integer percentages', () => {
  assert.equal(root('remark', { remark: '  Zeile 1\nZeile 2  ' }).values.remark, 'Zeile 1\nZeile 2')
  for (const values of [{}, { remark: 'A'.repeat(4001) }, { remark: 'Text', categoryId: 'forged' }]) assert.throws(() => root('remark', values), { code: 'invalid-argument' })
  assert.deepEqual(root('allocation', { allocations: [] }).values, { allocations: [] })
  const good = [{ categoryId: 'it', basisPoints: 3333 }, { categoryId: 'office', basisPoints: 6667 }]
  assert.equal(root('allocation', { allocations: good }).values.allocations.length, 2)
  for (const allocations of [
    [{ categoryId: 'it', basisPoints: 9999 }], [{ categoryId: 'it', basisPoints: 10001 }],
    [{ categoryId: 'it', basisPoints: 0 }, { categoryId: 'office', basisPoints: 10000 }],
    [{ categoryId: 'it', basisPoints: 5000.5 }, { categoryId: 'office', basisPoints: 4999.5 }],
    [{ categoryId: 'it', basisPoints: 5000 }, { categoryId: 'it', basisPoints: 5000 }],
    [{ categoryId: '../it', basisPoints: 10000 }], [{ categoryId: 'it', basisPoints: 10000, name: 'forged' }],
    Array.from({ length: 51 }, (_, index) => ({ categoryId: `category-${index}`, basisPoints: 100 })),
  ]) assert.throws(() => root('allocation', { allocations }), { code: 'invalid-argument' })
  assert.throws(() => normalizeContractMutation({ contractId: 'contract-1', mutationId: 'allocation-mutation', action: 'position.save', values: { title: 'Posten', grossAmountCents: 100, billingCycle: 'monthly', anchorDate: '2026-11-05', allocations: good } }), { code: 'invalid-argument' })
})
