import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomUUID, createHash } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { createRecommendationHandlers, recommendationScope } from './mailboxRecommendations.js'
import { FUNCTIONAL_MAILBOXES } from './mailboxRecommendationPolicy.js'
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const hash = value => createHash('sha256').update(value).digest('hex')
const profile = { active: true, role: 'user', permissions: { mailboxes: 'edit' } }
const at = Date.parse('2026-11-01T12:00:00Z')
function reply() { return { code: 0, text: '', set() { return this }, type() { return this }, status(value) { this.code = value; return this }, send(value) { this.text = value; return this } } }
async function fixture(overrides = {}) {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-mail-recommendations'
  assert.ok(projectId.startsWith('demo-'))
  const suffix = randomUUID(), uid = `owner-${suffix}`, other = `other-${suffix}`, parent = hash(`parent-${suffix}`), c1 = hash(`one-${suffix}`), c2 = hash(`two-${suffix}`)
  const app = initializeApp({ projectId }, suffix), db = getFirestore(app)
  const personal = { ownerId: uid, status: 'connected', kind: 'personal', tenantId: 'tenant', email: `${suffix}@example.invalid`, graphUserId: `graph-${suffix}` }
  const shared = { ownerId: uid, status: 'connected', kind: 'shared', tenantId: 'tenant', canonicalMailboxId: `folder-${suffix}`, email: `team-${suffix}@example.invalid`, parentConnectionId: parent }
  await db.doc(`mailboxConnections/${parent}`).set(personal)
  await db.doc(`mailboxConnections/${c1}`).set(shared)
  await db.doc(`mailboxConnections/${c2}`).set({ ...shared, ownerId: other, parentConnectionId: `${parent}-other` })
  await db.doc(`mailboxConnections/${parent}-other`).set({ ...personal, ownerId: other })
  let actor = profile, clock = at, classifications = 0
  const calls = [], clientStates = new Map(), subscriptions = new Map()
  const graph = async input => {
    calls.push(input)
    if (input.operation === 'create') {
      const id = randomUUID(), value = { id, expirationDateTime: input.data.expirationDateTime }
      clientStates.set(id, input.data.clientState); subscriptions.set(id, value); return value
    }
    if (input.operation === 'renew') return { ...subscriptions.get(input.subscriptionId), expirationDateTime: input.data.expirationDateTime }
    if (input.operation === 'delete') { subscriptions.delete(input.subscriptionId); return null }
    if (input.operation === 'message') return { id: input.messageId, subject: 'Status', hasAttachments: overrides.hasAttachments === true, body: { contentType: 'text', content: 'Ankunft 18 Uhr' }, receivedDateTime: new Date(at + 1000).toISOString() }
    if (input.operation === 'attachment-list') return overrides.attachmentList || { value: [] }
    if (input.operation === 'attachment') return { name: '19269.pdf', contentType: 'application/pdf', contentBytes: 'JVBERi0=' }
    throw new Error('An inbox scan is forbidden')
  }
  const handlers = createRecommendationHandlers({ db, project: 'db-bpl-drehpunkt-dev', tenantId: 'tenant', now: () => clock, requireProfile: async () => actor, classify: async () => { classifications++; return ['tracking'] }, graph, ...overrides })
  const scopeId = recommendationScope(shared)
  const request = (data = {}, owner = uid) => ({ auth: { uid: owner }, data: { connectionId: c1, ...data } })
  const deliver = async (extra = {}) => {
    const scope = (await db.doc(`mailboxRecommendationScopes/${scopeId}`).get()).data()
    const notification = { subscriptionId: scope.subscriptionId, tenantId: 'tenant', clientState: clientStates.get(scope.subscriptionId), changeType: 'created', resourceData: { id: 'immutable' }, ...extra }
    const response = reply(); await handlers.webhook({ method: 'POST', query: {}, body: { value: [notification] } }, response); return response
  }
  const runs = async () => (await db.collection('mailboxRecommendationRuns').where('scopeId', '==', scopeId).get()).docs.map(doc => doc.data())
  const activate = async () => { actor = { active: true, role: 'admin' }; await handlers.setSettings(request({ enabled: true })) }
  return { db, uid, other, c1, c2, parent, personal, shared, handlers, scopeId, request, deliver, runs, activate, calls, count: () => classifications, clock: value => { clock = value }, actor: value => { actor = value }, async close() {
    await db.recursiveDelete(db.doc(`mailboxRecommendationScopes/${scopeId}`))
    for (const id of [parent, c1, c2, `${parent}-other`]) { await db.doc(`mailboxConnections/${id}`).delete(); await db.doc(`mailboxRecommendationSignals/${id}`).delete() }
    await db.terminate(); await deleteApp(app)
  } }
}
test('emulator: production subscription targets production callback without scans or changing the five minute freshness limit', { skip: !enabled }, async () => {
  const f = await fixture({ project: 'db-bpl-drehpunkt' })
  try {
    await f.activate()
    const created = f.calls.find(call => call.operation === 'create')
    assert.equal(created.data.notificationUrl, 'https://europe-west3-db-bpl-drehpunkt.cloudfunctions.net/mailboxRecommendationWebhook')
    assert.equal(created.data.lifecycleNotificationUrl, created.data.notificationUrl)
    assert.equal(created.data.changeType, 'created')
    assert.ok(f.calls.every(call => ['create', 'renew', 'delete'].includes(call.operation)))
  } finally { await f.close() }
})

