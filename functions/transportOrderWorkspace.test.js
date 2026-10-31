import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeOrderRecordsQuery, orderRecordMatches, requireWorkspaceRefreshAccess, validateWorkspaceRefresh, refreshTransportOrderWorkspaceHandler, listTransportOrderRecordsPageHandler } from './transportOrderWorkspace.js'

const profile = { active: true, firstName: 'Test', lastName: 'User', permissions: { transportOrders: 'view', dataImports: 'edit', masterData: 'edit' } }
const request = (scope = 'all', requestId = 'request_1234567890') => ({ auth: { uid: 'user' }, data: { orderId: 'dycos-261000482', scope, requestId } })

// In-memory transactions exercise orchestration and replay without connecting
// to a live source. Separate emulator tests verify actual transaction behavior.
function memoryDb(initial = {}) {
  const values = new Map(Object.entries(initial)); const readPaths = []
  const snapshot = path => ({ exists: values.has(path), ref: ref(path), id: path.split('/').at(-1), data: () => values.get(path), get: field => field.split('.').reduce((value, key) => value?.[key], values.get(path)) })
  const ref = path => ({ path, get: async () => { readPaths.push(path); return snapshot(path) } })
  const db = {
    doc: ref, values, readPaths,
    runTransaction: async callback => {
      const writes = []
      const tx = { get: async target => snapshot(target.path), create: (target, value) => { if (values.has(target.path)) throw new Error('already exists'); writes.push(() => values.set(target.path, value)) }, set: (target, value) => writes.push(() => values.set(target.path, value)), update: (target, value) => writes.push(() => values.set(target.path, { ...values.get(target.path), ...value })), delete: target => writes.push(() => values.delete(target.path)) }
      const result = await callback(tx); writes.forEach(write => write()); return result
    },
  }
  return db
}
const initial = () => ({
  'transportOrders/dycos-261000482': { externalNumber: '261000482', imported: { customer: { partnerId: 'customer' }, carrier: { partnerId: 'carrier' } } },
  'businessPartners/customer': {}, 'businessPartners/carrier': {}, 'businessPartners/new-carrier': {},
})

test('query validation preserves exact search, page sizes and permits orders without stations', () => {
  assert.equal(normalizeOrderRecordsQuery({ search: '  REF-1 ', pageSize: 50 }).search, 'ref-1')
  assert.throws(() => normalizeOrderRecordsQuery({ loadingFrom: '2026-02-31' }), { code: 'invalid-argument' })
  assert.throws(() => normalizeOrderRecordsQuery({ cursor: 'a'.repeat(241) }), { code: 'invalid-argument' })
  assert.equal(orderRecordMatches({ imported: { customerReference: 'Ref-1' } }, normalizeOrderRecordsQuery({ search: 'ref-1' })), true)
  assert.equal(orderRecordMatches({ imported: {} }, normalizeOrderRecordsQuery({})), true)
  assert.equal(orderRecordMatches({ imported: {} }, normalizeOrderRecordsQuery({ loadingFrom: '2026-01-01' })), false)
})

test('refresh rights are scope-specific and admin does not bypass them', () => {
  assert.doesNotThrow(() => requireWorkspaceRefreshAccess(profile, 'all'))
  assert.throws(() => requireWorkspaceRefreshAccess({ ...profile, role: 'admin', permissions: { transportOrders: 'edit', dataImports: 'edit' } }, 'all'), { code: 'permission-denied' })
  assert.doesNotThrow(() => requireWorkspaceRefreshAccess({ ...profile, permissions: { transportOrders: 'view', masterData: 'edit' } }, 'partners'))
  assert.throws(() => validateWorkspaceRefresh({ ...request().data, orderId: '../users' }), { code: 'invalid-argument' })
})

test('all refresh uses newly imported partner bindings, records safe outcome and replays without calls', async () => {
  const db = memoryDb(initial()); const calls = []
  const deps = {
    db, requireProfile: async () => profile,
    fetchOrder: async () => { calls.push('order'); db.values.get('transportOrders/dycos-261000482').imported.carrier.partnerId = 'new-carrier'; return { status: 'updated', partnerUpdates: { conflicts: 1 } } },
    refreshPartner: async req => { calls.push(req.data.partnerId); return { status: 'unchanged', conflicts: 0 } },
  }
  const result = await refreshTransportOrderWorkspaceHandler(request(), deps)
  assert.equal(result.status, 'success')
  assert.deepEqual(calls, ['order', 'customer', 'new-carrier'])
  const replay = await refreshTransportOrderWorkspaceHandler(request(), deps)
  assert.deepEqual(replay, result)
  assert.equal(calls.length, 3)
  const receipt = db.values.get(`transportOrders/dycos-261000482/refreshes/${result.recordId}`)
  assert.equal(receipt.actorId, 'user'); assert.equal(receipt.actorName, 'Test User')
  assert.equal(receipt.result.order.conflicts, 1)
  await assert.rejects(refreshTransportOrderWorkspaceHandler(request('partners'), deps), { code: 'invalid-argument' })
})

