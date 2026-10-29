import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { assertMailboxAccess, assertMailboxEnvironment, assertTestRecipients, createMailboxHandlers, mailboxMessagePagePath, validateMailboxDraft } from './mailboxes.js'

const hash = value => createHash('sha256').update(value).digest('hex')
const connectionId = 'a'.repeat(64)
const config = { project: 'db-bpl-drehpunkt-dev', secret: 'unit-test-secret-only', redirect: 'https://example.test/callback', origin: 'https://example.test', testAccount: 'bb@brennpunkt-logistik.de' }
const profile = { active: true, role: 'user', email: config.testAccount, permissions: { mailboxes: 'edit' } }
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
function database() {
  const records = new Map()
  const doc = path => ({
    id: path.split('/').at(-1), path,
    async get() { return { exists: records.has(path), data: () => structuredClone(records.get(path)) } },
    async create(value) { assert.equal(records.has(path), false); records.set(path, structuredClone(value)) },
    async set(value, options) { records.set(path, options?.merge ? { ...records.get(path), ...structuredClone(value) } : structuredClone(value)) },
    async update(value) { assert.ok(records.has(path)); records.set(path, { ...records.get(path), ...structuredClone(value) }) },
    async delete() { records.delete(path) },
  })
  let queue = Promise.resolve()
  return {
    records, doc,
    collection(path) {
      const query = { field: '', value: 0, where(field, op, value) { assert.equal(op, '<'); this.field = field; this.value = value; return this }, limit() { return this }, async get() { return { docs: [...records].filter(([key, value]) => key.startsWith(`${path}/`) && value[this.field] < this.value).map(([key, value]) => ({ ref: doc(key), data: () => structuredClone(value) })) } } }
      return query
    },
    runTransaction(fn) {
      const result = queue.then(() => fn({ get: ref => ref.get(), create: (ref, value) => ref.create(value), update: (ref, value) => ref.update(value), set: (ref, value, options) => ref.set(value, options) }))
      queue = result.catch(() => {})
      return result
    },
  }
}
function fixture(overrides = {}) {
  const db = database()
  db.records.set(`mailboxConnections/${connectionId}`, { ownerId: 'owner', status: 'connected', secretVersion: 'test/version', secretName: 'test' })
  let fetchCount = 0
  const deps = { db, config, now: () => 1000, requireProfile: async () => profile, diagnostic: async () => {}, secrets: { read: async () => ({ accessToken: 'private-access-token', refreshToken: 'private-refresh-token', expiresAt: 1000000 }) }, fetch: async () => { fetchCount++; return response(null, 202) }, ...overrides }
  return { db, deps, handlers: createMailboxHandlers(deps), fetchCount: () => fetchCount }
}
const proof = 'b'.repeat(43)
const proofChallenge = createHash('sha256').update(proof).digest('base64url')
const request = data => ({ auth: { uid: 'owner' }, data: { connectionId, proofChallenge, ...data } })
const draft = { body: 'Testantwort', replyAll: false, toRecipients: ['bb@brennpunkt-logistik.de'], ccRecipients: [], bccRecipients: [] }
const reply = { ...draft, revision: 0, messageId: 'message-1', operationId: '0123456789abcdef' }

test('personal tracking requires both module rights and mailbox ownership; reads only Graph text without attachments', async () => {
  const denied = fixture()
  await assert.rejects(denied.handlers.previewMailboxTracking(request({ messageId: 'message-1' })), { code: 'permission-denied' })
  assert.equal(denied.fetchCount(), 0)
  const paths = []
  let seen
  const f = fixture({ requireProfile: async () => ({ ...profile, permissions: { mailboxes: 'edit', transportOrders: 'edit' } }), fetch: async url => { paths.push(url); return response({ id: 'message-1', receivedDateTime: '2026-10-29T10:00:00Z', body: { contentType: 'text', content: 'Server-side personal message' } }) }, inferOrder: async input => { seen = input; return { candidates: [] } } })
  const result = await f.handlers.previewMailboxTracking(request({ messageId: 'message-1', bodyText: 'Fake client message' }))
  assert.equal(result.needsAssignment, true)
  assert.equal(seen.bodyText, 'Server-side personal message')
  assert.equal(paths.length, 1)
  assert.ok(!paths[0].includes('attachments'))
  await assert.rejects(f.handlers.previewMailboxTracking({ auth: { uid: 'foreign' }, data: { connectionId, messageId: 'message-1' } }), { code: 'permission-denied' })
  await assert.rejects(f.handlers.applyMailboxTracking({ auth: { uid: 'foreign' }, data: { connectionId } }), { code: 'permission-denied' })
})