test('emulator: automatic mode dispatches once centrally without recommendations and mode changes invalidate old work', { skip: !enabled }, async () => {
  const dispatches = []
  const f = await fixture({ classify: async () => ['invoice', 'terms', 'tracking'], startAutomaticActions: async input => { dispatches.push(input) } })
  try {
    await f.activate()
    const previous = (await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}`).get()).data()
    const setting = await f.handlers.setSettings(f.request({ mode: 'automatic' }))
    assert.equal(setting.mode, 'automatic'); assert.equal(setting.enabled, true)
    const current = (await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}`).get()).data()
    assert.notEqual(current.generation, previous.generation)
    await f.deliver()
    const [run] = await f.runs()
    await Promise.all([f.handlers.process(run), f.handlers.process(run)])
    assert.equal(dispatches.length, 1)
    assert.deepEqual(dispatches[0].kinds, ['invoice', 'terms', 'tracking'])
    assert.equal(dispatches[0].connections.length, 2)
    assert.equal(dispatches[0].scopeId, f.scopeId)
    f.actor(profile)
    assert.deepEqual((await f.handlers.list(f.request({ messageIds: ['immutable'] }))).recommendations, {})
    f.actor({ active: true, role: 'admin' })
    await f.handlers.setSettings(f.request({ mode: 'off' }))
    await f.handlers.process({ ...run, messageId: 'late' })
    assert.equal(dispatches.length, 1)
    f.actor(profile)
    assert.equal((await f.handlers.getSettings(f.request())).mode, 'off')
  } finally { await f.close() }
})

test('emulator: personal AI mode is owner controlled while shared automatic mode remains admin only', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const personal = await f.handlers.setSettings(f.request({ connectionId: f.parent, mode: 'automatic' }))
    assert.equal(personal.mode, 'automatic'); assert.equal(personal.managed, false)
    await assert.rejects(f.handlers.setSettings(f.request({ mode: 'automatic' })), { code: 'permission-denied' })
    await assert.rejects(f.handlers.setSettings(f.request({ connectionId: f.parent, mode: 'off' }, f.other)), { code: 'permission-denied' })
    assert.equal((await f.handlers.setSettings(f.request({ connectionId: f.parent, mode: 'off' }))).mode, 'off')
  } finally { await f.close() }
})

