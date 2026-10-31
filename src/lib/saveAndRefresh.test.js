import test from 'node:test'
import assert from 'node:assert/strict'
import { saveAndRefresh } from './saveAndRefresh.js'

test('a confirmed creation remains acknowledged after a failed read; retrying the read cannot create twice', async () => {
  let writes = 0, reads = 0
  const reload = async () => { reads += 1; if (reads === 1) throw new Error('read unavailable') }
  const saved = await saveAndRefresh(async () => { writes += 1; return 'created-id' }, reload)
  assert.equal(saved.result, 'created-id')
  assert.match(saved.refreshError.message, /unavailable/)
  await reload()
  assert.equal(writes, 1)
  assert.equal(reads, 2)
})

test('a rejected write preserves the failure and never starts the follow-up read', async () => {
  let reads = 0
  await assert.rejects(saveAndRefresh(async () => { throw new Error('write rejected') }, async () => { reads += 1 }), /write rejected/)
  assert.equal(reads, 0)
})