test('mailbox names are owner-only, require edit access and can be cleared without changing Microsoft metadata', async () => {
  const f = fixture()
  const ref = `mailboxConnections/${connectionId}`
  f.db.records.get(ref).displayName = 'Microsoft Name'
  assert.deepEqual(await f.handlers.updateMailboxName(request({ customName: '  Buchhaltung  ' })), { customName: 'Buchhaltung' })
  assert.equal(f.db.records.get(ref).customName, 'Buchhaltung')
  assert.equal(f.db.records.get(ref).displayName, 'Microsoft Name')
  assert.equal(f.fetchCount(), 0)
  for (const customName of ['x'.repeat(81), 'Name\nZeile', 'Name\u007f', null, { value: 'Test' }]) await assert.rejects(f.handlers.updateMailboxName(request({ customName })), { code: 'invalid-argument' })
  await assert.rejects(f.handlers.updateMailboxName({ auth: { uid: 'other' }, data: { connectionId, customName: 'Fremd' } }), { code: 'permission-denied' })
  const viewer = fixture({ requireProfile: async () => ({ ...profile, permissions: { mailboxes: 'view' } }) })
  await assert.rejects(viewer.handlers.updateMailboxName(request({ customName: 'Nicht erlaubt' })), { code: 'permission-denied' })
  await f.handlers.updateMailboxName(request({ customName: '' }))
  assert.equal(f.db.records.get(ref).customName, '')
})

test('reconnecting preserves the personal mailbox name', async () => {
  const f = fixture({ secrets: { remove: async () => {} } })
  f.db.records.get(`mailboxConnections/${connectionId}`).customName = 'Meine Belege'
  const ticket = 't'.repeat(43)
  f.db.records.set(`mailboxOAuthPending/${hash(ticket)}`, { ownerId: 'owner', connectionId, proofChallenge, email: config.testAccount, graphUserId: 'graph-user', displayName: 'Microsoft Name', secretName: 'replacement', secretVersion: 'replacement/version', expiresAt: 10000, used: false })
  await f.handlers.finishMailboxConnection(request({ ticket, proof }))
  assert.equal(f.db.records.get(`mailboxConnections/${connectionId}`).customName, 'Meine Belege')
})

test('Graph message pagination accepts canonical OData paths and preserves the opaque query', () => {
  const connection = { graphUserId: 'own-graph-user', email: config.testAccount }
  const query = '?%24skiptoken=A%2FB%3D&%24top=30'
  for (const resource of [
    '/me/mailFolders/inbox/messages',
    "/me/mailFolders('inbox')/messages",
    "/me/mailfolders('opaque-folder-id')/messages",
    '/users/own-graph-user/mailFolders/opaque-folder-id/messages',
    "/users('own-graph-user')/mailFolders('opaque-folder-id')/messages",
  ]) {
    assert.equal(mailboxMessagePagePath(`https://graph.microsoft.com/v1.0${resource}${query}`, connection), `${resource}${query}`)
  }
  for (const link of [
    'https://attacker.test/v1.0/me/mailFolders/inbox/messages',
    'https://graph.microsoft.com.attacker.test/v1.0/me/mailFolders/inbox/messages',
    'https://graph.microsoft.com/v1.0/users/other-user/mailFolders/inbox/messages',
    'https://graph.microsoft.com/v1.0/me/drive/root/children',
    'https://graph.microsoft.com/beta/me/mailFolders/inbox/messages',
    'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages#fragment',
  ]) assert.throws(() => mailboxMessagePagePath(link, connection), { code: 'unavailable' })
})

test('a canonical Graph nextLink does not discard the first inbox page and can be requested with a signed cursor', async () => {
  const requests = []
  const nextLink = "https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages?%24skiptoken=opaque%2Fvalue%3D"
  const f = fixture({ fetch: async url => {
    requests.push(url)
    return response(requests.length === 1 ? { value: [{ id: 'first' }], '@odata.nextLink': nextLink } : { value: [{ id: 'second' }] })
  } })
  const first = await f.handlers.listMailboxMessages(request({}))
  assert.deepEqual(first.messages, [{ id: 'first' }])
  assert.ok(first.nextPageToken)
  const second = await f.handlers.listMailboxMessages(request({ pageToken: first.nextPageToken }))
  assert.equal(requests[1], nextLink)
  assert.deepEqual(second.messages, [{ id: 'second' }])
  assert.equal(second.nextPageToken, null)
  await assert.rejects(f.handlers.listMailboxMessages(request({ pageToken: `${first.nextPageToken}tampered` })), { code: 'invalid-argument' })
})

