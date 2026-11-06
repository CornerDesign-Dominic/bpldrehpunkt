import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createMailboxLearningHandlers, eligibleLearningReply, learningReplyParent, mailboxLearningScope } from './mailboxLearning.js'

const hash = value => createHash('sha256').update(value).digest('hex')
const at = Date.parse('2026-11-06T12:00:00Z')
const id = hash('personal'), sharedId = hash('shared'), peerId = hash('peer'), peerParentId = hash('peer-parent')
const profile = { active: true, role: 'user', permissions: { mailboxes: 'edit' } }
const incoming = { id: 'incoming', internetMessageId: '<incoming@example.invalid>', isDraft: false, parentFolderId: 'inbox-folder', receivedDateTime: new Date(at - 10000).toISOString(), subject: 'Frage zur Ankunft', body: { contentType: 'text', content: 'Wann kommt das Fahrzeug?' }, conversationId: 'conversation' }
const reply = { id: 'sent', internetMessageId: '<reply@example.invalid>', isDraft: false, parentFolderId: 'sent-folder', sentDateTime: new Date(at + 1000).toISOString(), receivedDateTime: new Date(at + 1000).toISOString(), subject: 'RE: Frage zur Ankunft', body: { contentType: 'text', content: 'Das Fahrzeug kommt morgen um 14 Uhr.' }, internetMessageHeaders: [{ name: 'In-Reply-To', value: incoming.internetMessageId }], conversationId: 'conversation' }

