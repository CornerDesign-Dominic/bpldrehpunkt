import test from 'node:test'
import assert from 'node:assert/strict'
import { createMailboxTriageGate } from './mailboxTriageGate.js'

test('the original business request starts once only after confirmation', async () => {
  let preview, calls = 0
  const gate = createMailboxTriageGate(value => { preview = value })
  const result = { jobId: 'original-job', state: 'running' }
  const pending = gate.request('invoice', async () => { calls++; return result })
  assert.equal(calls, 0)
  const id = preview.id
  await gate.confirm(id)
  await gate.confirm(id)
  assert.equal(calls, 1)
  assert.equal(await pending, result)
  assert.equal(preview, null)
})

test('discarding, replacing or leaving a message never starts the cancelled action', async () => {
  let preview, calls = 0
  const gate = createMailboxTriageGate(value => { preview = value })
  const first = gate.request('court', () => { calls++ })
  const staleId = preview.id
  const second = gate.request('todo', () => { calls++ })
  assert.deepEqual(await first, { cancelled: true })
  await gate.confirm(staleId)
  assert.equal(calls, 0)
  gate.dispose()
  assert.deepEqual(await second, { cancelled: true })
  await gate.confirm(preview?.id)
  assert.equal(calls, 0)
  assert.deepEqual(await gate.request('invoice', () => { calls++ }), { cancelled: true })
})

test('duplicate clicks share a preview and original start failures reach the existing action', async () => {
  let preview, calls = 0
  const gate = createMailboxTriageGate(value => { preview = value })
  const error = new Error('original start failed')
  const request = gate.request('damage', async () => { calls++; throw error })
  assert.equal(gate.request('damage', () => assert.fail('duplicate')), request)
  const rejected = assert.rejects(request, caught => caught === error)
  await gate.confirm(preview.id)
  await rejected
  assert.equal(calls, 1)
  assert.equal(preview, null)
})