test('inbox search uses Graph, omits ordering, preserves opaque pages and binds them to the search', async () => {
  const requests = []
  const nextLink = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?%24skiptoken=opaque-search'
  const f = fixture({ fetch: async url => { requests.push(url); return response(requests.length === 1 ? { value: [{ id: 'match' }], '@odata.nextLink': nextLink } : { value: [{ id: 'next-match' }] }) } })
  const search = '  Rechnung & Auftrag "4711"  '
  const first = await f.handlers.listMailboxMessages(request({ search }))
  const url = new URL(requests[0])
  assert.equal(url.pathname, '/v1.0/me/mailFolders/inbox/messages')
  assert.equal(url.searchParams.get('$search'), JSON.stringify(search.trim()))
  assert.equal(url.searchParams.has('$orderby'), false)
  assert.equal(url.searchParams.get('$top'), '30')
  await assert.rejects(f.handlers.listMailboxMessages(request({ search: 'andere Suche', pageToken: first.nextPageToken })), { code: 'invalid-argument' })
  await assert.rejects(f.handlers.listMailboxMessages(request({ pageToken: first.nextPageToken })), { code: 'invalid-argument' })
  const second = await f.handlers.listMailboxMessages(request({ search, pageToken: first.nextPageToken }))
  assert.equal(requests[1], nextLink)
  assert.deepEqual(second.messages, [{ id: 'next-match' }])
  for (const search of [{}, 'x'.repeat(201), 'Suche\nZeile', 'Suche\u007f']) await assert.rejects(f.handlers.listMailboxMessages(request({ search })), { code: 'invalid-argument' })
  await f.handlers.listMailboxMessages(request({ search: '  ' }))
  const inbox = new URL(requests.at(-1))
  assert.equal(inbox.searchParams.has('$search'), false)
  assert.equal(inbox.searchParams.get('$orderby'), 'receivedDateTime desc')
})

test('Graph failure diagnostics retain only status codes, without provider payload or message content', async () => {
  const events = []
  const f = fixture({ fetch: async () => response({ error: { message: 'private provider content must not be logged' } }, 503), diagnostic: async event => { events.push(event) } })
  await assert.rejects(f.handlers.listMailboxMessages(request({})), { code: 'unavailable' })
  assert.equal(events[0].code, 'graph_http_503')
  assert.equal(JSON.stringify(events).includes('private provider'), false)
})
function callbackResponse() {
  return { statusCode: null, location: null, set() {}, status(code) { this.statusCode = code; return this }, send(value) { this.text = value }, redirect(code, location) { this.statusCode = code; this.location = location } }
}

test('mailbox module needs active profile and edit permission for effects; unknown and prod environments fail closed', () => {
  assert.doesNotThrow(() => assertMailboxAccess({ ...profile, permissions: { mailboxes: 'view' } }))
  assert.throws(() => assertMailboxAccess({ ...profile, permissions: { mailboxes: 'view' } }, true), { code: 'permission-denied' })
  assert.throws(() => assertMailboxAccess({ ...profile, active: false }), { code: 'permission-denied' })
  assert.throws(() => assertMailboxEnvironment('db-bpl-drehpunkt'), { code: 'failed-precondition' })
  assert.throws(() => assertMailboxEnvironment(''), { code: 'failed-precondition' })
})