test('emulator: all five functional mailboxes are visible before connection and only admins can manage them', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await assert.rejects(f.handlers.listManaged(f.request()), { code: 'permission-denied' })
    f.actor({ active: true, role: 'admin' })
    const managed = (await f.handlers.listManaged(f.request())).mailboxes
    assert.deepEqual(managed.filter(row => row.functional).map(row => row.email), FUNCTIONAL_MAILBOXES)
    assert.ok(managed.filter(row => row.functional).every(row => !row.available && !row.enabled && row.connectionId === null))
    assert.equal(f.calls.length, 0)
  } finally { await f.close() }
})

test('emulator: licensed functional mailbox uses one admin setting and classification for direct and delegated connections', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const email = FUNCTIONAL_MAILBOXES[0]
    await f.db.doc(`mailboxConnections/${f.parent}`).update({ email, canonicalMailboxId: f.shared.canonicalMailboxId })
    await f.db.doc(`mailboxConnections/${f.c1}`).update({ email })
    await f.db.doc(`mailboxConnections/${f.c2}`).update({ email })
    await assert.rejects(f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: true })), { code: 'permission-denied' })
    f.actor({ active: true, role: 'admin' })
    await f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: true }))
    await f.handlers.setSettings(f.request({ connectionId: f.c2, enabled: true }))
    assert.equal(f.calls.filter(call => call.operation === 'create').length, 1)
    const rows = (await f.handlers.listManaged(f.request())).mailboxes
    assert.equal(rows.filter(row => row.email === email).length, 1)
    assert.equal(rows.find(row => row.email === email).available, true)
    await f.deliver(); await f.deliver()
    await f.handlers.process((await f.runs())[0])
    assert.equal(f.count(), 1)
    f.actor(profile)
    const direct = await f.handlers.list(f.request({ connectionId: f.parent, messageIds: ['immutable'] }))
    const delegated = await f.handlers.list(f.request({ connectionId: f.c2, messageIds: ['immutable'] }, f.other))
    assert.deepEqual(direct, delegated)
    assert.deepEqual(direct.recommendations.immutable, ['tracking'])
    assert.equal((await f.handlers.getSettings(f.request({ connectionId: f.parent }))).managed, true)
    await assert.rejects(f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: false })), { code: 'permission-denied' })
    f.actor({ active: true, role: 'superadmin' })
    await f.handlers.setSettings(f.request({ connectionId: f.c1, enabled: false }))
    assert.equal((await f.handlers.getSettings(f.request({ connectionId: f.parent }))).enabled, false)
  } finally { await f.close() }
})

test('emulator: legacy personal subscriptions of functional mailboxes cannot classify or be renewed and are retired', { skip: !enabled }, async () => {
  const f = await fixture()
  const oldId = hash(`tenant|personal|${f.uid}|${f.personal.graphUserId}`), oldRef = f.db.doc(`mailboxRecommendationScopes/${oldId}`)
  const subscriptionId = `legacy-${f.uid}`, registration = f.db.doc(`mailboxRecommendationSubscriptions/${hash(subscriptionId)}`)
  try {
    await f.db.doc(`mailboxConnections/${f.parent}`).update({ email: FUNCTIONAL_MAILBOXES[0], canonicalMailboxId: f.shared.canonicalMailboxId })
    await oldRef.set({ kind: 'personal', email: FUNCTIONAL_MAILBOXES[0], tenantId: 'tenant', ownerId: f.uid, connectionId: f.parent, enabled: true, generation: 'legacy', delivery: 'webhook', subscriptionId, subscriptionExpiresAt: at + 86400000 })
    await registration.set({ active: true, scopeId: oldId, generation: 'legacy', clientStateHash: hash('legacy-secret'), expiresAt: at + 86400000 })
    const response = reply()
    await f.handlers.webhook({ method: 'POST', query: {}, body: { value: [{ tenantId: 'tenant', subscriptionId, clientState: 'legacy-secret', changeType: 'created', resourceData: { id: 'legacy-message' } }] } }, response)
    assert.equal(response.code, 202)
    assert.equal((await f.db.collection('mailboxRecommendationRuns').where('scopeId', '==', oldId).get()).size, 0)
    await f.handlers.process({ scopeId: oldId, generation: 'legacy', type: 'message', messageId: 'legacy-message', createdAt: at })
    await f.handlers.provision(oldId)
    assert.equal(f.count(), 0); assert.equal(f.calls.length, 0)
    await f.handlers.maintain()
    assert.equal((await oldRef.get()).data().enabled, false)
    assert.equal((await oldRef.get()).data().supersededByManagement, true)
    assert.equal((await registration.get()).data().active, false)
    assert.deepEqual(f.calls.map(call => call.operation), ['delete'])
  } finally { await f.db.recursiveDelete(oldRef); await registration.delete(); await f.close() }
})