test('failed partner call yields partial and sensitive error text never enters the ledger', async () => {
  const db = memoryDb(initial())
  const result = await refreshTransportOrderWorkspaceHandler(request(), { db, requireProfile: async () => profile, fetchOrder: async () => ({ status: 'unchanged' }), refreshPartner: async () => { throw Object.assign(new Error('protected source response'), { code: 'unavailable' }) } })
  assert.equal(result.status, 'partial')
  assert.equal(result.partners.length, 2)
  assert.equal(JSON.stringify([...db.values]).includes('protected source response'), false)
})

test('failed order call does not refresh stale partners and persists failure', async () => {
  const db = memoryDb(initial()); let calls = 0
  const result = await refreshTransportOrderWorkspaceHandler(request(), { db, requireProfile: async () => profile, fetchOrder: async () => { throw Object.assign(new Error(), { code: 'not-found' }) }, refreshPartner: async () => { calls++; return {} } })
  assert.equal(result.status, 'failed'); assert.equal(calls, 0)
  assert.equal(result.order.code, 'not-found')
})

test('invalid child results never imply an update and emit bounded technical diagnosis', async () => {
  const db = memoryDb(initial()); const reports = []
  const result = await refreshTransportOrderWorkspaceHandler(request('order'), { db, requireProfile: async () => profile, fetchOrder: async () => ({}), report: async event => reports.push(event) })
  assert.equal(result.status, 'failed'); assert.equal(result.order.code, 'invalid-response')
  assert.equal(reports.length, 1); assert.equal(reports[0].code, 'source_invalid_response')
})

test('duplicate partner links and merged references are refreshed once', async () => {
  const source = initial(); source['businessPartners/carrier'] = { mergedIntoPartnerId: 'customer' }
  const db = memoryDb(source); const calls = []
  const result = await refreshTransportOrderWorkspaceHandler(request('partners'), { db, requireProfile: async () => profile, refreshPartner: async req => { calls.push(req.data.partnerId); return { status: 'unchanged' } } })
  assert.equal(result.status, 'success'); assert.deepEqual(calls, ['customer'])
})

test('unconfirmed completion keeps the same request pending and never repeats child calls', async () => {
  const db = memoryDb(initial()); let calls = 0, transactions = 0; const transaction = db.runTransaction
  db.runTransaction = async callback => { transactions++; if (transactions === 2) throw new Error('lost confirmation'); return transaction(callback) }
  let now = 1000
  const deps = { db, requireProfile: async () => profile, now: () => now, report: async () => {}, fetchOrder: async () => { calls++; return { status: 'updated' } } }
  await assert.rejects(refreshTransportOrderWorkspaceHandler(request('order'), deps), { code: 'unavailable' })
  await assert.rejects(refreshTransportOrderWorkspaceHandler(request('order'), deps), { code: 'aborted' })
  now += 11 * 60_000
  const result = await refreshTransportOrderWorkspaceHandler(request('order'), deps)
  assert.equal(result.status, 'failed'); assert.equal(result.code, 'interrupted'); assert.equal(calls, 1)
})

test('records list reads only order documents and projection status, retaining continuation matches', async () => {
  const orderDocs = Array.from({ length: 27 }, (_, i) => ({ id: `order-${i}`, data: () => ({ externalNumber: `${i}`, imported: { customerReference: 'REF' } }) }))
  const reads = []; let after = null
  const collection = {
    orderBy() { return this }, limit() { return this }, startAfter(snapshot) { after = snapshot.id; return this },
    async get() { reads.push('orders'); const start = after ? orderDocs.findIndex(d => d.id === after) + 1 : 0; return { docs: orderDocs.slice(start, start + 26) } },
  }
  const db = { doc(path) { reads.push(path); return { get: async () => ({ get: () => false }) } }, collection(path) { assert.equal(path, 'transportOrders'); return collection } }
  const result = await listTransportOrderRecordsPageHandler({ data: { search: 'ref', pageSize: 25 } }, { db, requireProfile: async () => profile })
  assert.equal(result.orders.length, 25); assert.equal(result.hasMore, true); assert.equal(result.nextCursor, 'order-24')
  assert.equal(reads.some(path => /tracking|settings/i.test(path)), false)
})