test('all edited To/Cc/Bcc recipients are validated and restricted to the exact company domain', () => {
  const parsed = validateMailboxDraft(draft)
  assert.doesNotThrow(() => assertTestRecipients(parsed))
  for (const key of ['toRecipients', 'ccRecipients', 'bccRecipients']) {
    assert.doesNotThrow(() => assertTestRecipients(validateMailboxDraft({ ...draft, [key]: ['NEUER.NUTZER+TEST@BRENNPUNKT-LOGISTIK.DE'] })))
    for (const outside of ['external@example.org', 'test@brennpunkt-logistik.de.attacker.test', 'test@sub.brennpunkt-logistik.de', 'test@fakebrennpunkt-logistik.de']) {
      assert.throws(() => assertTestRecipients(validateMailboxDraft({ ...draft, [key]: [outside] })), { code: 'permission-denied' })
    }
    assert.throws(() => validateMailboxDraft({ ...draft, [key]: ['bb@brennpunkt-logistik.de\r\nBcc: external@example.org'] }), { code: 'invalid-argument' })
  }
  assert.throws(() => assertTestRecipients(validateMailboxDraft({ ...draft, toRecipients: [] })), { code: 'permission-denied' })
})

test('superadmin cannot access another users personal connection', async () => {
  const f = fixture({ requireProfile: async () => ({ ...profile, role: 'superadmin' }) })
  await assert.rejects(f.handlers.getMailboxMessage({ auth: { uid: 'other' }, data: { connectionId, messageId: '1' } }), { code: 'permission-denied' })
  assert.equal(f.fetchCount(), 0)
})

test('concurrent/replayed send operation makes one Graph request and persists accepted draft state', async () => {
  const f = fixture()
  const results = await Promise.all([f.handlers.sendMailboxReply(request(reply)), f.handlers.sendMailboxReply(request(reply))])
  assert.equal(f.fetchCount(), 1)
  assert.ok(results.every(result => ['accepted', 'unknown'].includes(result.status)))
  assert.equal((await f.handlers.sendMailboxReply(request(reply))).status, 'accepted')
  const loaded = await f.handlers.getMailboxDraft(request({ messageId: 'message-1' }))
  assert.equal(loaded.draft.operationId, reply.operationId)
  assert.equal(loaded.draft.sendStatus, 'accepted')
  await assert.rejects(f.handlers.sendMailboxReply(request({ ...reply, body: 'changed' })), { code: 'already-exists' })
  assert.equal(f.fetchCount(), 1)
})

test('uncertain send never automatically retries and survives reloading the draft', async () => {
  let attempts = 0
  const f = fixture({ fetch: async () => { attempts++; throw new Error('timeout possibly after delivery') } })
  assert.equal((await f.handlers.sendMailboxReply(request(reply))).status, 'unknown')
  assert.equal((await f.handlers.sendMailboxReply(request(reply))).status, 'unknown')
  assert.equal((await f.handlers.getMailboxDraft(request({ messageId: 'message-1' }))).draft.sendStatus, 'unknown')
  assert.equal(attempts, 1)
  await assert.rejects(f.handlers.sendMailboxReply(request({ ...reply, operationId: 'new-operation-123456' })), { code: 'aborted' })
  assert.equal(attempts, 1)
})

test('OAuth state has encrypted PKCE, expires, and is consumed once even when permission is revoked', async () => {
  let current = profile
  let calls = 0
  const f = fixture({ requireProfile: async () => current, fetch: async () => { calls++; throw new Error('must not exchange') } })
  const { authorizationUrl } = await f.handlers.beginMailboxConnection(request({}))
  const params = new URL(authorizationUrl).searchParams
  const state = params.get('state')
  const persisted = f.db.records.get(`mailboxOAuthStates/${hash(state)}`)
  assert.equal(params.get('code_challenge_method'), 'S256')
  assert.equal(persisted.ownerId, 'owner')
  assert.ok(persisted.expiresAt > 1000)
  assert.ok(persisted.verifier)
  current = { ...profile, active: false }
  const res = callbackResponse()
  await f.handlers.mailboxOAuthCallback({ query: { state, code: 'fake' } }, res)
  assert.equal(res.statusCode, 400)
  assert.equal(f.db.records.get(`mailboxOAuthStates/${hash(state)}`).verifier, null)
  current = profile
  await f.handlers.mailboxOAuthCallback({ query: { state, code: 'fake' } }, callbackResponse())
  assert.equal(calls, 0)
})