test('emulator: aliases do not hide a functional mailbox and disconnected central settings remain visible and can only be disabled', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const email = FUNCTIONAL_MAILBOXES[4]
    await f.db.doc(`mailboxConnections/${f.c1}`).update({ email })
    await f.db.doc(`mailboxConnections/${f.c2}`).update({ email: 'invoice-alias@example.invalid' })
    await f.activate()
    let row = (await f.handlers.listManaged(f.request())).mailboxes.find(item => item.email === email)
    assert.equal(row.available, true); assert.equal(row.enabled, true); assert.equal(row.scopeId, f.scopeId)
    assert.equal((await f.handlers.listManaged(f.request())).mailboxes.some(item => item.email === 'invoice-alias@example.invalid'), false)
    // Even a previously stored alias must retain the fixed business address.
    await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}`).update({ email: 'invoice-alias@example.invalid' })
    await f.db.doc(`mailboxConnections/${f.c1}`).update({ status: 'disconnected' })
    row = (await f.handlers.listManaged(f.request())).mailboxes.find(item => item.email === email)
    assert.equal(row.available, true); assert.equal(row.enabled, true)
    await f.db.doc(`mailboxConnections/${f.c2}`).update({ status: 'disconnected' })
    row = (await f.handlers.listManaged(f.request())).mailboxes.find(item => item.email === email)
    assert.equal(row.available, false); assert.equal(row.enabled, true); assert.equal(row.scopeId, f.scopeId)
    f.actor(profile)
    await assert.rejects(f.handlers.setSettings(f.request({ managedScopeId: f.scopeId, enabled: false })), { code: 'permission-denied' })
    f.actor({ active: true, role: 'admin' })
    await assert.rejects(f.handlers.setSettings(f.request({ managedScopeId: f.scopeId, enabled: true })), { code: 'invalid-argument' })
    await f.handlers.setSettings(f.request({ managedScopeId: f.scopeId, enabled: false }))
    assert.equal((await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}`).get()).data().enabled, false)
    await f.db.doc(`mailboxConnections/${f.c1}`).update({ status: 'connected' })
    f.actor(profile)
    assert.equal((await f.handlers.getSettings(f.request())).enabled, false)
  } finally { await f.close() }
})

test('emulator: administrative disable-by-scope cannot override a personal mailbox', { skip: !enabled }, async () => {
  const f = await fixture(), personalScope = recommendationScope(f.personal)
  try {
    await f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: true }))
    f.actor({ active: true, role: 'admin' })
    await assert.rejects(f.handlers.setSettings(f.request({ managedScopeId: personalScope, enabled: false })), { code: 'permission-denied' })
    assert.equal((await f.db.doc(`mailboxRecommendationScopes/${personalScope}`).get()).data().enabled, true)
  } finally { await f.db.recursiveDelete(f.db.doc(`mailboxRecommendationScopes/${personalScope}`)); await f.close() }
})

