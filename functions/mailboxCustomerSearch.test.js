import test from 'node:test'
import assert from 'node:assert/strict'
import { checkedCustomerMatches, findDycosCustomers, searchMailboxOrderCustomers } from './mailboxCustomerSearch.js'
import { mailboxCustomerSearchCriteria, mailboxCustomerSearchKey } from './shared/mailboxCustomerSearch.js'
const row = (id = 1, extra = {}) => ({ ID: id, Debitorennummer: id + 10000, Firma: 'Test GmbH', USTID: 'DE123456789', PLZ: '42103', Ort: 'Wuppertal', ...extra })
const payload = (rows = [], more = false) => ({ schemaVersion: 1, modus: 'kundensuche', treffer: rows, more })
const criteria = { vatId: 'DE123456789', postalCode: '42103', city: 'Wuppertal', name: 'Test' }

test('criteria require VAT or both location fields and normalize VAT formatting', () => {
  assert.equal(mailboxCustomerSearchCriteria({ customerVatId: 'de 123.456.789' }).vatId, 'DE123456789')
  for (const input of [{}, { customerPostalCode: '42103' }, { customerVatId: "DE123' OR 1=1" }, { customerCity: 'A\nB' }]) assert.throws(() => mailboxCustomerSearchCriteria(input))
})
test('VAT matches are narrowed by postcode and city, never silently picked', async () => {
  const result = await findDycosCustomers(criteria, async () => payload([row(1, { Ort: 'Berlin' }), row(2), row(3)]))
  assert.equal(result.status, 'found'); assert.deepEqual(result.matches.map(item => item.sourceId), ['2', '3'])
})
test('VAT miss falls back to location but conflicting VAT does not release a placeholder', async () => {
  let count = 0
  const result = await findDycosCustomers(criteria, async () => ++count === 1 ? payload() : payload([row(1, { USTID: 'DE999999999' })]))
  assert.equal(count, 2); assert.equal(result.status, 'conflict'); assert.equal(result.matches.length, 0)
})
test('a successful empty VAT and location result is a genuine no-match', async () => {
  const result = await findDycosCustomers(criteria, async () => payload())
  assert.equal(result.status, 'none')
})
test('technical errors, truncated results and duplicate IDs are never no-match', async () => {
  await assert.rejects(findDycosCustomers(criteria, async () => { throw Error('offline') }))
  assert.throws(() => checkedCustomerMatches(payload([row()], true)), { code: 'failed-precondition' })
  assert.throws(() => checkedCustomerMatches(payload([row(), row()])), { code: 'unavailable' })
  assert.throws(() => checkedCustomerMatches({}), { code: 'unavailable' })
})
test('returned customer rows are an allowlist without bank or contact fields', () => {
  const result = checkedCustomerMatches(payload([row(1, { IBAN: 'never return', EMailZentrale: 'never return' })]))[0]
  assert.equal(result.IBAN, undefined); assert.equal(result.EMailZentrale, undefined)
})
const previewId = '11111111-1111-4111-8111-111111111111', now = 1000
const context = { uid: 'owner', connectionId: 'connection', connection: { graphUserId: 'graph' } }
const input = { previewId, messageId: 'mail', order: { customerVatId: criteria.vatId } }
function memory() {
  const records = new Map([[`mailboxOrderPreviews/${previewId}`, { ownerId: 'owner', connectionId: 'connection', graphUserId: 'graph', messageId: 'mail', expiresAt: now + 3600000 }], ['mailboxConnections/connection', { ownerId: 'owner', status: 'connected' }]])
  const db = { records, doc: path => ({ path }), runTransaction: async callback => {
    const writes = []; const result = await callback({ get: async ref => ({ data: () => records.get(ref.path) }), set: (ref, value) => writes.push([ref.path, value]), update: (ref, value) => writes.push([ref.path, { ...records.get(ref.path), ...value }]) }); writes.forEach(([path, value]) => records.set(path, value)); return result
  } }
  return db
}
test('search stores a scoped server proof and blocks foreign previews before contacting DyCoS', async () => {
  const db = memory(); let calls = 0
  await assert.rejects(searchMailboxOrderCustomers({ db, context: { ...context, uid: 'foreign' }, data: input, now, fetchMatches: async () => { calls++; return payload() } }), { code: 'permission-denied' })
  assert.equal(calls, 0)
  const result = await searchMailboxOrderCustomers({ db, context, data: input, now, fetchMatches: async () => payload() })
  assert.equal(result.status, 'none'); assert.equal(result.criteriaKey, mailboxCustomerSearchKey(input.order))
  assert.equal(db.records.get(`mailboxOrderPreviews/${previewId}`).customerSearch.searchId, result.searchId)
  await assert.rejects(searchMailboxOrderCustomers({ db, context, data: input, now, fetchMatches: async () => payload() }), { code: 'resource-exhausted' })
})
test('failed searches invalidate old proof and never mark the search as empty', async () => {
  const db = memory()
  await assert.rejects(searchMailboxOrderCustomers({ db, context, data: input, now, fetchMatches: async () => { throw Error('timeout') } }), { code: 'unavailable' })
  const proof = db.records.get(`mailboxOrderPreviews/${previewId}`).customerSearch
  assert.equal(proof.status, 'failed'); assert.equal(proof.searchId, undefined)
})


test('exactly one genuine match is automatically imported and assigned', async () => {
  const db = memory(); let imports = 0
  const result = await searchMailboxOrderCustomers({ db, context, data: input, now, fetchMatches: async () => payload([row(1)]), assignCustomer: async request => { imports++; assert.equal(request.data.customerSourceId, '1'); assert.ok(request.data.customerSearchId); return { partnerId: 'imported', number: '10001', sourceId: '1' } } })
  // 10001 is reserved for the explicitly confirmed placeholder.
  assert.equal(imports, 0); assert.equal(result.assignment, undefined)
  const db2 = memory()
  const single = await searchMailboxOrderCustomers({ db: db2, context, data: input, now, fetchMatches: async () => payload([row(2)]), assignCustomer: async request => { imports++; assert.equal(request.data.customerSourceId, '2'); return { partnerId: 'imported', number: '10002', sourceId: '2' } } })
  assert.equal(imports, 1); assert.equal(single.assignment.partnerId, 'imported')
})
test('multiple matches are never imported before user selection; import failure preserves real matches', async () => {
  const db = memory()
  const result = await searchMailboxOrderCustomers({ db, context, data: input, now, fetchMatches: async () => payload([row(2), row(3)]), assignCustomer: async () => assert.fail('No automatic import with ambiguous candidates') })
  assert.equal(result.matches.length, 2); assert.equal(result.assignment, undefined)
  const failed = await searchMailboxOrderCustomers({ db: memory(), context, data: input, now, fetchMatches: async () => payload([row(2)]), assignCustomer: async () => { throw Error('import unavailable') } })
  assert.equal(failed.status, 'found'); assert.equal(failed.matches.length, 1); assert.equal(failed.assignment, undefined); assert.equal(failed.assignmentError.code, 'unavailable')
})
