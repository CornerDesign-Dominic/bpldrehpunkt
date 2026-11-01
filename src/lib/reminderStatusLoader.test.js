import assert from 'node:assert/strict'
import test from 'node:test'
import { createReminderStatusLoader } from './reminderStatusLoader.js'

test('visible status requests batch, deduplicate and expire without polling', async () => {
  let clock = 0
  const calls = []
  const loader = createReminderStatusLoader({ now: () => clock, send: async (paths) => { calls.push(paths); return { statuses: paths.map((sourcePath) => ({ sourcePath, status: 'scheduled' })) } } })
  const first = loader.get('todos/a'), duplicate = loader.get('todos/a'), second = loader.get('todos/b')
  assert.equal(first, duplicate)
  assert.equal((await Promise.all([first, second])).length, 2)
  assert.deepEqual(calls, [['todos/a', 'todos/b']])
  await loader.get('todos/a'); assert.equal(calls.length, 1)
  clock = 15000
  await loader.get('todos/a'); assert.equal(calls.length, 2)
  await loader.get('todos/a', { refresh: true }); assert.equal(calls.length, 3)
})

test('large status batches respect the callable limit', async () => {
  const sizes = []
  const loader = createReminderStatusLoader({ send: async (paths) => { sizes.push(paths.length); return { statuses: paths.map((sourcePath) => ({ sourcePath, status: 'disabled' })) } } })
  const result = await loader.list(Array.from({ length: 123 }, (_, index) => `todos/${index}`))
  assert.equal(result.statuses.length, 123)
  assert.deepEqual(sizes, [50, 50, 23])
})

test('invalidation prevents an earlier response from repopulating the cache', async () => {
  const callbacks = []
  let sends = 0
  const loader = createReminderStatusLoader({ send: async (paths) => { const attempt = ++sends; if (attempt === 1) await new Promise((resolve) => callbacks.push(resolve)); return { statuses: paths.map((sourcePath) => ({ sourcePath, status: attempt === 1 ? 'scheduled' : 'accepted' })) } } })
  const previous = loader.get('todos/a')
  await new Promise((resolve) => queueMicrotask(resolve))
  loader.invalidate(['todos/a'])
  const current = loader.get('todos/a')
  assert.equal((await current).status, 'accepted')
  callbacks[0](); assert.equal((await previous).status, 'scheduled')
  assert.equal((await loader.get('todos/a')).status, 'accepted')
  assert.equal(sends, 2)
})

test('failed and incomplete responses remain errors and are not cached as success', async () => {
  let calls = 0
  const loader = createReminderStatusLoader({ send: async () => { calls += 1; if (calls === 1) throw new Error('offline'); return { statuses: [] } } })
  await assert.rejects(loader.get('todos/a'), /offline/)
  await assert.rejects(loader.get('todos/a'), /fehlt/)
  assert.equal(calls, 2)
})

test('a different authenticated user cannot receive a cached recipient name', async () => {
  let user = 'first'
  let calls = 0
  const loader = createReminderStatusLoader({ getScope: () => user, requireScope: true, send: async (paths) => {
    calls += 1
    return { statuses: paths.map((sourcePath) => ({ sourcePath, status: 'scheduled', recipients: [{ userId: user, name: `Private ${user}` }] })) }
  } })
  assert.equal((await loader.get('todos/a')).recipients[0].name, 'Private first')
  user = 'second'
  assert.equal((await loader.get('todos/a')).recipients[0].name, 'Private second')
  assert.equal(calls, 2)
  user = null
  await assert.rejects(loader.get('todos/a'), { code: 'functions/unauthenticated' })
  assert.equal(calls, 2)
})

test('in-flight responses from a previous session reject and cannot replace the new session cache', async () => {
  let user = 'first'
  let finishFirst
  const loader = createReminderStatusLoader({ getScope: () => user, requireScope: true, send: async (paths) => {
    const requestUser = user
    if (requestUser === 'first') await new Promise((resolve) => { finishFirst = resolve })
    return { statuses: paths.map((sourcePath) => ({ sourcePath, status: 'scheduled', recipients: [{ userId: requestUser, name: `Private ${requestUser}` }] })) }
  } })
  const previous = loader.get('todos/a')
  const rejected = assert.rejects(previous, { code: 'functions/aborted' })
  await new Promise((resolve) => queueMicrotask(resolve))
  user = 'second'
  const current = await loader.get('todos/a')
  await rejected
  assert.equal(current.recipients[0].name, 'Private second')
  finishFirst()
  await new Promise((resolve) => queueMicrotask(resolve))
  assert.equal((await loader.get('todos/a')).recipients[0].name, 'Private second')
})

test('a logout while a request is running rejects its response even without a subsequent status request', async () => {
  let user = 'first', finish
  const loader = createReminderStatusLoader({ getScope: () => user, requireScope: true, send: async (paths) => {
    await new Promise((resolve) => { finish = resolve })
    return { statuses: paths.map((sourcePath) => ({ sourcePath, status: 'scheduled', recipients: [{ name: 'Private first' }] })) }
  } })
  const pending = loader.get('todos/a')
  const rejected = assert.rejects(pending, { code: 'functions/aborted' })
  await new Promise((resolve) => queueMicrotask(resolve))
  user = null
  finish()
  await rejected
})

test('queued old-session requests are cancelled before any server call and a session round-trip cannot revive them', async () => {
  let user = 'first'
  const callbacks = [], calls = []
  const loader = createReminderStatusLoader({ getScope: () => user, schedule: (callback) => callbacks.push(callback), send: async (paths) => { calls.push({ user, paths }); return { statuses: paths.map((sourcePath) => ({ sourcePath, status: 'scheduled' })) } } })
  const previous = loader.get('todos/private-first')
  const rejected = assert.rejects(previous, { code: 'functions/aborted' })
  user = 'second'; loader.resetSession()
  user = 'first'; loader.resetSession()
  const current = loader.get('todos/current-first')
  callbacks[0]()
  await rejected; await current
  assert.deepEqual(calls, [{ user: 'first', paths: ['todos/current-first'] }])
})
