import assert from 'node:assert/strict'
import test from 'node:test'
import { createDashboardTimeSession, dashboardTimeAccess } from './dashboardTime.js'
import { validTimePwaUrl } from './timePwaAccess.js'

const date = '2026-11-10'
const workspace = (status = 'away', id = 'employee-A') => ({ user: { id }, days: [{ date, status, events: [] }] })
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function make(overrides = {}) {
  const updates = [], writes = [], reads = []
  let remote = workspace()
  const controller = createDashboardTimeSession({ userId: 'employee-A', editable: true, getOnline: () => true, getDate: () => date, load: async args => { reads.push(args); return remote }, stamp: async payload => { writes.push(payload); remote = workspace('working') }, uuid: () => 'stable-event-id', now: () => new Date('2026-11-10T09:00:00Z'), ...overrides })
  controller.activate(value => updates.push(value))
  return { controller, updates, writes, reads }
}

test('dashboard access keeps viewing separate from writing and denies disabled or unrelated managers', () => {
  assert.deepEqual(dashboardTimeAccess({ active: true, role: 'user', permissions: { timeTracking: 'view' } }), { visible: true, editable: false })
  assert.deepEqual(dashboardTimeAccess({ active: true, role: 'superadmin' }), { visible: true, editable: true })
  for (const profile of [{ active: false, role: 'superadmin' }, { active: true, role: 'admin' }, { active: true, role: 'user', timeManager: true }]) assert.deepEqual(dashboardTimeAccess(profile), { visible: false, editable: false })
})

test('stamp captures actor UID, sends own-only reads and prevents invalid actions or duplicate clicks', async () => {
  const gate = deferred(), writes = []
  let status = 'away'
  const { controller, reads } = make({ load: async args => { reads.push(args); return workspace(status) }, stamp: async payload => { writes.push(payload); await gate.promise; status = 'working' } })
  await controller.refresh()
  assert.equal(await controller.record('go'), false)
  const saving = controller.record('come')
  assert.equal(await controller.record('come'), false)
  gate.resolve(); assert.equal(await saving, true)
  assert.deepEqual(writes, [{ expectedUserId: 'employee-A', eventId: 'stable-event-id', type: 'come', at: '2026-11-10T09:00:00.000Z', offline: false }])
  assert(reads.every(args => args.ownOnly && args.from === date && args.to === date))
})

test('view-only and offline dashboard never submit stamps', async () => {
  for (const overrides of [{ editable: false }, { getOnline: () => false }]) {
    const { controller, writes } = make(overrides)
    await controller.refresh()
    assert.equal(await controller.record('come'), false)
    assert.equal(writes.length, 0)
  }
})

test('late refreshes and disposed sessions cannot publish another account or stale status', async () => {
  const first = deferred(), second = deferred()
  let calls = 0
  const { controller, updates } = make({ load: () => ++calls === 1 ? first.promise : second.promise })
  const a = controller.refresh(), b = controller.refresh()
  await Promise.resolve()
  second.resolve(workspace('working')); await b
  first.resolve(workspace('away')); await a
  assert.equal(controller.snapshot().workspace.days[0].status, 'working')
  const gate = deferred()
  const next = make({ load: () => gate.promise })
  const pending = next.controller.refresh(); await Promise.resolve()
  next.controller.dispose(); gate.resolve(workspace()); await pending
  assert.equal(next.updates.length, 0)
  assert.equal(updates.length, 1)
})

test('lost response reloads server state before another stamp can be attempted', async () => {
  let status = 'away', writes = 0
  const { controller } = make({ load: async () => workspace(status), stamp: async () => { writes++; status = 'working'; throw new Error('Antwort verloren') } })
  await controller.refresh()
  assert.equal(await controller.record('come'), false)
  assert.equal(controller.snapshot().workspace.days[0].status, 'working')
  assert.equal(await controller.record('come'), false)
  assert.equal(writes, 1)
})

test('unexpected own response is not displayed and unsafe phone links are rejected', async () => {
  const { controller } = make({ load: async () => workspace('working', 'employee-B') })
  await controller.refresh()
  assert.equal(controller.snapshot().workspace, null)
  assert.match(controller.snapshot().error, /angemeldeten Konto/)
  for (const url of ['javascript:alert(1)', 'https://user:password@example.com', 'http://example.com', 'http://localhost.evil.test']) assert.equal(validTimePwaUrl(url, true), '')
  assert.equal(validTimePwaUrl('http://localhost:5174', false), '')
  assert.equal(validTimePwaUrl('http://localhost:5174', true), 'http://localhost:5174/')
  assert.equal(validTimePwaUrl('https://db-bpl-drehpunkt-dev-time.web.app'), 'https://db-bpl-drehpunkt-dev-time.web.app/')
})
