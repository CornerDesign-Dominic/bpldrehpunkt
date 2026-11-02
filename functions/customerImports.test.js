import assert from 'node:assert/strict'
import test from 'node:test'
import { canApproveCustomerImportRow, canClaimCustomerImportRow, hasCustomerImportAccess, reviewedQueueRow, sameCustomerImportValue } from './customerImports.js'

test('a claimed review row cannot be claimed or completed contradictorily by another user', () => {
  const futureLock = { userId: 'user-a', expiresAt: { toMillis: () => Date.now() + 60_000 } }
  const row = { state: 'open', lock: futureLock }
  assert.equal(canClaimCustomerImportRow(row, 'user-a'), true)
  assert.equal(canClaimCustomerImportRow(row, 'user-b'), false)
  assert.equal(canApproveCustomerImportRow(row, 'user-a'), true)
  assert.equal(canApproveCustomerImportRow(row, 'user-b'), false)
})

test('a numeric and textual creditor number are semantically equal, while a real concurrent change remains a conflict', () => {
  assert.equal(sameCustomerImportValue('linkedCreditorNumber', 75397, '75397'), true)
  assert.equal(sameCustomerImportValue('linkedCreditorNumber', ' 75397 ', 75397), true)
  assert.equal(sameCustomerImportValue('linkedCreditorNumber', '75397', '75398'), false)
})

test('a reviewed queue row moves from open to accepted immediately', () => {
  const completed = reviewedQueueRow({ id: 'customer-review-10689', state: 'open', debtorNumber: '10689' }, { type: 'reviewed' })
  assert.equal(completed.state, 'accepted')
  assert.equal(completed.approval.type, 'reviewed')
  assert.equal(canApproveCustomerImportRow(completed, 'user-a'), false)
})

test('the queue requires both import and master-data edit permission', () => {
  assert.equal(hasCustomerImportAccess({ permissions: { dataImports: 'edit', masterData: 'edit' } }), true)
  assert.equal(hasCustomerImportAccess({ permissions: { dataImports: 'edit', masterData: 'view' } }), false)
  assert.equal(hasCustomerImportAccess({ role: 'superadmin', permissions: {} }), true)
})
