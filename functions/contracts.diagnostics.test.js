import test from 'node:test'
import assert from 'node:assert/strict'
import { canReportLinkDiagnostic, normalizeClientDiagnostic } from './diagnostics.js'

test('contract diagnostics require their own permission and exclude partner names', () => {
  for (const stage of ['load', 'save']) {
    const event = normalizeClientDiagnostic({ module: 'contracts', stage, code: 'unavailable', recordId: 'contract-1', partnerName: 'Private partner', message: 'Private partner' })
    assert.equal(event.recordId, 'contract-1')
    assert.equal(JSON.stringify(event).includes('Private partner'), false)
  }
  assert.equal(canReportLinkDiagnostic({ role: 'admin', permissions: {} }, 'contracts'), false)
  assert.equal(canReportLinkDiagnostic({ role: 'user', permissions: { documents: 'edit' } }, 'contracts'), false)
  assert.equal(canReportLinkDiagnostic({ role: 'user', permissions: { contracts: 'view' } }, 'contracts'), true)
  assert.equal(canReportLinkDiagnostic({ role: 'superadmin' }, 'contracts'), true)
  for (const context of [{ orderId: 'order-1' }, { recordId: 'path/private' }, { recordId: '\nunsafe' }]) {
    assert.throws(() => normalizeClientDiagnostic({ module: 'contracts', stage: 'load', code: 'internal', ...context }), { code: 'invalid-argument' })
  }
  assert.throws(() => normalizeClientDiagnostic({ module: 'contracts', stage: 'delete', code: 'internal' }), { code: 'invalid-argument' })
})
