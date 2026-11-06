import test from 'node:test'
import assert from 'node:assert/strict'
import { mailTriageDate, mailTriageDeletionItems, mailTriageFilterPayload } from './mailTriageQuality.js'
import { canView, canEdit, normalizePermissions } from './permissions.js'

test('quality and cleanup permissions are not implicitly granted or interchangeable', () => {
  const defaults = normalizePermissions({ handbook: 'edit', mailboxes: 'edit' })
  assert.equal(defaults.mailTriageQuality, 'none')
  assert.equal(defaults.mailTriageCleanup, 'none')
  const reader = { role: 'user', permissions: { mailTriageQuality: 'view' } }
  assert.equal(canView(reader, 'mailTriageQuality'), true)
  assert.equal(canEdit(reader, 'mailTriageQuality'), false)
  assert.equal(canEdit(reader, 'mailTriageCleanup'), false)
  assert.equal(canView({ role: 'user', permissions: { mailTriageCleanup: 'edit' } }, 'mailTriageQuality'), false)
})

test('filter submissions only include active supported query fields and keep Berlin date inputs intact', () => {
  assert.deepEqual(mailTriageFilterPayload({ status: 'new', outcome: '', kind: ' court ', mailbox: ' test@example.com ', dateFrom: '2026-11-05', dateUntil: '2026-11-06', hidden: 'do not transmit', cursor: 'old cursor' }), { status: 'new', kind: 'court', mailbox: 'test@example.com', dateFrom: '2026-11-05', dateUntil: '2026-11-06' })
})

test('cleanup payload is limited to explicitly selected loaded records and their exact revisions', () => {
  const records = [{ id: 'one', revision: 3, comment: 'private' }, { id: 'two', revision: 4 }]
  assert.deepEqual(mailTriageDeletionItems(records, ['one', 'not-loaded', 'one']), [{ id: 'one', revision: 3 }])
  assert.deepEqual(mailTriageDeletionItems(records, []), [])
  assert.equal(records[0].comment, 'private')
})

test('feedback dates show the Berlin day across a UTC date boundary', () => {
  assert.match(mailTriageDate(Date.parse('2026-11-04T23:30:00Z'), 'de'), /05\.11\.2026/)
  assert.equal(mailTriageDate(null), '—')
})