function database() {
  const records = new Map(); let queue = Promise.resolve()
  const doc = path => ({ id: path.split('/').at(-1), path, collection: name => collection(`${path}/${name}`), async get() { return { exists: records.has(path), data: () => structuredClone(records.get(path)), id: path.split('/').at(-1), ref: doc(path) } }, async set(value, options) { records.set(path, options?.merge ? { ...records.get(path), ...structuredClone(value) } : structuredClone(value)) }, async update(value) { assert.ok(records.has(path)); records.set(path, { ...records.get(path), ...structuredClone(value) }) }, async create(value) { if (records.has(path)) { const error = new Error('exists'); error.code = 6; throw error } records.set(path, structuredClone(value)) }, async delete() { records.delete(path) } })
  const collection = path => {
    const filters = []
    const query = { doc: value => doc(`${path}/${value}`), where(key, operator, value) { filters.push([key, operator, value]); return query }, limit() { return query }, async get() { return { docs: [...records].filter(([key, value]) => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/') && filters.every(([field, op, expected]) => op === '<' ? value[field] < expected : value[field] === expected)).map(([key, value]) => ({ id: key.split('/').at(-1), data: () => structuredClone(value), ref: doc(key) })) } } }
    return query
  }
  return { records, doc, collection, runTransaction(fn) { const result = queue.then(() => fn({ get: ref => ref.get(), set: (ref, ...values) => ref.set(...values), update: (ref, value) => ref.update(value), create: (ref, value) => ref.create(value) })); queue = result.catch(() => {}); return result } }
}

function fixture(overrides = {}) {
  const db = database(), calls = [], captured = [], diagnostics = []
  let actor = profile, clock = at
  const personal = { ownerId: 'owner', status: 'connected', kind: 'personal', tenantId: 'tenant', email: 'owner@example.invalid', graphUserId: 'graph-owner' }
  const shared = { ...personal, kind: 'shared', email: 'team@example.invalid', canonicalMailboxId: 'canonical-inbox', parentConnectionId: id }
  db.records.set(`mailboxConnections/${id}`, personal)
  db.records.set(`mailboxConnections/${sharedId}`, shared)
  db.records.set(`mailboxConnections/${peerId}`, { ...shared, ownerId: 'peer', parentConnectionId: peerParentId })
  db.records.set(`mailboxConnections/${peerParentId}`, { ...personal, ownerId: 'peer' })
  db.records.set('users/owner', profile)
  db.records.set('users/peer', profile)
  const secrets = new Map()
  const handlers = createMailboxLearningHandlers({ db, project: 'db-bpl-drehpunkt-dev', tenantId: 'tenant', now: () => clock, requireProfile: async () => actor, diagnostic: async event => diagnostics.push(event), capture: async input => { captured.push(input); return { captured: true } }, graph: async input => {
    calls.push(input)
    if (input.operation === 'learning-create') { const sub = `subscription-${secrets.size}`; secrets.set(sub, input.data.clientState); return { id: sub, expirationDateTime: input.data.expirationDateTime } }
    if (input.operation === 'renew') return { id: input.subscriptionId, expirationDateTime: input.data.expirationDateTime }
    if (input.operation === 'delete') return null
    if (input.operation === 'learning-sent') return { message: { ...reply, id: input.messageId, from: { emailAddress: { address: db.records.get(`mailboxConnections/${input.connectionId}`).email } }, ...overrides.sentMessage }, sentFolderId: 'sent-folder' }
    if (input.operation === 'learning-parents') return { value: [incoming] }
    throw new Error('Mailbox scanning forbidden')
  }, ...overrides })
  const request = (data = {}, uid = 'owner') => ({ auth: { uid }, data: { connectionId: id, ...data } })
  const response = () => ({ code: 0, set() { return this }, type() { return this }, status(code) { this.code = code; return this }, send(text) { this.text = text; return this } })
  const deliver = async (connectionId = id, extra = {}) => {
    const scopeId = mailboxLearningScope(db.records.get(`mailboxConnections/${connectionId}`)), scope = db.records.get(`mailboxLearningScopes/${scopeId}`), res = response()
    await handlers.webhook({ method: 'POST', query: {}, body: { value: [{ subscriptionId: scope.subscriptionId, tenantId: 'tenant', clientState: secrets.get(scope.subscriptionId), changeType: 'created', resourceData: { id: 'sent' }, ...extra }] } }, res)
    return res
  }
  const runs = () => [...db.records].filter(([path]) => path.startsWith('mailboxLearningRuns/')).map(([, value]) => value)
  return { db, handlers, request, deliver, response, runs, calls, captured, diagnostics, personal, shared, actor: value => { actor = value }, clock: value => { clock = value } }
}

test('learning identity is shared centrally across delegates but personal consent stays owner-scoped', () => {
  const f = fixture()
  assert.equal(mailboxLearningScope(f.shared), mailboxLearningScope({ ...f.shared, ownerId: 'peer' }))
  assert.notEqual(mailboxLearningScope(f.personal), mailboxLearningScope({ ...f.personal, ownerId: 'peer' }))
  assert.notEqual(mailboxLearningScope(f.shared), mailboxLearningScope({ ...f.shared, tenantId: 'foreign' }))
})

test('learning defaults off, is independent of AI modes, and only subscribes to sent events', async () => {
  const f = fixture()
  assert.equal((await f.handlers.getSettings(f.request())).enabled, false)
  const setting = await f.handlers.setSettings(f.request({ enabled: true }))
  assert.equal(setting.enabled, true); assert.equal(setting.state, 'active'); assert.equal(setting.managed, false)
  assert.equal(f.calls[0].operation, 'learning-create')
  assert.equal(f.calls[0].data.changeType, 'created')
  assert.match(f.calls[0].data.notificationUrl, /db-bpl-drehpunkt-dev.*mailboxLearningWebhook$/)
  assert.ok([...f.db.records.keys()].every(key => !key.startsWith('mailboxRecommendation')))
})

test('personal settings reject foreign owners and inactive or view-only users cannot opt in', async () => {
  const f = fixture()
  await assert.rejects(f.handlers.setSettings(f.request({ enabled: true }, 'peer')), { code: 'permission-denied' })
  f.actor({ ...profile, active: false })
  await assert.rejects(f.handlers.setSettings(f.request({ enabled: true })), { code: 'permission-denied' })
  f.actor({ ...profile, permissions: { mailboxes: 'view' } })
  await assert.rejects(f.handlers.setSettings(f.request({ enabled: true })), { code: 'permission-denied' })
})

test('shared controls are admin-only and expose one setting across delegates, including disable by scope', async () => {
  const f = fixture()
  await assert.rejects(f.handlers.setSettings(f.request({ connectionId: sharedId, enabled: true })), { code: 'permission-denied' })
  f.actor({ active: true, role: 'admin' })
  const setting = await f.handlers.setSettings(f.request({ connectionId: sharedId, enabled: true }))
  await f.handlers.setSettings(f.request({ connectionId: peerId, enabled: true }))
  assert.equal(f.calls.filter(call => call.operation === 'learning-create').length, 1)
  const byScope = await f.handlers.getSettings({ auth: { uid: 'owner' }, data: { managedScopeId: setting.scopeId } })
  assert.equal(byScope.enabled, true)
  await f.handlers.setSettings({ auth: { uid: 'owner' }, data: { managedScopeId: setting.scopeId, enabled: false } })
  assert.equal((await f.handlers.getSettings(f.request({ connectionId: peerId }))).enabled, false)
  assert.equal(f.calls.at(-1).operation, 'delete')
  f.actor(profile)
  await assert.rejects(f.handlers.getSettings({ auth: { uid: 'owner' }, data: { managedScopeId: setting.scopeId } }), { code: 'permission-denied' })
})

test('unconnected shared admin rows without previous learning settings expose a disabled independent opt-in', async () => {
  const f = fixture(), scopeId = mailboxLearningScope(f.shared)
  f.actor({ active: true, role: 'admin' })
  f.db.records.set(`mailboxRecommendationScopes/${scopeId}`, { kind: 'shared', email: f.shared.email, enabled: true })
  const request = { auth: { uid: 'owner' }, data: { managedScopeId: scopeId } }
  assert.equal((await f.handlers.getSettings(request)).enabled, false)
  await f.handlers.setSettings({ ...request, data: { ...request.data, enabled: false } })
  assert.equal(f.db.records.get(`mailboxLearningScopes/${scopeId}`).kind, 'shared')
  assert.equal(f.db.records.get(`mailboxRecommendationScopes/${scopeId}`).enabled, true)
  await assert.rejects(f.handlers.setSettings({ ...request, data: { ...request.data, enabled: true } }), { code: 'failed-precondition' })
})

test('only newly sent human replies are eligible, never drafts, automatic reports or acknowledgements', () => {
  assert.equal(eligibleLearningReply(reply, at, at + 2000), true)
  for (const patch of [{ isDraft: true }, { isDraft: undefined }, { sentDateTime: new Date(at - 1).toISOString() }, { internetMessageHeaders: [{ name: 'Auto-Submitted', value: 'auto-replied' }] }, { internetMessageHeaders: [{ name: 'Content-Type', value: 'multipart/report; report-type=delivery-status' }] }, { subject: 'Automatic reply: test' }, { body: { content: 'Vielen Dank!' } }, { body: { content: 'Vielen Dank für die Info.' } }]) assert.equal(eligibleLearningReply({ ...reply, ...patch }, at, at + 2000), false)
  assert.equal(eligibleLearningReply(reply, at, at + 6 * 60000), false)
  for (const prefix of ['FW:', 'FWD:', 'WG:', 'TR:', 'RV:', 'VS:']) assert.equal(eligibleLearningReply({ ...reply, subject: prefix + ' forwarded invoice' }, at, at + 2000), false)
  assert.equal(eligibleLearningReply({ ...reply, subject: 'RE: WG: echte Antwort' }, at, at + 2000), true)
})

test('reply association requires exact parent evidence, rejects subject-only matches and ambiguous incoming copies', () => {
  assert.equal(learningReplyParent(reply, [incoming], 'sent-folder')?.id, incoming.id)
  assert.equal(learningReplyParent({ ...reply, internetMessageHeaders: [] }, [incoming], 'sent-folder'), null)
  assert.equal(learningReplyParent(reply, [incoming, { ...incoming, id: 'copy' }], 'sent-folder'), null)
  assert.equal(learningReplyParent(reply, [{ ...incoming, parentFolderId: 'sent-folder' }], 'sent-folder'), null)
})

test('duplicate notifications and concurrent workers capture one sent reply with incoming and actual answer', async () => {
  const f = fixture()
  await f.handlers.setSettings(f.request({ enabled: true })); f.clock(at + 2000)
  await f.deliver(); await f.deliver()
  assert.equal(f.runs().length, 1)
  await Promise.all([f.handlers.process(f.runs()[0]), f.handlers.process(f.runs()[0])])
  assert.equal(f.captured.length, 1)
  assert.equal(f.captured[0].incoming.id, incoming.id)
  assert.equal(f.captured[0].reply.body.content, reply.body.content)
  assert.equal(f.captured[0].generation, f.runs()[0].generation)
  assert.equal((await f.handlers.getSettings(f.request())).lastCapturedAt, at + 2000)
})

test('shared learning captures once regardless of which delegate activated it', async () => {
  const f = fixture(); f.actor({ active: true, role: 'admin' })
  await f.handlers.setSettings(f.request({ connectionId: sharedId, enabled: true })); f.clock(at + 2000)
  await f.deliver(sharedId); await f.deliver(peerId)
  await Promise.all(f.runs().map(f.handlers.process))
  assert.equal(f.captured.length, 1)
  assert.equal(f.captured[0].scope.kind, 'shared')
})

test('personal consent never collects send-as shared mailbox copies or mail without a known From identity', async () => {
  for (const from of [{ emailAddress: { address: 'shared@example.invalid' } }, undefined]) {
    const f = fixture({ sentMessage: { from } })
    await f.handlers.setSettings(f.request({ enabled: true })); f.clock(at + 2000); await f.deliver()
    await f.handlers.process(f.runs()[0])
    assert.equal(f.captured.length, 0)
    assert.ok(f.calls.every(call => call.operation !== 'learning-parents'))
  }
})

test('forged, wrong-tenant and updated notifications never create work; validation is plain text', async () => {
  const f = fixture(), response = f.response()
  await f.handlers.webhook({ method: 'POST', query: { validationToken: 'validation' } }, response)
  assert.equal(response.code, 200); assert.equal(response.text, 'validation')
  await f.handlers.setSettings(f.request({ enabled: true }))
  await f.deliver(id, { clientState: 'forged' }); await f.deliver(id, { tenantId: 'foreign' }); await f.deliver(id, { changeType: 'updated' })
  assert.equal(f.runs().length, 0)
})

test('disable invalidates queued work and maintenance never lists sent mail or recovers missed events', async () => {
  const f = fixture()
  await f.handlers.setSettings(f.request({ enabled: true })); f.clock(at + 2000)
  await f.deliver(); const run = f.runs()[0]
  await f.handlers.setSettings(f.request({ enabled: false })); await f.handlers.process(run)
  assert.equal(f.captured.length, 0)
  await f.handlers.setSettings(f.request({ enabled: true }))
  await f.deliver(id, { lifecycleEvent: 'missed' })
  assert.equal((await f.handlers.getSettings(f.request())).state, 'missed')
  const count = f.runs().length
  f.clock(at + 2.5 * 86400000); await f.handlers.maintain()
  assert.equal(f.runs().length, count - 1)
  assert.ok(f.calls.every(call => ['learning-create', 'delete', 'renew'].includes(call.operation)))
})

test('unmatched replies create no case; extraction failures cannot repeatedly consume paid classification', async () => {
  const f = fixture({ capture: async () => { throw new Error('provider failed') } })
  await f.handlers.setSettings(f.request({ enabled: true })); f.clock(at + 2000); await f.deliver()
  await f.handlers.process(f.runs()[0]); await f.handlers.process(f.runs()[0])
  assert.equal(f.diagnostics.length, 1)
  assert.equal((await f.handlers.getSettings(f.request())).state, 'error')
  assert.ok(!JSON.stringify(f.diagnostics).includes(reply.body.content))
})