test('OAuth callback validates allowed Microsoft account before storing credentials; valid tokens only reach secret store', async () => {
  let account = 'someone@example.org'
  let stored = null
  const f = fixture({ fetch: async url => url.includes('/token') ? response({ access_token: 'very-private-access', refresh_token: 'very-private-refresh', expires_in: 3600, scope: 'User.Read Mail.Read Mail.Send' }) : response({ id: 'graph-user', mail: account, displayName: 'Test' }), secrets: { write: async (name, value) => { stored = value; return `secrets/${name}/versions/1` } } })
  const run = async () => {
    const { authorizationUrl } = await f.handlers.beginMailboxConnection(request({}))
    const res = callbackResponse()
    await f.handlers.mailboxOAuthCallback({ query: { state: new URL(authorizationUrl).searchParams.get('state'), code: 'code' } }, res)
    return res
  }
  assert.equal((await run()).statusCode, 400)
  assert.equal(stored, null)
  account = config.testAccount
  const connected = await run()
  assert.equal(connected.statusCode, 303)
  assert.equal(new URL(connected.location).pathname, '/profil')
  assert.equal(new URL(connected.location).hash, '#postfaecher')
  assert.equal(stored.refreshToken, 'very-private-refresh')
  const ticket = new URL(connected.location).searchParams.get('ticket')
  assert.equal(new URL(connected.location).searchParams.get('connection'), 'pending')
  await assert.rejects(f.handlers.finishMailboxConnection(request({ ticket, proof: 'c'.repeat(43) })), { code: 'permission-denied' })
  await assert.rejects(f.handlers.finishMailboxConnection({ auth: { uid: 'other' }, data: { ticket, proof } }), { code: 'permission-denied' })
  const completed = await f.handlers.finishMailboxConnection(request({ ticket, proof }))
  assert.ok(completed.connectionId)
  await assert.rejects(f.handlers.finishMailboxConnection(request({ ticket, proof })), { code: 'permission-denied' })
  const persisted = JSON.stringify([...f.db.records])
  assert.equal(persisted.includes('very-private'), false)
})

test('expired OAuth state is rejected before token exchange', async () => {
  let time = 1000
  const f = fixture({ now: () => time })
  const { authorizationUrl } = await f.handlers.beginMailboxConnection(request({}))
  time += 11 * 60000
  const res = callbackResponse()
  await f.handlers.mailboxOAuthCallback({ query: { state: new URL(authorizationUrl).searchParams.get('state'), code: 'fake' } }, res)
  assert.equal(res.statusCode, 400)
  assert.equal(f.fetchCount(), 0)
})

test('OAuth begin requires browser proof challenge; no Firebase/Microsoft email identity assumption', async () => {
  const f = fixture({ requireProfile: async () => ({ ...profile, email: 'different-login@example.org' }) })
  await assert.rejects(f.handlers.beginMailboxConnection(request({ proofChallenge: '' })), { code: 'invalid-argument' })
  assert.ok((await f.handlers.beginMailboxConnection(request({}))).authorizationUrl)
})

test('draft optimistic revision rejects stale saves and stale sends without losing the newer draft', async () => {
  const f = fixture()
  const first = await f.handlers.saveMailboxDraft(request({ messageId: 'message-1', draft: { ...draft, revision: 0 } }))
  assert.equal(first.draft.revision, 1)
  await assert.rejects(f.handlers.saveMailboxDraft(request({ messageId: 'message-1', draft: { ...draft, body: 'stale', revision: 0 } })), { code: 'aborted' })
  await assert.rejects(f.handlers.sendMailboxReply(request(reply)), { code: 'aborted' })
  assert.equal(f.fetchCount(), 0)
  assert.equal((await f.handlers.getMailboxDraft(request({ messageId: 'message-1' }))).draft.body, draft.body)
  await f.handlers.sendMailboxReply(request({ ...reply, revision: 1 }))
  await assert.rejects(f.handlers.saveMailboxDraft(request({ messageId: 'message-1', draft: { ...draft, revision: 1 } })), { code: 'aborted' })
})

test('refresh commits a new secret version and destroys superseded credentials before sending', async () => {
  const destroyed = []
  const f = fixture({ secrets: { read: async () => ({ refreshToken: 'old-refresh', expiresAt: 0 }), write: async () => 'test/version2', destroy: async version => destroyed.push(version) }, fetch: async url => url.includes('/token') ? response({ access_token: 'new-access', refresh_token: 'new-refresh', scope: 'User.Read Mail.Read Mail.Send' }) : response(null, 202) })
  assert.equal((await f.handlers.sendMailboxReply(request(reply))).status, 'accepted')
  assert.deepEqual(destroyed, ['test/version'])
  assert.equal(f.db.records.get(`mailboxConnections/${connectionId}`).secretVersion, 'test/version2')
})

