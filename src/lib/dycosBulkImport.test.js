import assert from 'node:assert/strict'
import test from 'node:test'
import { appendDycosSearchPage, createDycosBulkJob, readDycosBulkJob, runDycosBulkImport } from './dycosBulkImport.js'

const orders = [{ externalNumber: '261100001', sourceId: 1 }, { externalNumber: '261100002', sourceId: 2 }]
const response = (request, status = 'new') => ({ externalNumber: request.taNummer, requestId: request.requestId, sourceId: String(request.expectedSourceId), orderId: `dycos-${request.taNummer}`, status, warningCodes: [] })
const job = () => createDycosBulkJob(orders, 'user-1', () => crypto.randomUUID())
function clock() { let time = 100000; return { now: () => time, wait: async ms => { time += ms } } }

test('pagination deduplicates safely and rejects stalled cursors and conflicting TA/source identities', () => {
  assert.equal(appendDycosSearchPage(orders, { orders: [orders[0]], hasMore: false }, 0).length, 2)
  assert.throws(() => appendDycosSearchPage(orders, { orders: [{ ...orders[0], sourceId: 3 }], hasMore: false }, 0))
  assert.throws(() => appendDycosSearchPage([], { orders: [], hasMore: true, nextCursor: 0 }, 0))
})

test('resume preserves unknown in-flight request identity, excludes other users and stores no preview partner data', () => {
  const initial = job(); initial.items[0].status = 'running'
  const storage = { getItem: () => JSON.stringify(initial) }
  const restored = readDycosBulkJob(storage, 'key', 'user-1')
  assert.equal(restored.items[0].status, 'pending'); assert.equal(restored.items[0].requestId, initial.items[0].requestId)
  assert.throws(() => readDycosBulkJob(storage, 'key', 'user-2'))
  assert.equal(Object.hasOwn(initial.items[0], 'customer'), false)
})

test('imports run sequentially with quota spacing and keep individual failures without stopping valid orders', async () => {
  const calls = [], timing = clock(), snapshots = []
  const final = await runDycosBulkImport(job(), { ...timing, shouldStop: () => false, onChange: value => snapshots.push(value), fetchOrder: async request => {
    calls.push({ ...request, at: timing.now() }); if (calls.length === 1) throw { code: 'functions/not-found', details: { sourceCode: 'TA_NOT_FOUND' } }
    return response(request)
  } })
  assert.equal(final.items[0].status, 'failed'); assert.equal(final.items[1].status, 'new')
  assert.ok(calls[1].at - calls[0].at >= 6500); assert.equal(snapshots[0].items[0].status, 'running')
})

test('quota wait retries the same identity, while ambiguous timeout pauses the remaining queue', async () => {
  const initial = job(); let calls = 0; const requests = []
  const final = await runDycosBulkImport(initial, { ...clock(), shouldStop: () => false, onChange: () => {}, fetchOrder: async request => {
    requests.push(request); if (++calls === 1) throw { code: 'functions/resource-exhausted', details: { retryAfterMs: 1500 } }
    if (calls === 2) throw { code: 'functions/deadline-exceeded' }
    assert.fail('Remaining requests must be paused')
  } })
  assert.equal(requests[0].requestId, requests[1].requestId)
  assert.equal(final.items[0].status, 'failed'); assert.equal(final.items[1].status, 'pending')
})

test('pause finishes the current confirmed order and sends no next request; a bad response is never marked successful', async () => {
  let stopped = false, calls = 0
  const final = await runDycosBulkImport(job(), { ...clock(), shouldStop: () => stopped, onChange: value => { if (value.items[0].status === 'new') stopped = true }, fetchOrder: async request => { calls++; return response(request) } })
  assert.equal(calls, 1); assert.equal(final.items[1].status, 'pending')
  const bad = await runDycosBulkImport(job(), { ...clock(), shouldStop: () => false, onChange: () => {}, fetchOrder: async request => ({ ...response(request), sourceId: 'wrong' }) })
  assert.equal(bad.items[0].status, 'failed'); assert.equal(bad.items[1].status, 'pending')
})
