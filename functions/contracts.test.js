import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeContractMutation, requireContractEdit } from './contracts.js'

const base = { contractId: 'contract-1', mutationId: 'mutation-1', action: 'details', expectedRevision: 0, values: { partnerName: ' Partner GmbH ' } }
test('contract mutations validate business fields and reject forged metadata', () => {
  assert.equal(normalizeContractMutation(base).values.partnerName, 'Partner GmbH')
  for (const data of [
    { ...base, createdBy: 'forged' }, { ...base, contractId: 'contracts/other' },
    { ...base, mutationId: '' }, { ...base, expectedRevision: -1 },
    ...[{ partnerName: '' }, { partnerName: 'A'.repeat(241) }, { costBasis: 'gross' }, { revision: 7 }].map((values) => ({ ...base, values: { ...base.values, ...values } })),
  ]) assert.throws(() => normalizeContractMutation(data), { code: 'invalid-argument' })
})
test('contract positions bind gross cents, supported billing cycles and a real anchor date', () => {
  const input = { ...base, action: 'position.save', values: { title: 'Lizenz', grossAmountCents: 1234, billingCycle: 'monthly', anchorDate: '2026-11-05' } }
  assert.equal(normalizeContractMutation(input).values.grossAmountCents, 1234)
  assert.equal(normalizeContractMutation({ ...input, values: { ...input.values, billingCycle: 'half-yearly' } }).values.billingCycle, 'half-yearly')
  for (const values of [{ grossAmountCents: 12.2 }, { grossAmountCents: -1 }, { grossAmountCents: 1e11 + 1 }, { billingCycle: 'weekly' }, { title: '' }, { anchorDate: '' }, { anchorDate: '2026-02-29' }, { quantity: 1 }, { unitPriceCents: 1 }, { reference: 'old' }]) assert.throws(() => normalizeContractMutation({ ...input, values: { ...input.values, ...values } }), { code: 'invalid-argument' })
})
test('contract deadlines require real dates and valid local times', () => {
  const input = { ...base, action: 'deadline.save', values: { title: 'Kündigung', type: 'cancellation', date: '2028-02-29', time: '23:59', completed: false } }
  assert.equal(normalizeContractMutation(input).values.date, '2028-02-29')
  for (const values of [{ date: '2026-02-29' }, { date: '2026-04-31' }, { date: '0000-01-01' }, { time: '24:00' }, { completed: 'false' }, { type: 'unknown' }]) assert.throws(() => normalizeContractMutation({ ...input, values: { ...input.values, ...values } }), { code: 'invalid-argument' })
})
test('contract PDFs bind names, bounded size and type while notes remain append only', () => {
  const input = { ...base, action: 'document.reserve', recordId: 'pdf-1', values: { title: 'Vertrag', fileName: 'vertrag.pdf', fileSize: 100, contentType: 'application/pdf', pageCount: null } }
  assert.equal(normalizeContractMutation(input).values.fileSize, 100)
  for (const values of [{ fileSize: 0 }, { fileSize: 20 * 1024 * 1024 + 1 }, { contentType: 'text/plain' }, { fileName: '../secret.pdf' }, { pageCount: 0 }, { storagePath: 'private/path' }]) assert.throws(() => normalizeContractMutation({ ...input, values: { ...input.values, ...values } }), { code: 'invalid-argument' })
  assert.throws(() => normalizeContractMutation({ ...base, action: 'note.add', expectedRevision: 1, values: { text: 'Notiz' } }), { code: 'invalid-argument' })
})
test('contract edit access requires an explicitly active profile and its own module', () => {
  for (const profile of [null, {}, { active: true, role: 'admin', permissions: {} }, { active: true, permissions: { contracts: 'view' } }, { active: false, role: 'superadmin' }, { role: 'superadmin' }, { active: true, permissions: { documents: 'edit' } }]) assert.throws(() => requireContractEdit(profile), { code: 'permission-denied' })
  requireContractEdit({ active: true, role: 'user', permissions: { contracts: 'edit' } })
  requireContractEdit({ active: true, role: 'superadmin' })
})