test('emulator: failed identity resolution cannot hide a saved activation or prevent admin deactivation', { skip: !enabled }, async () => {
  const f = await fixture({ resolveMailboxIdentity: async () => { throw new Error('Temporary identity resolution failure') } })
  try {
    const email = FUNCTIONAL_MAILBOXES[0]
    await f.db.doc(`mailboxConnections/${f.c1}`).update({ email })
    await f.activate()
    await f.db.doc(`mailboxConnections/${f.c1}`).update({ canonicalMailboxId: FieldValue.delete() })
    await f.db.doc(`mailboxConnections/${f.c2}`).update({ status: 'disconnected' })
    const row = (await f.handlers.listManaged(f.request())).mailboxes.find(item => item.email === email)
    assert.equal(row.enabled, true); assert.equal(row.scopeId, f.scopeId)
    assert.equal(row.available, false); assert.equal(row.state, 'error')
    await f.handlers.setSettings(f.request({ managedScopeId: row.scopeId, enabled: false }))
    assert.equal((await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}`).get()).data().enabled, false)
  } finally { await f.close() }
})

test('emulator: shared admin activation creates one subscription and duplicate notifications classify once for all delegates', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await assert.rejects(f.handlers.setSettings(f.request({ enabled: true })), { code: 'permission-denied' })
    await f.activate(); await f.handlers.setSettings(f.request({ connectionId: f.c2, enabled: true }))
    assert.equal(f.calls.filter(call => call.operation === 'create').length, 1)
    assert.equal((await f.deliver()).code, 202); await f.deliver()
    const runs = await f.runs(); assert.equal(runs.length, 1)
    await Promise.all([f.handlers.process(runs[0]), f.handlers.process(runs[0])])
    assert.equal(f.count(), 1)
    f.actor(profile)
    const first = await f.handlers.list(f.request({ messageIds: ['immutable'] }))
    const other = await f.handlers.list(f.request({ connectionId: f.c2, messageIds: ['immutable'] }, f.other))
    assert.deepEqual(first, other); assert.deepEqual(first.recommendations.immutable, ['tracking'])
    assert.equal((await f.db.doc(`mailboxRecommendationSignals/${f.c2}`).get()).data().ownerId, f.other)
    await assert.rejects(f.handlers.list(f.request({ connectionId: f.c2, messageIds: ['immutable'] })), { code: 'permission-denied' })
  } finally { await f.close() }
})
test('emulator: webhook validation is plain text; forged, wrong-tenant and unknown notifications cannot enqueue work', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const response = reply(); await f.handlers.webhook({ method: 'POST', query: { validationToken: 'opaque-validation' } }, response)
    assert.equal(response.code, 200); assert.equal(response.text, 'opaque-validation')
    await f.activate()
    await f.deliver({ clientState: 'forged' }); await f.deliver({ tenantId: 'foreign' }); await f.deliver({ subscriptionId: 'unknown' }); await f.deliver({ changeType: 'updated' })
    assert.equal((await f.runs()).length, 0)
  } finally { await f.close() }
})
test('emulator: only the indicated new mail is read; old arrivals and delayed AI results are skipped', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await f.activate(); await f.deliver(); const [run] = await f.runs()
    f.clock(at + 302000); await f.handlers.process({ ...run, createdAt: at + 302000 })
    assert.equal(f.count(), 0)
    assert.equal(f.calls.filter(call => call.operation === 'message').length, 1)
    f.actor(profile); assert.deepEqual((await f.handlers.list(f.request({ messageIds: ['immutable'] }))).recommendations.immutable, [])
  } finally { await f.close() }
  let late
  const g = await fixture({ classify: async () => { late.clock(at + 302000); return ['tracking'] } }); late = g
  try {
    await g.activate(); await g.deliver(); await g.handlers.process((await g.runs())[0]); g.actor(profile)
    assert.deepEqual((await g.handlers.list(g.request({ messageIds: ['immutable'] }))).recommendations.immutable, [])
  } finally { await g.close() }
})
test('emulator: missed events and subscription maintenance never recover or list mailbox contents', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await f.activate(); await f.deliver({ lifecycleEvent: 'missed' })
    assert.equal((await f.runs()).length, 0)
    assert.equal((await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}`).get()).data().state, 'missed')
    f.clock(at + 2.5 * 86400000); await f.handlers.maintain()
    assert.ok(f.calls.some(call => call.operation === 'renew'))
    assert.ok(f.calls.every(call => ['create', 'renew'].includes(call.operation)))
    await f.deliver({ lifecycleEvent: 'subscriptionRemoved' }); const [run] = await f.runs()
    assert.equal(run.type, 'renew'); await f.handlers.process(run)
    assert.equal(f.count(), 0); assert.ok(f.calls.every(call => ['create', 'renew'].includes(call.operation)))
  } finally { await f.close() }
})
test('emulator: disable invalidates notifications, deletes the subscription and blocks late results', { skip: !enabled }, async () => {
  let release, start
  const ready = new Promise(resolve => { start = resolve }), waiting = new Promise(resolve => { release = resolve })
  const f = await fixture({ classify: async () => { start(); await waiting; return ['tracking'] } })
  try {
    await f.activate(); await f.deliver(); const work = f.handlers.process((await f.runs())[0]); await ready
    await f.handlers.setSettings(f.request({ enabled: false })); release(); await work
    assert.ok(f.calls.some(call => call.operation === 'delete'))
    f.actor(profile); assert.deepEqual((await f.handlers.list(f.request({ messageIds: ['immutable'] }))).recommendations, {})
  } finally { release(); await f.close() }
})
test('emulator: already handled actions suppress an otherwise valid recommendation', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await f.activate(); await f.deliver()
    await f.db.doc(`mailboxActionScopes/${hash(`${f.other}|${f.c2}`)}/actions/${hash('immutable|tracking')}`).set({ state: 'completed' })
    await f.handlers.process((await f.runs())[0]); f.actor(profile)
    assert.deepEqual((await f.handlers.list(f.request({ messageIds: ['immutable'] }))).recommendations.immutable, [])
  } finally { await f.close() }
})
test('emulator: uncertain mail inspects at most two suitable attachments once and shares only final kinds', { skip: !enabled }, async () => {
  const file = { id: 'pdf', name: '19269.pdf', contentType: 'application/pdf', size: 100, '@odata.type': '#microsoft.graph.fileAttachment' }
  let decisions = 0, extractions = 0
  const f = await fixture({ hasAttachments: true, recommendationApiKey: 'synthetic', attachmentList: { value: [{ ...file, id: 'inline', isInline: true }, { ...file, id: 'big', size: 10 * 1024 * 1024 }, { ...file, id: 'zip', name: 'x.zip', contentType: 'application/zip' }, file, { ...file, id: 'second' }, { ...file, id: 'third' }], '@odata.nextLink': 'NEVER FOLLOW' }, classifyDecision: async input => {
    decisions++
    if (!input.documents) return { kinds: [], inspectAttachments: true }
    assert.equal(input.documents.length, 2)
    assert.match(input.documents[0].text, /Rechnung/)
    return { kinds: ['invoice'], inspectAttachments: false }
  }, extractRecommendationDocument: async () => { extractions++; return { text: 'Rechnung 123', method: 'native_text', inspectedPages: 2, uncertain: false } } })
  try {
    await f.activate(); await f.deliver(); const [run] = await f.runs()
    await f.handlers.process(run); await f.handlers.process(run)
    assert.equal(decisions, 2); assert.equal(extractions, 2)
    assert.deepEqual(f.calls.filter(call => call.operation === 'attachment').map(call => call.attachmentId), ['pdf', 'second'])
    f.actor(profile)
    const result = await f.handlers.list(f.request({ messageIds: ['immutable'] }))
    assert.deepEqual(result.recommendations.immutable, ['invoice'])
    assert.deepEqual((await f.handlers.list(f.request({ connectionId: f.c2, messageIds: ['immutable'] }, f.other))).recommendations, result.recommendations)
    const stored = (await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}/messages/${hash('immutable')}`).get()).data()
    assert.ok(!JSON.stringify(stored).includes('Rechnung')); assert.equal(stored.documents, undefined)
  } finally { await f.close() }
})

test('emulator: decisive mail, absent attachments or explicit no-fallback never download documents', { skip: !enabled }, async () => {
  for (const [hasAttachments, decision] of [[true, { kinds: ['tracking'], inspectAttachments: true }], [true, { kinds: [], inspectAttachments: false }], [false, { kinds: [], inspectAttachments: true }]]) {
    const f = await fixture({ hasAttachments, classifyDecision: async () => decision })
    try {
      await f.activate(); await f.deliver(); await f.handlers.process((await f.runs())[0])
      assert.ok(f.calls.every(call => !call.operation.startsWith('attachment')))
    } finally { await f.close() }
  }
})

test('emulator: attachment budget, stale results and uncertain OCR cannot produce late or guessed recommendations', { skip: !enabled }, async () => {
  for (const offset of [70000, 302000]) {
    let f
    f = await fixture({ hasAttachments: true, classifyDecision: async () => { f.clock(at + offset); return { kinds: [], inspectAttachments: true } } })
    try {
      await f.activate(); await f.deliver(); await f.handlers.process((await f.runs())[0])
      assert.ok(f.calls.every(call => !call.operation.startsWith('attachment')))
    } finally { await f.close() }
  }
  let calls = 0
  const f = await fixture({ hasAttachments: true, recommendationApiKey: 'synthetic', attachmentList: { value: [{ id: 'pdf', name: 'Scan.pdf', contentType: 'application/pdf', size: 100, '@odata.type': '#microsoft.graph.fileAttachment' }] }, classifyDecision: async () => { calls++; return { kinds: [], inspectAttachments: true } }, extractRecommendationDocument: async () => ({ text: 'Uncertain invoice', uncertain: true }) })
  try {
    await f.activate(); await f.deliver(); await f.handlers.process((await f.runs())[0])
    assert.equal(calls, 1)
    f.actor(profile); assert.deepEqual((await f.handlers.list(f.request({ messageIds: ['immutable'] }))).recommendations.immutable, [])
  } finally { await f.close() }
})

test('emulator: attachment failures emit a content-free diagnostic and remain a completed empty recommendation', { skip: !enabled }, async () => {
  const diagnostics = []
  const f = await fixture({ hasAttachments: true, recommendationApiKey: 'synthetic', attachmentList: { value: [{ id: 'pdf', name: 'Scan.pdf', contentType: 'application/pdf', size: 100, '@odata.type': '#microsoft.graph.fileAttachment' }] }, classifyDecision: async () => ({ kinds: [], inspectAttachments: true }), extractRecommendationDocument: async () => { throw new Error('SECRET DOCUMENT CONTENT') }, diagnostic: async event => { diagnostics.push(event); throw new Error('diagnostic unavailable') } })
  try {
    await f.activate(); await f.deliver(); const [run] = await f.runs(); await f.handlers.process(run); await f.handlers.process(run)
    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0].stage, 'recommendation-attachment')
    assert.ok(!JSON.stringify(diagnostics).includes('SECRET'))
    const stored = (await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}/messages/${hash('immutable')}`).get()).data()
    assert.equal(stored.state, 'completed'); assert.deepEqual(stored.kinds, [])
  } finally { await f.close() }
})

test('emulator: personal activation stays owned; missing shared application permission is visible', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const settings = await f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: true }))
    assert.equal(settings.state, 'active'); assert.equal(settings.managed, false)
    f.actor({ active: true, role: 'superadmin' })
    await assert.rejects(f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: false }, f.other)), { code: 'permission-denied' })
    await f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: false }))
    await f.db.recursiveDelete(f.db.doc(`mailboxRecommendationScopes/${recommendationScope(f.personal)}`))
  } finally { await f.close() }
  const g = await fixture({ graph: async () => { const error = new Error('denied'); error.code = 'permission-denied'; throw error } })
  try { await g.activate(); g.actor(profile); assert.equal((await g.handlers.getSettings(g.request())).state, 'permission_required') }
  finally { await g.close() }
})
