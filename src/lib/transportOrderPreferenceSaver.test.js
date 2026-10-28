import assert from 'node:assert/strict'
import test from 'node:test'
import { createTransportOrderPreferenceSaver } from './transportOrderPreferenceSaver.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((success, failure) => { resolve = success; reject = failure })
  return { promise, resolve, reject }
}

test('opening and leaving an unchanged list does not write preferences', async () => {
  const writes = []
  const saver = createTransportOrderPreferenceSaver(async (value) => writes.push(value), { search: '' })
  saver.update({ search: '' })
  assert.equal(await saver.flush(), true)
  assert.deepEqual(writes, [])
})

test('a failed save remains visible and can retry the current settings', async () => {
  const writes = []
  const statuses = []
  const saver = createTransportOrderPreferenceSaver(async (value) => {
    writes.push(value)
    if (writes.length === 1) throw new Error('unavailable')
  }, { search: '' })
  const unsubscribe = saver.subscribe(() => statuses.push(saver.getStatus()))
  saver.update({ search: '261000035' })
  assert.equal(await saver.flush(), false)
  assert.equal(saver.getStatus(), 'error')
  assert.equal(await saver.flush(), true)
  assert.equal(saver.getStatus(), 'saved')
  assert.equal(writes.length, 2)
  assert.deepEqual(writes[1], { search: '261000035' })
  await saver.flush()
  assert.equal(writes.length, 2)
  assert.deepEqual(statuses, ['pending', 'saving', 'error', 'saving', 'saved'])
  unsubscribe()
})

test('slow writes remain ordered and intermediate edits are coalesced', async () => {
  const first = deferred()
  const writes = []
  const saver = createTransportOrderPreferenceSaver(async (value) => {
    writes.push(value)
    if (writes.length === 1) await first.promise
  }, { search: '' })
  saver.update({ search: 'A' })
  const saving = saver.flush()
  await Promise.resolve()
  saver.update({ search: 'AB' })
  saver.update({ search: 'ABC' })
  assert.equal(saver.flush(), saving)
  assert.deepEqual(writes, [{ search: 'A' }])
  first.resolve()
  assert.equal(await saving, true)
  assert.deepEqual(writes, [{ search: 'A' }, { search: 'ABC' }])
  assert.equal(saver.getStatus(), 'saved')
})

test('a failed older write does not hide or prevent saving the latest edit', async () => {
  const first = deferred()
  const writes = []
  const saver = createTransportOrderPreferenceSaver(async (value) => {
    writes.push(value)
    if (writes.length === 1) await first.promise
  }, { search: '' })
  saver.update({ search: 'old' })
  const saving = saver.flush()
  await Promise.resolve()
  saver.update({ search: 'latest' })
  first.reject(new Error('unavailable'))
  assert.equal(await saving, true)
  assert.deepEqual(writes, [{ search: 'old' }, { search: 'latest' }])
  assert.equal(saver.getStatus(), 'saved')
})

test('reverting during a slow save restores the original settings on the server', async () => {
  const first = deferred()
  const writes = []
  const saver = createTransportOrderPreferenceSaver(async (value) => {
    writes.push(value)
    if (writes.length === 1) await first.promise
  }, { search: '' })
  saver.update({ search: 'temporary' })
  const saving = saver.flush()
  await Promise.resolve()
  saver.update({ search: '' })
  first.resolve()
  assert.equal(await saving, true)
  assert.deepEqual(writes, [{ search: 'temporary' }, { search: '' }])
})
