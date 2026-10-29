import test from 'node:test'
import assert from 'node:assert/strict'
import { canReportLinkDiagnostic, normalizeClientDiagnostic } from './diagnostics.js'

test('quality diagnostics preserve separate module permissions and exclude protocol contents', () => {
  for (const module of ['kvp', 'handbook']) {
    assert.equal(canReportLinkDiagnostic({ role: 'admin', permissions: {} }, module), false)
    assert.equal(canReportLinkDiagnostic({ role: 'user', permissions: { [module]: 'none' } }, module), false)
    assert.equal(canReportLinkDiagnostic({ role: 'user', permissions: { [module]: 'view' } }, module), true)
    assert.equal(canReportLinkDiagnostic({ role: 'user', permissions: { [module]: 'edit' } }, module), true)
    assert.equal(canReportLinkDiagnostic({ role: 'superadmin' }, module), true)
    const otherModule = module === 'kvp' ? 'handbook' : 'kvp'
    assert.equal(canReportLinkDiagnostic({ role: 'user', permissions: { [otherModule]: 'edit' } }, module), false)
    for (const stage of ['load', 'save', 'history']) {
      const event = normalizeClientDiagnostic({ module, stage, code: 'internal', recordId: 'quality-1', message: 'private meeting notes', participants: 'private participants', plan: 'private plan', situation: 'private handbook content' })
      assert.deepEqual(Object.keys(event).sort(), ['module', 'stage', 'code', 'orderId', 'recordId', 'message'].sort())
      assert.equal(event.recordId, 'quality-1')
      assert.equal(event.orderId, '')
      assert.equal(JSON.stringify(event).includes('private'), false)
    }
    assert.throws(() => normalizeClientDiagnostic({ module, stage: 'delete', code: 'internal' }), { code: 'invalid-argument' })
    assert.throws(() => normalizeClientDiagnostic({ module, stage: 'save', code: 'invalid-argument' }), { code: 'invalid-argument' })
    assert.throws(() => normalizeClientDiagnostic({ module, stage: 'load', code: 'internal', orderId: 'order-1' }), { code: 'invalid-argument' })
    for (const recordId of ['path/record', 'a'.repeat(241), 'record\nunsafe', '\u007f', 123, '   ']) {
      assert.throws(() => normalizeClientDiagnostic({ module, stage: 'history', code: 'internal', recordId }), { code: 'invalid-argument' })
    }
  }
})

test('mailbox diagnostics require module access and exclude personal mail context', () => {
  assert.equal(canReportLinkDiagnostic({ role: 'admin', permissions: {} }, 'mailboxes'), false)
  assert.equal(canReportLinkDiagnostic({ role: 'user', permissions: { mailboxes: 'view' } }, 'mailboxes'), true)
  const event = normalizeClientDiagnostic({ module: 'mailboxes', stage: 'send', code: 'unavailable', message: 'private mail body' })
  assert.equal(event.message, 'Antwort konnte nicht zuverlässig übermittelt werden.')
  assert.equal(event.orderId, '')
  for (const context of [{ orderId: 'order-1' }, { recordId: 'personal-mail-1' }]) {
    assert.throws(() => normalizeClientDiagnostic({ module: 'mailboxes', stage: 'send', code: 'unavailable', ...context }), { code: 'invalid-argument' })
  }
})
