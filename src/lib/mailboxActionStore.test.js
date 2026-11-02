import test from 'node:test'
import assert from 'node:assert/strict'
import { createMailboxActionStore } from './mailboxActionStore.js'

const identity = { connectionId: 'mailbox-1', messageId: 'mail-1' }
const action = (kind, state, extra = {}) => ({ ...identity, kind, state, id: `slot-${kind}`, jobId: `run-${kind}`, updatedAtMillis: 10, ...extra })
const timers = { setTimer: () => 1, clearTimer: () => {} }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('independent jobs survive message unmount and only the selected result is hydrated', async () => {
  let jobs = [], gets = 0
  const call = async (name, data) => {
    if (name === 'startMailboxAction') { const value = action(data.kind, 'running'); jobs.push(value); return { action: value } }
    if (name === 'listMailboxActions') return { actions: jobs }
    if (name === 'getMailboxAction') { gets++; return { action: { ...jobs.find(item => item.kind === data.kind), result: { value: data.kind } } } }
  }
  const store = createMailboxActionStore(call, timers)
  const stop = store.watch({ ...identity, kind: 'order' })
  await store.start(identity, 'order')
  await store.start(identity, 'terms')
  assert.equal(store.getAction(identity, 'order').state, 'running')
  assert.equal(store.getAction(identity, 'terms').state, 'running')
  stop()
  jobs = jobs.map(item => ({ ...item, state: item.kind === 'order' ? 'review' : 'completed', updatedAtMillis: 20 }))
  store.watch({ connectionId: identity.connectionId, messageIds: [identity.messageId] })
  await store.refresh(identity.connectionId)
  assert.equal(gets, 0)
  store.watch({ ...identity, kind: 'order' })
  await store.refresh(identity.connectionId)
  assert.deepEqual(store.getAction(identity, 'order').result, { value: 'order' })
  assert.equal(store.getAction(identity, 'terms').result, null)
  assert.equal(gets, 1)
  await store.refresh(identity.connectionId)
  assert.equal(gets, 1)
  store.dispose()
  const restored = createMailboxActionStore(call, timers)
  restored.watch({ ...identity, kind: 'order' })
  await restored.refresh(identity.connectionId)
  assert.equal(restored.getAction(identity, 'order').state, 'review')
  assert.deepEqual(restored.getAction(identity, 'order').result, { value: 'order' })
  restored.dispose()
})

test('duplicate starts are suppressed and stale polling cannot overwrite a new run', async () => {
  const start = deferred(), list = deferred()
  let starts = 0
  const store = createMailboxActionStore(async name => {
    if (name === 'startMailboxAction') { starts++; return start.promise }
    if (name === 'listMailboxActions') return list.promise
  }, timers)
  store.watch({ ...identity, kind: 'order' })
  const first = store.start(identity, 'order')
  await store.start(identity, 'order')
  assert.equal(starts, 1)
  start.resolve({ action: action('order', 'running', { jobId: 'new-run', updatedAtMillis: 30 }) })
  await first
  list.resolve({ actions: [action('order', 'completed', { result: null })] })
  await store.refresh(identity.connectionId)
  assert.equal(store.getAction(identity, 'order').jobId, 'new-run')
  assert.equal(store.getAction(identity, 'order').state, 'running')
  store.dispose()
})

test('completion/discard keep the server result and errors never falsely complete an action', async () => {
  let completeFails = true
  const store = createMailboxActionStore(async (name, data) => {
    if (name === 'startMailboxAction') return { action: action('tracking', 'review', { result: { previewId: 'preview' } }) }
    if (name === 'updateMailboxAction') {
      assert.equal(data.jobId, 'run-tracking')
      if (data.action === 'complete' && completeFails) throw Object.assign(new Error('No saved application'), { code: 'functions/failed-precondition' })
      return { action: action('tracking', data.action === 'discard' ? 'discarded' : 'completed', { updatedAtMillis: 20, result: { previewId: 'preview' } }) }
    }
    return { actions: [] }
  }, timers)
  await store.start(identity, 'tracking')
  await assert.rejects(store.complete(identity, 'tracking', { previewId: 'preview' }))
  assert.equal(store.getAction(identity, 'tracking').state, 'review')
  completeFails = false
  await store.complete(identity, 'tracking', { previewId: 'preview' })
  assert.equal(store.getAction(identity, 'tracking').state, 'completed')
  await store.discard(identity, 'tracking')
  assert.equal(store.getAction(identity, 'tracking').state, 'discarded')
  store.dispose()
})

test('owner disposal ignores late private results', async () => {
  const pending = deferred()
  const store = createMailboxActionStore(async () => pending.promise, timers)
  let updates = 0
  store.subscribe(() => { updates++ })
  const request = store.start(identity, 'invoice')
  assert.equal(updates, 1)
  store.dispose()
  pending.resolve({ action: action('invoice', 'completed', { result: { private: true } }) })
  await request
  assert.equal(updates, 1)
  assert.deepEqual(store.getSnapshot(), {})
})
