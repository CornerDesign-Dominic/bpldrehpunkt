import assert from 'node:assert/strict'
import test from 'node:test'
import { createImportJob, importManifest, restoreImportJob, resumeImportJob, withImportTabLock } from './dycosImportSession.js'

test('interrupted single and bulk jobs retain request identities and only acknowledged success clears on the next visit', () => {
  for (const kind of ['single', 'bulk']) {
    const job = createImportJob([{ taNummer: '261100001', ...(kind === 'bulk' ? { expectedSourceId: 12 } : {}) }], 'user', kind)
    job.items[0].status = 'running'
    const restored = restoreImportJob(JSON.stringify(job), 'user', kind)
    assert.equal(restored.items[0].status, 'pending')
    assert.deepEqual(importManifest(restored), importManifest(job))
    assert.throws(() => restoreImportJob(JSON.stringify(job), 'different-user', kind))
    restored.items[0].status = 'updated'
    assert.ok(restoreImportJob(JSON.stringify(restored), 'user', kind))
    restored.acknowledged = true
    assert.equal(restoreImportJob(JSON.stringify(restored), 'user', kind), null)
  }
})

test('server recovery skips saved successes and reuses the same identities for pending and failed rows', () => {
  const job = createImportJob([{ taNummer: '261100001', expectedSourceId: 1 }, { taNummer: '261100002', expectedSourceId: 2 }], 'user', 'bulk')
  const detail = { resume: { runId: job.runId, kind: job.kind, items: importManifest(job).items }, rows: [{ id: job.items[0].requestId, status: 'Neu', orderId: 'dycos-261100001' }, { id: job.items[1].requestId, status: 'Fehlerhaft' }] }
  const resumed = resumeImportJob(detail, 'user')
  assert.deepEqual(resumed.items.map(item => item.status), ['new', 'pending'])
  assert.deepEqual(importManifest(resumed), importManifest(job))
})

test('cross-tab mutex rejects another tab and unsupported browsers without starting an import', async () => {
  let called = false
  await assert.rejects(withImportTabLock('user', () => { called = true }, { request: async (key, options, callback) => { assert.match(key, /user$/); assert.equal(options.ifAvailable, true); return callback(null) } }))
  assert.equal(called, false)
  await assert.rejects(withImportTabLock('user', () => { called = true }, {}))
  assert.equal(called, false)
  assert.equal(await withImportTabLock('user', () => 42, { request: async (key, options, callback) => callback({ name: key }) }), 42)
})