test('disconnect during refresh prevents token publication and destroys the uncommitted version', async () => {
  const destroyed = []
  const f = fixture()
  f.deps.secrets = { read: async () => ({ refreshToken: 'old-refresh', expiresAt: 0 }), write: async () => { await f.db.doc(`mailboxConnections/${connectionId}`).update({ status: 'disconnecting' }); return 'test/version2' }, destroy: async version => destroyed.push(version) }
  f.deps.fetch = async () => response({ access_token: 'new-access', refresh_token: 'new-refresh', scope: 'User.Read Mail.Read Mail.Send' })
  const handlers = createMailboxHandlers(f.deps)
  await assert.rejects(handlers.sendMailboxReply(request(reply)), { code: 'aborted' })
  assert.deepEqual(destroyed, ['test/version2'])
  assert.equal(f.db.records.get(`mailboxConnections/${connectionId}`).status, 'disconnecting')
})

test('incomplete disconnect can be retried but disables all mailbox reads immediately', async () => {
  let removals = 0
  const f = fixture({ secrets: { remove: async () => { removals++; if (removals === 1) throw new Error('temporary failure') } } })
  await assert.rejects(f.handlers.disconnectMailbox(request({})), { code: 'unavailable' })
  await assert.rejects(f.handlers.getMailboxMessage(request({ messageId: 'message-1' })), { code: 'permission-denied' })
  assert.deepEqual(await f.handlers.disconnectMailbox(request({})), { disconnected: true })
  assert.equal(f.db.records.get(`mailboxConnections/${connectionId}`).status, 'disconnected')
})

test('disconnect cannot disable or delete credentials of a concurrent replacement connection', async () => {
  const removed = []
  const f = fixture()
  f.deps.secrets = { remove: async name => { removed.push(name); await f.db.doc(`mailboxConnections/${connectionId}`).set({ ownerId: 'owner', status: 'connected', secretName: 'replacement-secret', secretVersion: 'replacement/v1' }) } }
  const handlers = createMailboxHandlers(f.deps)
  await assert.rejects(handlers.disconnectMailbox(request({})), { code: 'aborted' })
  assert.deepEqual(removed, ['test'])
  assert.equal(f.db.records.get(`mailboxConnections/${connectionId}`).status, 'connected')
  assert.equal(f.db.records.get(`mailboxConnections/${connectionId}`).secretName, 'replacement-secret')
})

test('failed retired credential destruction does not mask a successful refresh and is retried by cleanup', async () => {
  let failDestroy = true
  const destroyed = []
  let time = 1000
  const f = fixture({ now: () => time, secrets: { read: async () => ({ refreshToken: 'old-refresh', expiresAt: 0 }), write: async () => 'test/version2', destroy: async version => { if (failDestroy) throw new Error('temporary'); destroyed.push(version) } }, fetch: async url => url.includes('/token') ? response({ access_token: 'new-access', refresh_token: 'new-refresh', scope: 'User.Read Mail.Read Mail.Send' }) : response(null, 202) })
  assert.equal((await f.handlers.sendMailboxReply(request(reply))).status, 'accepted')
  assert.equal(f.db.records.get(`mailboxConnections/${connectionId}`).secretVersion, 'test/version2')
  assert.ok([...f.db.records.keys()].some(path => path.startsWith('mailboxSecretRetirements/')))
  failDestroy = false
  time++
  await f.handlers.cleanupMailboxConnections()
  assert.deepEqual(destroyed, ['test/version'])
  assert.equal([...f.db.records.keys()].some(path => path.startsWith('mailboxSecretRetirements/')), false)
})

test('OAuth callback reports technical failures without provider payloads, codes, state or message content', async () => {
  const events = []
  const f = fixture({ diagnostic: async event => events.push(event), fetch: async () => { throw new Error('provider secret description') } })
  const { authorizationUrl } = await f.handlers.beginMailboxConnection(request({}))
  const res = callbackResponse()
  const state = new URL(authorizationUrl).searchParams.get('state')
  await f.handlers.mailboxOAuthCallback({ query: { state, code: 'secret-code' } }, res)
  assert.equal(res.statusCode, 400)
  assert.equal(events.length, 1)
  assert.equal(events[0].actorId, 'owner')
  assert.equal(JSON.stringify(events).includes('provider secret'), false)
  assert.equal(JSON.stringify(events).includes(state), false)
  assert.equal(JSON.stringify(events).includes('secret-code'), false)
})
