import { Buffer } from 'node:buffer'
import test from 'node:test'
import assert from 'node:assert/strict'
import { assertMailboxAgbAccess, validateAgbAttachments, analyzeMailboxAgb, assignMailboxAgbCustomer } from './mailboxAgb.js'

const context = { uid: 'owner', profile: { active: true, permissions: { agbChecker: 'view', masterData: 'view' } } }
const file = { id: 'pdf1', name: 'terms.pdf', contentType: 'application/pdf', size: 100, '@odata.type': '#microsoft.graph.fileAttachment' }
function database(entries = []) {
  const records = new Map(entries)
  const db = { doc: path => ({ path }), runTransaction: async fn => fn({ get: async ref => ({ data: () => records.get(ref.path) }), set: (ref, data) => records.set(ref.path, data), update: (ref, data) => records.set(ref.path, { ...records.get(ref.path), ...data }) }) }
  return { db, records }
}
test('requires active AGB permission, including for admins with inactive profiles', () => {
  assertMailboxAgbAccess(context)
  for (const profile of [{ active: true, permissions: {} }, { active: false, role: 'superadmin' }]) assert.throws(() => assertMailboxAgbAccess({ profile }), { code: 'permission-denied' })
})
test('selects ALL PDFs by MIME or extension, including inline PDFs, and rejects partial or oversized sets', () => {
  assert.equal(validateAgbAttachments({ value: [file, { ...file, id: 'pdf2', isInline: true }, { ...file, id: 'pdf3', contentType: 'application/octet-stream', name: 'AGB.PDF' }, { contentType: 'image/png', name: 'logo.png' }] }).length, 3)
  for (const list of [{ value: [] }, { value: [file], '@odata.nextLink': 'more' }, { value: Array(21).fill(file) }, { value: [{ ...file, size: 6 * 1024 * 1024 }] }, { value: [{ ...file, '@odata.type': '#microsoft.graph.referenceAttachment' }] }]) assert.throws(() => validateAgbAttachments(list), { code: 'failed-precondition' })
})
test('extracts every attachment before ONE combined analysis; never includes email text', async () => {
  const { db } = database()
  let input
  const result = await analyzeMailboxAgb({ db, context, now: 1000, files: [{ name: 'order.pdf', contentBytes: 'YQ==' }, { name: 'terms.pdf', contentBytes: 'Yg==' }], extract: async bytes => ({ text: `[Seite 1] ${Buffer.from(bytes).toString()}`, pageCount: 1 }), analyze: async value => { input = value; return { historyId: 'saved' } } })
  assert.equal(result.historyId, 'saved')
  assert.equal(input.pageCount, 2)
  assert.equal(input.sourceFiles.length, 2)
  assert.match(input.text, /order.pdf/); assert.match(input.text, /terms.pdf/)
  assert.deepEqual(Object.keys(input).sort(), ['apiKey', 'pageCount', 'sourceFiles', 'text', 'userId'])
})
test('unreadable attachment and total limits abort without analysing or saving partial results', async () => {
  for (const extract of [async () => { throw new Error('scan') }, async () => ({ text: 'text', pageCount: 101 }), async () => ({ text: 'x'.repeat(160001), pageCount: 1 })]) {
    const { db } = database()
    await assert.rejects(analyzeMailboxAgb({ db, context, now: 1000, files: [{ name: 'x.pdf', contentBytes: 'YQ==' }], extract, analyze: () => assert.fail('must not analyse partial text') }), { code: 'failed-precondition' })
  }
})
test('hourly quota prevents unbounded repeated AI requests', async () => {
  const { db } = database()
  const args = { db, context, now: 1000, files: [], analyze: async () => ({}) }
  for (let i = 0; i < 20; i++) await analyzeMailboxAgb(args)
  await assert.rejects(analyzeMailboxAgb(args), { code: 'resource-exhausted' })
})
test('optional assignment accepts only real debtor references and own mailbox history', async () => {
  const { db, records } = database([['agbCheckerHistory/history', { createdByUserId: 'owner', channel: 'personal_mailbox' }], ['businessPartners/customer', { companyName: 'Customer', debtorNumber: '1234', roles: { customer: true } }]])
  const data = { historyId: 'history', partnerId: 'customer', debtorNumber: '1234' }
  const result = await assignMailboxAgbCustomer({ db, context, data })
  assert.equal(result.customerAssignment.debtorNumber, '1234')
  await assert.rejects(assignMailboxAgbCustomer({ db, context, data: { ...data, debtorNumber: 'unverified' } }), { code: 'failed-precondition' })
  records.set('agbCheckerHistory/history', { createdByUserId: 'another', channel: 'personal_mailbox' })
  await assert.rejects(assignMailboxAgbCustomer({ db, context, data }), { code: 'permission-denied' })
  await assert.rejects(assignMailboxAgbCustomer({ db, context: { ...context, profile: { ...context.profile, permissions: { agbChecker: 'view' } } }, data }), { code: 'permission-denied' })
})
