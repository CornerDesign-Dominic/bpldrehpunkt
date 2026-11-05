import assert from 'node:assert/strict'
import test from 'node:test'
import { allocationDraft, allocationPercentInput, normalizeContractAllocations, parseAllocationPercent } from './contractAllocations.js'

const categories = [{ id: 'mobile', name: 'Mobilfunk', active: true }, { id: 'office', name: 'Büro', active: true }, { id: 'old', name: 'Archiviert', active: false }]
const normalize = (rows, previous) => normalizeContractAllocations(rows, categories, previous)

test('allocation percentages use exact basis points with at most two decimal places', () => {
  assert.equal(parseAllocationPercent('33,33'), 3333)
  assert.equal(parseAllocationPercent('0.01'), 1)
  assert.equal(parseAllocationPercent('100'), 10000)
  for (const value of ['', '0', '-1', '100.01', '33.333', '1e2', 'Infinity', 'NaN', '1.2.3']) assert.equal(parseAllocationPercent(value), null)
  assert.equal(allocationPercentInput(3333), '33.33')
  assert.equal(allocationPercentInput(10000), '100')
  assert.equal(allocationPercentInput(1), '0.01')
})

test('whole contract allocation must total exactly 100 percent while explicit clear remains valid', () => {
  assert.deepEqual(normalize([{ categoryId: 'mobile', percent: '33,33' }, { categoryId: 'office', percent: '66.67' }]), [{ categoryId: 'mobile', basisPoints: 3333 }, { categoryId: 'office', basisPoints: 6667 }])
  assert.deepEqual(normalize([]), [])
  assert.throws(() => normalize([{ categoryId: 'mobile', percent: '99.99' }]), { code: 'contract-allocation/total' })
  assert.throws(() => normalize([{ categoryId: 'mobile', percent: '100' }, { categoryId: 'office', percent: '0.01' }]), { code: 'contract-allocation/total' })
})

test('categories are unique, known and active unless the exact inactive allocation was already stored', () => {
  assert.throws(() => normalize([{ categoryId: 'mobile', percent: '50' }, { categoryId: 'mobile', percent: '50' }]), { code: 'contract-allocation/duplicate' })
  assert.throws(() => normalize([{ categoryId: 'old', percent: '100' }]), { code: 'contract-allocation/inactive' })
  assert.deepEqual(normalize([{ categoryId: 'old', percent: '100' }], [{ categoryId: 'old', basisPoints: 10000 }]), [{ categoryId: 'old', basisPoints: 10000 }])
  assert.throws(() => normalize([{ categoryId: 'old', percent: '50' }, { categoryId: 'mobile', percent: '50' }], [{ categoryId: 'old', basisPoints: 10000 }]), { code: 'contract-allocation/inactive' })
  const unresolved = [{ categoryId: 'missing', basisPoints: 10000 }]
  assert.deepEqual(allocationDraft(unresolved), [{ categoryId: 'missing', percent: '100' }], 'historical unresolved entries remain visible for explicit resolution')
  assert.throws(() => normalize(allocationDraft(unresolved), unresolved), { code: 'contract-allocation/unresolved' })
  assert.throws(() => normalize(Array.from({ length: 51 }, () => ({ categoryId: 'mobile', percent: '1' }))), { code: 'contract-allocation/limit' })
})
