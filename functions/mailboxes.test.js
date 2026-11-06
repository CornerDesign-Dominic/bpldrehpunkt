import { Buffer } from 'node:buffer'
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
      const query = { field: '', value: 0, where(field, op, value) { assert.ok(['<', '=='].includes(op)); this.op = op; this.field = field; this.value = value; return this }, orderBy() { return this }, limit() { return this }, async get() { return { docs: [...records].filter(([key, value]) => key.startsWith(`${path}/`) && (!this.field || (this.op === '==' ? value[this.field] === this.value : value[this.field] < this.value))).map(([key, value]) => ({ id: key.split('/').at(-1), ref: doc(key), data: () => structuredClone(value) })) } } }
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
const newMail = { ...draft, subject: 'Neue unabhängige Mail', revision: 0, operationId: 'new-mail-0123456789' }

test('learning Graph adapter subscribes only to SentItems and exact parent queries stay bounded', async () => {
  const calls = []
  const f = fixture({ fetch: async (url, options) => { calls.push({ url, options }); return response(url.includes('/messages?') ? { value: [] } : url.includes('/mailFolders/sentitems?') ? { id: 'sent-folder' } : { id: 'sent-mail', parentFolderId: 'sent-folder' }) } })
  await f.handlers.recommendationGraph({ connectionId, operation: 'learning-create', data: { changeType: 'created', notificationUrl: 'https://example.invalid/webhook' } })
  assert.equal(JSON.parse(calls[0].options.body).resource, "/me/mailFolders('sentitems')/messages")
  const sent = await f.handlers.recommendationGraph({ connectionId, operation: 'learning-sent', messageId: 'immutable/one' })
  assert.equal(sent.sentFolderId, 'sent-folder')
  assert.ok(calls.some(call => call.url.includes('/messages/immutable%2Fone?')))
  await f.handlers.recommendationGraph({ connectionId, operation: 'learning-parents', referenceId: "<message'one@example.invalid>" })
  const targeted = new URL(calls.at(-1).url)
  assert.equal(targeted.searchParams.get('$filter'), "internetMessageId eq '<message''one@example.invalid>'")
  assert.equal(targeted.searchParams.get('$top'), '10')
  await f.handlers.recommendationGraph({ connectionId, operation: 'learning-parents', conversationId: 'conversation-id' })
  assert.equal(new URL(calls.at(-1).url).searchParams.get('$top'), '50')
  await assert.rejects(f.handlers.recommendationGraph({ connectionId, operation: 'learning-parents' }), { code: 'invalid-argument' })
})

test('learning Graph parent lookup rejects incomplete pagination rather than scanning more mail', async () => {
  let count = 0
  const f = fixture({ fetch: async () => { count++; return response({ value: [], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skip=50' }) } })
  await assert.rejects(f.handlers.recommendationGraph({ connectionId, operation: 'learning-parents', conversationId: 'conversation' }), { code: 'failed-precondition' })
  assert.equal(count, 1)
})

test('production permits external To/Cc/Bcc without weakening ownership or creating Dev side effects', async () => {
  const calls = []
  const productionConfig = { ...config, project: 'db-bpl-drehpunkt', clientId: '11111111-2222-4333-8444-555555555555', redirect: 'https://europe-west3-db-bpl-drehpunkt.cloudfunctions.net/mailboxOAuthCallback', origin: 'https://drehpunktlogistik.de' }
  const f = fixture({ config: productionConfig, fetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return response(null, 202) } })
  const message = { ...newMail, toRecipients: ['customer@example.org'], ccRecipients: ['cc@example.org'], bccRecipients: ['bcc@example.org'] }
  await assert.rejects(f.handlers.sendMailboxMessage({ auth: { uid: 'other' }, data: { connectionId, ...message } }), { code: 'permission-denied' })
  assert.equal(calls.length, 0)
  assert.equal((await f.handlers.sendMailboxMessage(request(message))).status, 'accepted')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.message.bccRecipients[0].emailAddress.address, 'bcc@example.org')
  const dev = fixture()
  await assert.rejects(dev.handlers.sendMailboxMessage(request(message)), { code: 'permission-denied' })
  assert.equal(dev.fetchCount(), 0)
})

test('production authorization uses its own client and callback; absent or Dev identity cannot start OAuth', async () => {
  const productionConfig = { ...config, project: 'db-bpl-drehpunkt', clientId: '11111111-2222-4333-8444-555555555555', redirect: 'https://europe-west3-db-bpl-drehpunkt.cloudfunctions.net/mailboxOAuthCallback', origin: 'https://drehpunktlogistik.de' }
  const f = fixture({ config: productionConfig })
  const url = new URL((await f.handlers.beginMailboxConnection(request({}))).authorizationUrl)
  assert.equal(url.searchParams.get('client_id'), productionConfig.clientId)
  assert.equal(url.searchParams.get('redirect_uri'), productionConfig.redirect)
  for (const clientId of ['', 'a23dc8d8-e22a-40ef-997c-d28aa753ee29']) {
    const rejected = fixture({ config: { ...productionConfig, clientId } })
    await assert.rejects(rejected.handlers.beginMailboxConnection(request({})), { code: 'failed-precondition' })
    assert.equal([...rejected.db.records.keys()].filter(key => key.startsWith('mailboxOAuthStates/')).length, 0)
  }
})

test('record extraction uses owned server mail and attachments, never client-injected content or target routing', async () => {
  const paths = []
  let extracted
  const f = fixture({ requireProfile: async () => ({ ...profile, permissions: { mailboxes: 'edit', todos: 'edit' } }), recordApiKey: 'synthetic', fetch: async url => {
    paths.push(url)
    if (url.includes('/attachments?')) return response({ value: [{ id: 'file', name: 'Beleg.pdf', contentType: 'application/pdf', size: 100, '@odata.type': '#microsoft.graph.fileAttachment' }] })
    if (url.includes('/attachments/file')) return response({ contentBytes: 'cGRm' })
    return response({ subject: 'Servermail', body: { contentType: 'text', content: 'Vertrauenswürdige Serverquelle' } })
  }, extractRecordSources: async input => { extracted = input; return { sources: [], sourceFiles: [], warnings: [] } }, inferMailboxRecord: async () => ({ values: { title: 'Aufgabe' }, evidence: {}, summary: 'Test', references: [], warnings: [] }) })
  const result = await f.handlers.previewMailboxRecord(request({ kind: 'todo', messageId: 'source', body: 'Client manipulation', graphUserId: 'foreign', files: [{ name: 'fake' }] }))
  assert.equal(result.kind, 'todo')
  assert.equal(extracted.mail.body.content, 'Vertrauenswürdige Serverquelle')
  assert.equal(extracted.files[0].contentBytes, 'cGRm')
  assert.ok(paths.every(path => path.includes('/me/messages/source')))
  await assert.rejects(f.handlers.previewMailboxRecord({ auth: { uid: 'other' }, data: { connectionId, kind: 'todo', messageId: 'source' } }), { code: 'permission-denied' })
  assert.equal(paths.length, 3)
})

test('new mail uses sendMail without a source message and preserves subject, recipients and plain text', async () => {
  const calls = []
  const f = fixture({ fetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return response(null, 202) } })
  const value = { ...newMail, ccRecipients: ['cc@brennpunkt-logistik.de'], bccRecipients: ['bcc@brennpunkt-logistik.de'] }
  const saved = await f.handlers.saveMailboxDraft(request({ messageId: 'compose:new', draft: value }))
  assert.equal((await f.handlers.getMailboxDraft(request({ messageId: 'compose:new' }))).draft.subject, value.subject)
  assert.equal((await f.handlers.sendMailboxMessage(request({ ...value, revision: saved.draft.revision, messageId: 'ignored-source', from: 'attacker@example.org' }))).status, 'accepted')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://graph.microsoft.com/v1.0/me/sendMail')
  assert.equal(calls[0].body.message.subject, value.subject)
  assert.deepEqual(calls[0].body.message.body, { contentType: 'Text', content: value.body })
  assert.equal(calls[0].body.message.from, undefined)
  assert.equal(calls[0].body.saveToSentItems, undefined) // Graph defaults to saving in Sent Items.
  assert.equal(calls[0].body.message.bccRecipients[0].emailAddress.address, value.bccRecipients[0])
  const loaded = (await f.handlers.getMailboxDraft(request({ messageId: 'compose:new' }))).draft
  assert.equal(loaded.sendStatus, 'accepted')
  assert.equal(loaded.body, '')
  assert.equal((await f.handlers.getMailboxDraft(request({ messageId: 'ignored-source' }))).draft, null)
})

test('new mail validates subject, body, all recipient domains, ownership and edit access before any Graph request', async () => {
  const f = fixture()
  for (const subject of ['', '  ', 'x'.repeat(256), 'Betreff\nBcc: attacker@example.org', null]) {
    await assert.rejects(f.handlers.sendMailboxMessage(request({ ...newMail, subject })), { code: 'invalid-argument' })
  }
  for (const key of ['toRecipients', 'ccRecipients', 'bccRecipients']) await assert.rejects(f.handlers.sendMailboxMessage(request({ ...newMail, [key]: ['external@example.org'] })), { code: 'permission-denied' })
  await assert.rejects(f.handlers.sendMailboxMessage(request({ ...newMail, toRecipients: [] })), { code: 'permission-denied' })
  await assert.rejects(f.handlers.sendMailboxMessage(request({ ...newMail, body: '' })), { code: 'invalid-argument' })
  await assert.rejects(f.handlers.sendMailboxMessage({ auth: { uid: 'other' }, data: { connectionId, ...newMail } }), { code: 'permission-denied' })
  const viewer = fixture({ requireProfile: async () => ({ ...profile, permissions: { mailboxes: 'view' } }) })
  await assert.rejects(viewer.handlers.sendMailboxMessage(request(newMail)), { code: 'permission-denied' })
  assert.equal(f.fetchCount(), 0)
  assert.equal(viewer.fetchCount(), 0)
})

test('new mail concurrent and replayed operations send once; fresh drafts allow subsequent independent messages', async () => {
  const f = fixture()
  await Promise.all([f.handlers.sendMailboxMessage(request(newMail)), f.handlers.sendMailboxMessage(request(newMail))])
  assert.equal(f.fetchCount(), 1)
  assert.equal((await f.handlers.sendMailboxMessage(request(newMail))).status, 'accepted')
  await assert.rejects(f.handlers.sendMailboxMessage(request({ ...newMail, subject: 'Changed' })), { code: 'already-exists' })
  const saved = await f.handlers.saveMailboxDraft(request({ messageId: 'compose:new', draft: { ...newMail, subject: 'Zweite Mail', revision: 0 } }))
  await f.handlers.sendMailboxMessage(request({ ...newMail, subject: 'Zweite Mail', revision: saved.draft.revision, operationId: 'another-new-mail-0123456789' }))
  assert.equal((await f.handlers.sendMailboxMessage(request(newMail))).status, 'accepted')
  assert.equal(f.fetchCount(), 2)
})

test('an uncertain new mail remains locked after reload and cannot be resent using a new operation', async () => {
  const f = fixture({ fetch: async () => { throw new Error('Possibly delivered') } })
  assert.equal((await f.handlers.sendMailboxMessage(request(newMail))).status, 'unknown')
  assert.equal((await f.handlers.sendMailboxMessage(request(newMail))).status, 'unknown')
  assert.equal((await f.handlers.getMailboxDraft(request({ messageId: 'compose:new' }))).draft.sendStatus, 'unknown')
  await assert.rejects(f.handlers.saveMailboxDraft(request({ messageId: 'compose:new', draft: newMail })), { code: 'aborted' })
  await assert.rejects(f.handlers.sendMailboxMessage(request({ ...newMail, operationId: 'unsafe-new-operation-0123' })), { code: 'aborted' })
})

test('shared new mail uses only the stored shared sender and cannot use a disconnected parent', async () => {
  const calls = []
  const f = sharedFixture({ fetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return response(null, 202) } })
  await f.handlers.sendMailboxMessage(sharedRequest({ ...newMail, from: 'spoof@example.org', graphUserId: 'spoof' }))
  assert.ok(calls[0].url.includes(`/users/${encodeURIComponent(sharedEmail)}/sendMail`))
  assert.equal(calls[0].body.message.from.emailAddress.address, sharedEmail)
  f.db.records.get(`mailboxConnections/${connectionId}`).status = 'disconnected'
  await assert.rejects(f.handlers.sendMailboxMessage(sharedRequest({ ...newMail, operationId: 'another-new-operation-0123' })), { code: 'failed-precondition' })
  assert.equal(calls.length, 1)
})

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

test('sent folder pages include recipients and sent date, with signed search and folder binding', async () => {
  const calls=[]
  const nextLink="https://graph.microsoft.com/v1.0/me/mailFolders('sentitems')/messages?$skiptoken=opaque"
  const f=fixture({fetch:async(url,options)=>{calls.push({url,options});return response({value:[{id:'sent',flag:{flagStatus:'flagged'}}],'@odata.nextLink':nextLink})}})
  const first=await f.handlers.listMailboxMessages(request({folder:'sentitems'}))
  const url=new URL(calls[0].url)
  assert.equal(url.pathname,'/v1.0/me/mailFolders/sentitems/messages')
  assert.equal(url.searchParams.get('$orderby'),'sentDateTime desc')
  for(const property of ['toRecipients','sentDateTime','isRead','flag']) assert.ok(url.searchParams.get('$select').split(',').includes(property))
  await assert.rejects(f.handlers.listMailboxMessages(request({folder:'inbox',pageToken:first.nextPageToken})),{code:'invalid-argument'})
  await assert.rejects(f.handlers.listMailboxMessages(request({folder:'sentitems',pageToken:first.nextPageToken+'.junk'})),{code:'invalid-argument'})
  await f.handlers.listMailboxMessages(request({folder:'sentitems',pageToken:first.nextPageToken}))
  assert.equal(calls.at(-1).url,nextLink)
  await f.handlers.listMailboxMessages(request({folder:'sentitems',search:'customer'}))
  assert.equal(new URL(calls.at(-1).url).searchParams.has('$orderby'),false)
  for(const folder of ['drafts','../messages','/users/other',{},0,null]) await assert.rejects(f.handlers.listMailboxMessages(request({folder})),{code:'invalid-argument'})
  assert.ok(calls.every(call=>!call.options.method))
})

const stateRequest=data=>({auth:{uid:'owner'},data:{connectionId,messageId:'message/with+opaque==',...data}})
const writeSecrets=scopes=>({read:async()=>({accessToken:'write-token',refreshToken:'refresh',expiresAt:1000000,scopes})})
test('message metadata mutation only patches the requested status on the owned mailbox',async()=>{
  const calls=[]
  const f=fixture({secrets:writeSecrets(['Mail.ReadWrite']),fetch:async(url,options)=>{calls.push({url,options});return response({id:'message/with+opaque==',isRead:true,flag:{flagStatus:'notFlagged'}})}})
  const read=await f.handlers.updateMailboxMessageState(stateRequest({isRead:true}))
  assert.equal(read.message.isRead,true)
  assert.equal(calls[0].options.method,'PATCH')
  assert.deepEqual(JSON.parse(calls[0].options.body),{isRead:true})
  assert.equal(new URL(calls[0].url).pathname,'/v1.0/me/messages/message%2Fwith%2Bopaque%3D%3D')
  for(const flagStatus of ['flagged','complete','notFlagged']) {
    await f.handlers.updateMailboxMessageState(stateRequest({flagStatus}))
    assert.deepEqual(JSON.parse(calls.at(-1).options.body),{flag:{flagStatus}})
  }
  await f.handlers.updateMailboxMessageState(stateRequest({isRead:false}))
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{isRead:false})
})

test('status updates reject extra properties, invalid state, absent identity and foreign connection ownership before Graph',async()=>{
  const f=fixture({secrets:writeSecrets(['Mail.ReadWrite'])})
  for(const data of [{},{isRead:'true'},{isRead:null},{flagStatus:'done'},{isRead:true,flagStatus:'flagged'},{isRead:true,body:'overwritten'},{isRead:true,graphUserId:'foreign'},{flag:{flagStatus:'flagged'}}]) await assert.rejects(f.handlers.updateMailboxMessageState(stateRequest(data)),{code:'invalid-argument'})
  await assert.rejects(f.handlers.updateMailboxMessageState({auth:{uid:'other'},data:{connectionId,messageId:'x',isRead:true}}),{code:'permission-denied'})
  assert.equal(f.fetchCount(),0)
})

test('metadata updates require mailbox edit access, while reading never marks a message or flags it',async()=>{
  const calls=[]
  const f=fixture({requireProfile:async()=>({...profile,permissions:{mailboxes:'view'}}),fetch:async(url,options)=>{calls.push({url,options});return response(url.includes('attachments?')?{value:[]}:{id:'x',body:{contentType:'text',content:'mail'},isRead:false,flag:{flagStatus:'flagged'}})}})
  for(const state of [{isRead:true},{flagStatus:'complete'}]) await assert.rejects(f.handlers.updateMailboxMessageState(stateRequest(state)),{code:'permission-denied'})
  const result=await f.handlers.getMailboxMessage(request({messageId:'x'}))
  assert.equal(result.message.isRead,false);assert.equal(result.message.flag.flagStatus,'flagged')
  assert.ok(calls.every(call=>!call.options.method))
  assert.ok(new URL(calls[0].url).searchParams.get('$select').split(',').includes('flag'))
})

test('existing read-only token remains usable for browsing but updates require renewed delegated write scope',async()=>{
  const calls=[]
  const f=fixture({secrets:writeSecrets(['User.Read','Mail.Read','Mail.Send']),fetch:async(url,options)=>{calls.push({url,options});return response({value:[]})}})
  await f.handlers.listMailboxMessages(request({}))
  await assert.rejects(f.handlers.updateMailboxMessageState(stateRequest({isRead:true})),error=>error.code==='failed-precondition'&&error.details.technicalCode==='mailbox_write_scope_required')
  assert.equal(calls.length,1)
  assert.equal(calls[0].options.method,undefined)
})

test('shared status updates use only parent delegated shared write scope and stored target, not personal write or app access',async()=>{
  const calls=[]
  const f=sharedFixture({secrets:writeSecrets(['Mail.ReadWrite.Shared']),fetch:async(url,options)=>{calls.push({url,options});return response({id:'shared',isRead:true})}})
  await f.handlers.updateMailboxMessageState(stateRequest({connectionId:sharedId,isRead:true}))
  assert.equal(new URL(calls[0].url).pathname,`/v1.0/users/${encodeURIComponent(sharedEmail)}/messages/message%2Fwith%2Bopaque%3D%3D`)
  assert.equal(calls[0].options.headers.Authorization,'Bearer write-token')
  const denied=sharedFixture({secrets:writeSecrets(['Mail.ReadWrite'])})
  await assert.rejects(denied.handlers.updateMailboxMessageState(stateRequest({connectionId:sharedId,flagStatus:'flagged'})),{code:'failed-precondition'})
  assert.equal(denied.fetchCount(),0)
})

test('refresh keeps existing scopes until interactive renewal and accepts broader Mail.ReadWrite as read',async()=>{
  const scopes=[];let stored
  const f=fixture({secrets:{read:async()=>({refreshToken:'old',expiresAt:0,scopes:['user.read','mail.read','mail.send']}),write:async(_name,value)=>{stored=value;return'test/new'},destroy:async()=>{}},fetch:async(url,options)=>{
    if(url.includes('/token')){scopes.push(new URLSearchParams(options.body).get('scope'));return response({access_token:'new',refresh_token:'new-refresh',scope:'User.Read Mail.ReadWrite Mail.Send'})}
    return response({value:[]})
  }})
  await f.handlers.listMailboxMessages(request({}))
  assert.equal(scopes.length,1);assert.ok(!scopes[0].toLowerCase().includes('mail.readwrite'))
  assert.ok(stored.scopes.includes('mail.readwrite'))
  const authUrl=new URL((await f.handlers.beginMailboxConnection(request({}))).authorizationUrl)
  assert.ok(authUrl.searchParams.get('scope').includes('/Mail.ReadWrite '))
  assert.ok(authUrl.searchParams.get('scope').includes('/Mail.ReadWrite.Shared'))
})

test('renewed write grants survive attachment, sending and recommendation refreshes without marking mail read',async()=>{
  let time=1000,serial=0
  let saved={refreshToken:'old',expiresAt:0,scopes:['user.read','mail.readwrite','mail.send','mail.readwrite.shared','mail.send.shared']}
  const requested=[],methods=[]
  const f=fixture({now:()=>time,secrets:{read:async()=>saved,write:async(_name,tokens)=>{saved=tokens;return`test/version-${++serial}`},destroy:async()=>{}},fetch:async(url,options)=>{
    methods.push({url,method:options.method})
    if(url.includes('/token')){requested.push(new URLSearchParams(options.body).get('scope'));return response({access_token:'renewed',refresh_token:'new',scope:'User.Read Mail.ReadWrite Mail.Send Mail.ReadWrite.Shared Mail.Send.Shared',expires_in:3600})}
    if(url.endsWith('/sendMail'))return response(null,202)
    if(url.includes('/attachments/'))return response({'@odata.type':'#microsoft.graph.fileAttachment',name:'document.pdf',size:2,contentBytes:'e30='})
    return response({id:'x',body:{contentType:'text',content:'mail'}})
  }})
  await f.handlers.getMailboxAttachment(request({messageId:'x',attachmentId:'attachment'}))
  time+=4000000
  await f.handlers.sendMailboxMessage(request(newMail))
  time+=4000000
  await f.handlers.recommendationGraph({connectionId,operation:'message',messageId:'x'})
  assert.equal(requested.length,3)
  for(const scope of requested){assert.ok(scope.toLowerCase().includes('/mail.readwrite '));assert.ok(scope.toLowerCase().includes('/mail.readwrite.shared'))}
  assert.ok(saved.scopes.includes('mail.readwrite.shared'))
  assert.ok(!methods.some(call=>call.method==='PATCH'))
  await f.handlers.updateMailboxMessageState(stateRequest({isRead:true}))
  assert.ok(methods.at(-1).url.includes('/me/messages/'))
  assert.equal(methods.at(-1).method,'PATCH')
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

test('mailbox module needs active profile and edit permission; only approved Dev and production environments are accepted', () => {
  assert.doesNotThrow(() => assertMailboxAccess({ ...profile, permissions: { mailboxes: 'view' } }))
  assert.throws(() => assertMailboxAccess({ ...profile, permissions: { mailboxes: 'view' } }, true), { code: 'permission-denied' })
  assert.throws(() => assertMailboxAccess({ ...profile, active: false }), { code: 'permission-denied' })
  assert.doesNotThrow(() => assertMailboxEnvironment('db-bpl-drehpunkt'))
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
  await assert.rejects(f.handlers.saveMailboxDraft(request({ messageId: reply.messageId, draft: { ...draft, revision: 0 } })), { code: 'aborted' })
  assert.equal(attempts, 1)
})

test('five distinct replies to one incoming message preserve receipts and reject stale windows and replays', async () => {
  const f = fixture()
  let revision = 0
  const receipts = []
  for (let index = 0; index < 5; index++) {
    const saved = await f.handlers.saveMailboxDraft(request({ messageId: reply.messageId, draft: { ...draft, body: `Antwort ${index + 1}`, revision } }))
    revision = saved.draft.revision
    const next = { ...reply, body: saved.draft.body, revision, operationId: `separate-reply-${index}-0123456789` }
    const statuses = await Promise.all([f.handlers.sendMailboxReply(request(next)), f.handlers.sendMailboxReply(request(next))])
    assert.ok(statuses.every(result => ['accepted', 'unknown'].includes(result.status)))
    assert.equal((await f.handlers.getMailboxDraft(request({ messageId: reply.messageId }))).draft.body, '')
    receipts.push(next)
  }
  assert.equal(f.fetchCount(), 5)
  for (const old of receipts) assert.equal((await f.handlers.sendMailboxReply(request(old))).status, 'accepted')
  assert.equal(f.fetchCount(), 5)
  await assert.rejects(f.handlers.saveMailboxDraft(request({ messageId: reply.messageId, draft: { ...draft, revision: 1 } })), { code: 'aborted' })
  await assert.rejects(f.handlers.sendMailboxReply(request({ ...reply, revision: 1, operationId: 'stale-window-0123456789' })), { code: 'aborted' })
  assert.equal(f.fetchCount(), 5)
  assert.equal([...f.db.records.keys()].filter(key => key.startsWith('mailboxSendOperations/')).length, 5)
})

test('new replies allow fresh suggestions while retaining the local learning-case link and rejecting late suggestions', async () => {
  let complete, entered
  const ready = new Promise(resolve => { entered = resolve })
  const f = fixture({ fetch: async () => response({}), generateReplySuggestion: async () => { entered(); return new Promise(resolve => { complete = resolve }) } })
  const running = f.handlers.suggestMailboxReply(request({ messageId: reply.messageId }))
  await ready
  await f.handlers.sendMailboxReply(request(reply))
  const key = `mailboxDrafts/${hash(`owner|${connectionId}|${reply.messageId}`)}`
  Object.assign(f.db.records.get(key), { knowledgeEvidenceId: 'e'.repeat(64), lastSuggestion: { hash: 'old' } })
  const next = await f.handlers.saveMailboxDraft(request({ messageId: reply.messageId, draft: { ...draft, body: '', revision: 0 } }))
  assert.equal(next.draft.revision, 1)
  assert.equal(f.db.records.get(key).operationId, undefined)
  assert.equal(f.db.records.get(key).knowledgeEvidenceId, 'e'.repeat(64))
  assert.equal(f.db.records.get(key).lastSuggestion, undefined)
  complete('Veralteter Vorschlag')
  await assert.rejects(running, { code: 'aborted' })
  f.deps.generateReplySuggestion = async () => 'Neuer Vorschlag'
  assert.equal((await f.handlers.suggestMailboxReply(request({ messageId: reply.messageId }))).suggestion, 'Neuer Vorschlag')
})

test('late cleanup of an accepted send cannot erase the next reply draft', async () => {
  let release, entered
  const ready = new Promise(resolve => { entered = resolve })
  const f = fixture()
  const originalDoc = f.db.doc
  f.db.doc = path => {
    const ref = originalDoc(path)
    if (path.startsWith('mailboxSendOperations/')) return { ...ref, update: async patch => {
      await ref.update(patch)
      if (patch.status === 'accepted') { entered(); await new Promise(resolve => { release = resolve }) }
    } }
    return ref
  }
  const sending = f.handlers.sendMailboxReply(request(reply))
  await ready
  await f.handlers.saveMailboxDraft(request({ messageId: reply.messageId, draft: { ...draft, body: 'Nächste Antwort', revision: 0 } }))
  release()
  assert.equal((await sending).status, 'accepted')
  assert.equal((await f.handlers.getMailboxDraft(request({ messageId: reply.messageId }))).draft.body, 'Nächste Antwort')
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

test('OAuth accepts a new authenticated tenant account with browser binding; tokens only reach secret store', async () => {
  const account = 'new-user@brennpunkt-logistik.de'
  let graphId = ''
  let stored = null
  const f = fixture({ fetch: async url => url.includes('/token') ? response({ access_token: 'very-private-access', refresh_token: 'very-private-refresh', expires_in: 3600, scope: 'User.Read Mail.Read Mail.Send Mail.Read.Shared Mail.Send.Shared' }) : response({ id: graphId, mail: account, displayName: 'Test' }), secrets: { write: async (name, value) => { stored = value; return `secrets/${name}/versions/1` } } })
  const run = async () => {
    const { authorizationUrl } = await f.handlers.beginMailboxConnection(request({}))
    const res = callbackResponse()
    await f.handlers.mailboxOAuthCallback({ query: { state: new URL(authorizationUrl).searchParams.get('state'), code: 'code' } }, res)
    return res
  }
  assert.equal((await run()).statusCode, 400)
  assert.equal(stored, null)
  graphId = 'graph-user'
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
  const next = await f.handlers.saveMailboxDraft(request({ messageId: 'message-1', draft: { ...draft, body: 'Weitere Antwort', revision: 1 } }))
  assert.equal(next.draft.revision, 2)
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

test('AGB mail action checks ownership and AGB rights before Graph; reads every PDF and no message body', async () => {
  const denied = fixture()
  await assert.rejects(denied.handlers.analyzeMailboxAgb(request({ messageId: 'message' })), { code: 'permission-denied' })
  assert.equal(denied.fetchCount(), 0)
  const paths = []
  const pdf = Buffer.from('%PDF-1.4 synthetic').toString('base64')
  const f = fixture({ requireProfile: async () => ({ ...profile, permissions: { mailboxes: 'edit', agbChecker: 'view' } }), fetch: async url => {
    paths.push(url)
    if (url.includes('/attachments?')) return response({ value: ['one', 'two'].map(id => ({ id, name: `${id}.pdf`, size: 30, contentType: 'application/pdf', '@odata.type': '#microsoft.graph.fileAttachment' })) })
    if (url.includes('?$select=')) return response({ name: 'file.pdf', size: 30, contentType: 'application/pdf', '@odata.type': '#microsoft.graph.fileAttachment' })
    return response({ contentBytes: pdf, name: 'file.pdf' })
  }, extractAgbPdf: async () => ({ text: 'AGB text', pageCount: 1 }), analyzeAgbText: async input => { assert.equal(input.sourceFiles.length, 2); assert.ok(!input.text.includes('forged')); return { historyId: 'history' } } })
  const result = await f.handlers.analyzeMailboxAgb(request({ messageId: 'message', mailText: 'forged' }))
  assert.equal(result.historyId, 'history')
  assert.equal(paths.length, 5)
  assert.ok(paths.every(path => path.includes('/attachments')))
  await assert.rejects(f.handlers.analyzeMailboxAgb({ auth: { uid: 'foreign' }, data: { connectionId, messageId: 'message' } }), { code: 'permission-denied' })
})

test('invoice action uses server PDF data and refuses missing transport edit rights before Graph', async () => {
  const denied = fixture()
  await assert.rejects(denied.handlers.reviewMailboxInvoices(request({messageId:'message',operationId:'request-000000001'})), {code:'permission-denied'})
  assert.equal(denied.fetchCount(),0)
  const paths=[]
  const f=fixture({requireProfile:async()=>({...profile,permissions:{mailboxes:'edit',transportOrders:'edit'}}), fetch:async url=>{
    paths.push(url)
    if(url.includes('/attachments?'))return response({value:[{id:'pdf',name:'invoice.pdf',size:30,contentType:'application/pdf','@odata.type':'#microsoft.graph.fileAttachment'}]})
    if(url.includes('?$select='))return response({subject:'Server TA 261000824',body:{content:'Server mail context'}})
    return response({'@odata.type':'#microsoft.graph.fileAttachment',contentBytes:Buffer.from('%PDF-1.4 synthetic').toString('base64'),name:'invoice.pdf'})
  },extractInvoicePdf:async()=>({text:'Server attachment text',pageCount:1}),inferInvoices:async input=>{assert.equal(input.documents[0].text,'Server attachment text');assert.equal(input.mail.subject,'Server TA 261000824');assert.ok(!JSON.stringify(input.mail).includes('forged'));return {invoices:[]}}})
  const result=await f.handlers.reviewMailboxInvoices(request({messageId:'message',operationId:'request-000000001',body:'forged client TA'}))
  assert.match(result.message,/Keine Rechnung/);assert.equal(paths.filter(path=>!path.includes('/attachments')).length,1)
  await assert.rejects(f.handlers.reviewMailboxInvoices({auth:{uid:'foreign'},data:{connectionId,messageId:'message',operationId:'request-000000001'}}),{code:'permission-denied'})
})
test('transport invoice history requires transport access but not personal mailbox access',async()=>{
  const f=fixture({requireProfile:async()=>({...profile,permissions:{transportOrders:'view'}})})
  f.db.records.set('transportOrders/order-1',{externalNumber:'260000001'})
  f.db.records.set('invoiceCheckReports/report-1',{ownerId:'other-user',report:{id:'report-1',status:'match'}})
  f.db.collection=path=>{assert.equal(path,'transportOrders/order-1/invoiceChecks');return{orderBy:()=>({limit:()=>({get:async()=>({docs:[{data:()=>({reportId:'report-1'})}]})})})}}
  const result=await f.handlers.listTransportInvoiceChecks({auth:{uid:'owner'},data:{orderId:'order-1'}})
  assert.equal(result.reports[0].id,'report-1')
  const denied=fixture();await assert.rejects(denied.handlers.listTransportInvoiceChecks({auth:{uid:'owner'},data:{orderId:'order-1'}}),{code:'permission-denied'})
})


test('reply suggestions read owner-scoped Graph text, never attachments or client-supplied mail', async () => {
  const paths = []
  let seen
  const f = fixture({ fetch: async url => { paths.push(url); return response({ subject: 'Eingang', body: { contentType: 'text', content: 'Nur dieser Servertext' } }) }, generateReplySuggestion: async input => { seen = input; return 'Vielen Dank für Ihre Nachricht.' } })
  const result = await f.handlers.suggestMailboxReply(request({ messageId: 'message-1', instruction: 'Kürzer', currentReply: 'Mein Text', previousSuggestion: 'Alt', body: 'Client Fälschung' }))
  assert.equal(result.suggestion, 'Vielen Dank für Ihre Nachricht.')
  assert.equal(seen.mail.body.content, 'Nur dieser Servertext')
  assert.equal(seen.input.currentReply, 'Mein Text')
  assert.equal(seen.input.instruction, 'Kürzer')
  assert.equal(paths.length, 1)
  assert.ok(!paths[0].includes('attachments'))
  assert.equal((await f.handlers.getMailboxDraft(request({ messageId: 'message-1' }))).draft, null)
  await assert.rejects(f.handlers.suggestMailboxReply({ auth: { uid: 'other' }, data: { connectionId, messageId: 'message-1' } }), { code: 'permission-denied' })
  const viewer = fixture({ requireProfile: async () => ({ ...profile, permissions: { mailboxes: 'view' } }) })
  await assert.rejects(viewer.handlers.suggestMailboxReply(request({ messageId: '1' })), { code: 'permission-denied' })
})

test('reply quota counts attempts across mailboxes, expires after one hour, and releases failed locks', async () => {
  let clock = 1000
  let fail = true
  const f = fixture({ now: () => clock, fetch: async () => response({}), generateReplySuggestion: async () => { if (fail) throw new Error('Provider down'); return 'Antwort' } })
  await assert.rejects(f.handlers.suggestMailboxReply(request({ messageId: '1' })))
  fail = false
  for (let i = 0; i < 19; i++) await f.handlers.suggestMailboxReply(request({ messageId: '1' }))
  await assert.rejects(f.handlers.suggestMailboxReply(request({ messageId: '2' })), { code: 'resource-exhausted' })
  clock += 3600001
  // Keep the fixture token valid when advancing the quota clock.
  f.deps.secrets.read = async () => ({ accessToken: 'test', expiresAt: clock + 1000000 })
  assert.equal((await f.handlers.suggestMailboxReply(request({ messageId: '1' }))).suggestion, 'Antwort')
})

test('one generation per mail and no late result after sending', async () => {
  let complete
  let entered
  const ready = new Promise(resolve => { entered = resolve })
  const f = fixture({ fetch: async () => response({}), generateReplySuggestion: async () => { entered(); return new Promise(resolve => { complete = resolve }) } })
  const running = f.handlers.suggestMailboxReply(request({ messageId: '1' }))
  await ready
  await assert.rejects(f.handlers.suggestMailboxReply(request({ messageId: '1' })), { code: 'already-exists' })
  f.db.records.set(`mailboxDrafts/${hash(`owner|${connectionId}|1`)}`, { operationId: 'sent' })
  complete('Antwort')
  await assert.rejects(running, { code: 'aborted' })
  assert.equal(Object.keys(f.db.records.get(`mailboxReplyQuotas/${hash('owner')}`).running).length, 0)
  await assert.rejects(f.handlers.suggestMailboxReply(request({ messageId: '1' })), { code: 'failed-precondition' })
})

test('suggestions persist with versioned drafts and clear only after an accepted send', async () => {
  const f = fixture()
  const saved = await f.handlers.saveMailboxDraft(request({ messageId: 'message-1', draft: { ...draft, revision: 0, suggestion: 'Vorschlag', suggestionInstruction: 'Locker' } }))
  assert.equal(saved.draft.suggestion, 'Vorschlag')
  assert.equal((await f.handlers.getMailboxDraft(request({ messageId: 'message-1' }))).draft.suggestionInstruction, 'Locker')
  await assert.rejects(f.handlers.saveMailboxDraft(request({ messageId: 'message-1', draft: { ...draft, revision: 1, suggestionInstruction: 'x'.repeat(1001) } })), { code: 'invalid-argument' })
  await f.handlers.sendMailboxReply(request({ ...reply, revision: 1, suggestion: 'Vorschlag', suggestionInstruction: 'Locker' }))
  const loaded = (await f.handlers.getMailboxDraft(request({ messageId: 'message-1' }))).draft
  assert.equal(loaded.body, '')
  assert.equal(loaded.suggestion, '')
  assert.equal(loaded.suggestionInstruction, '')
  assert.equal(loaded.sendStatus, 'accepted')
})


test('revoked mailbox connection suppresses a pending suggestion and releases its lock', async () => {
  let complete, entered
  const ready = new Promise(resolve => { entered = resolve })
  const f = fixture({ fetch: async () => response({}), generateReplySuggestion: async () => { entered(); return new Promise(resolve => { complete = resolve }) } })
  const running = f.handlers.suggestMailboxReply(request({ messageId: '1' }))
  await ready
  await f.db.doc(`mailboxConnections/${connectionId}`).update({ status: 'disconnecting' })
  complete('Antwort')
  await assert.rejects(running)
  assert.equal(Object.keys(f.db.records.get(`mailboxReplyQuotas/${hash('owner')}`).running).length, 0)
})

test('knowledge-backed suggestions preserve server provenance across draft save and reload, but not after manual changes or revoked access', async () => {
  let currentProfile = { ...profile, permissions: { mailboxes: 'edit', handbook: 'view' } }
  const sources = [{ kind: 'article', id: 'article', revision: 2, title: 'Artikel' }]
  const f = fixture({ requireProfile: async () => currentProfile, fetch: async () => response({ id: 'mail-knowledge', body: { contentType: 'text', content: 'Servertext' } }), loadReplyKnowledge: async () => ({ articles: [], rules: [], gaps: [] }), selectReplyKnowledge: async () => ({ sources, coverage: 'full' }), generateReplySuggestion: async () => 'Geprüfter Entwurf' })
  f.db.records.set('users/owner', currentProfile)
  f.db.records.set('knowledgeArticles/article', { status: 'valid', revision: 2 })
  const result = await f.handlers.suggestMailboxReply(request({ messageId: 'mail-knowledge' }))
  assert.equal(result.knowledge.status, 'grounded')
  assert.deepEqual(result.knowledge.sources, sources)
  assert.equal((await f.handlers.getMailboxDraft(request({ messageId: 'mail-knowledge' }))).draft, null)
  await f.handlers.saveMailboxDraft(request({ messageId: 'mail-knowledge', draft: { ...draft, revision: 0, suggestion: result.suggestion, suggestionKnowledge: { sources: ['forged'] } } }))
  assert.deepEqual((await f.handlers.getMailboxDraft(request({ messageId: 'mail-knowledge' }))).draft.suggestionKnowledge, result.knowledge)
  currentProfile = profile
  assert.equal((await f.handlers.getMailboxDraft(request({ messageId: 'mail-knowledge' }))).draft.suggestionKnowledge, undefined)
  currentProfile = { ...profile, permissions: { mailboxes: 'edit', handbook: 'view' } }
  await f.handlers.saveMailboxDraft(request({ messageId: 'mail-knowledge', draft: { ...draft, revision: 1, suggestion: 'Manuell verändert' } }))
  assert.equal((await f.handlers.getMailboxDraft(request({ messageId: 'mail-knowledge' }))).draft.suggestionKnowledge, undefined)
})

test('concurrent knowledge archival and permission revocation prevent late grounded replies', async () => {
  for (const revoke of ['knowledge', 'profile']) {
    const knowledgeProfile = { ...profile, permissions: { mailboxes: 'edit', handbook: 'view' } }
    let f
    f = fixture({ requireProfile: async () => knowledgeProfile, fetch: async () => response({ body: { contentType: 'text', content: 'Servertext' } }), loadReplyKnowledge: async () => ({}), selectReplyKnowledge: async () => ({ sources: [{ kind: 'article', id: 'article', revision: 1, title: 'Artikel' }], coverage: 'full' }), generateReplySuggestion: async () => {
      if (revoke === 'knowledge') f.db.records.set('knowledgeArticles/article', { status: 'archived', revision: 2 })
      else f.db.records.set('users/owner', { ...knowledgeProfile, active: false })
      return 'Nicht veröffentlichen'
    } })
    f.db.records.set('users/owner', knowledgeProfile)
    f.db.records.set('knowledgeArticles/article', { status: 'valid', revision: 1 })
    await assert.rejects(f.handlers.suggestMailboxReply(request({ messageId: 'late-result' })), { code: revoke === 'knowledge' ? 'aborted' : 'permission-denied' })
    assert.equal([...f.db.records.values()].some(value => value.lastSuggestion), false)
  }
})

test('knowledge retrieval failures are technical errors and never missing-knowledge events', async () => {
  let recorded = false, generated = false
  const f = fixture({ fetch: async () => response({}), loadReplyKnowledge: async () => { throw new Error('Firestore unavailable') }, recordReplyKnowledgeGap: async () => { recorded = true }, generateReplySuggestion: async () => { generated = true; return 'Antwort' } })
  await assert.rejects(f.handlers.suggestMailboxReply(request({ messageId: 'failed-search' })), { code: 'unavailable' })
  assert.equal(recorded, false)
  assert.equal(generated, false)
})


const sharedEmail = 'rechnung@brennpunkt-logistik.de'
const sharedId = hash(`owner|b829bbdc-c0b7-4128-a341-6715a67b451b|shared|${connectionId}|${sharedEmail}`)
function sharedFixture(overrides = {}) {
  const f = fixture(overrides)
  Object.assign(f.db.records.get(`mailboxConnections/${connectionId}`), { email: config.testAccount, kind: 'personal', sharedAccess: true })
  f.db.records.set(`mailboxConnections/${sharedId}`, { ownerId: 'owner', kind: 'shared', parentConnectionId: connectionId, graphUserId: sharedEmail, email: sharedEmail, status: 'connected', customName: 'Rechnungen' })
  return f
}
const sharedRequest = data => request({ connectionId: sharedId, ...data })

test('shared mailbox addition checks real delegate access before persisting and never copies personal credentials', async () => {
  let denied = true
  const calls = []
  const f = fixture({ fetch: async (url, options) => { calls.push({url,options}); return denied ? response({}, 403) : response({ id: 'inbox' }) } })
  Object.assign(f.db.records.get(`mailboxConnections/${connectionId}`), { email: config.testAccount, sharedAccess: true })
  await assert.rejects(f.handlers.addSharedMailbox(request({ email: sharedEmail })), { code: 'permission-denied' })
  assert.equal(f.db.records.has(`mailboxConnections/${sharedId}`), false)
  denied = false
  const added = await f.handlers.addSharedMailbox(request({ email: sharedEmail.toUpperCase(), customName: ' Rechnungen ' }))
  assert.equal(added.connectionId, sharedId)
  const child = f.db.records.get(`mailboxConnections/${sharedId}`)
  assert.equal(child.parentConnectionId, connectionId)
  assert.equal(child.secretName, undefined)
  assert.equal(child.secretVersion, undefined)
  assert.equal(child.customName, 'Rechnungen')
  assert.ok(calls.every(call => call.url === `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sharedEmail)}/mailFolders/inbox/messages?$top=1&$select=id` && call.options.headers.Authorization === 'Bearer private-access-token'))
  await f.handlers.addSharedMailbox(request({ email: sharedEmail }))
  assert.equal(f.db.records.get(`mailboxConnections/${sharedId}`).customName, 'Rechnungen')
  const listed = await f.handlers.listMailboxConnections(request({}))
  assert.equal(listed.connections.length, 2)
  assert.equal(listed.connections.find(item => item.id === sharedId).parentEmail, config.testAccount)
  assert.equal(JSON.stringify(listed).includes('secret'), false)
})

test('shared addition rejects foreign owners, nested sharing, missing consent and personal mailbox duplicates', async () => {
  const f = sharedFixture()
  await assert.rejects(f.handlers.addSharedMailbox({ auth: { uid: 'other' }, data: { connectionId, email: sharedEmail } }), { code: 'permission-denied' })
  await assert.rejects(f.handlers.addSharedMailbox(sharedRequest({ email: 'next@example.com' })), { code: 'invalid-argument' })
  await assert.rejects(f.handlers.addSharedMailbox(request({ email: config.testAccount })), { code: 'invalid-argument' })
  await assert.rejects(f.handlers.addSharedMailbox(request({ email: '../me/messages' })), { code: 'invalid-argument' })
  Object.assign(f.db.records.get(`mailboxConnections/${connectionId}`), { sharedAccess: false })
  await assert.rejects(f.handlers.addSharedMailbox(request({ email: sharedEmail })), { code: 'failed-precondition' })
  assert.equal(f.fetchCount(), 0)
})

test('shared reads, attachments and suggestions use only the stored target, even with injected client routing', async () => {
  const paths = []
  const f = sharedFixture({ fetch: async url => { paths.push(url); return response(url.includes('/attachments/') ? { '@odata.type': '#microsoft.graph.fileAttachment', name: 'Beleg.pdf', size: 2, contentBytes: 'e30=' } : url.includes('/attachments?') ? { value: [] } : url.includes('/mailFolders/') ? { value: [] } : { subject: 'Shared', body: { contentType: 'text', content: 'Shared inbox text' } }) }, generateReplySuggestion: async ({mail}) => { assert.equal(mail.body.content, 'Shared inbox text'); return 'Vielen Dank.' } })
  const data = { messageId: 'shared-message', email: 'foreign@example.com', graphUserId: 'attacker', attachmentId: 'attachment' }
  await f.handlers.listMailboxMessages(sharedRequest(data))
  await f.handlers.getMailboxMessage(sharedRequest(data))
  await f.handlers.getMailboxAttachment(sharedRequest(data))
  await f.handlers.suggestMailboxReply(sharedRequest(data))
  assert.ok(paths.length >= 5)
  assert.ok(paths.every(path => path.startsWith(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sharedEmail)}/`)))
  await assert.rejects(f.handlers.getMailboxMessage({ auth: { uid: 'other' }, data: { connectionId: sharedId, messageId: '1' } }), { code: 'permission-denied' })
})

test('shared replies set the actual sender from the stored mailbox and retain internal recipient restrictions', async () => {
  const sent = []
  const f = sharedFixture({ fetch: async (url, options) => { sent.push({url,body:JSON.parse(options.body)}); return response(null, 202) } })
  await f.handlers.sendMailboxReply(sharedRequest({ ...reply, from: 'attacker@example.com' }))
  assert.equal(sent.length, 1)
  assert.ok(sent[0].url.includes(`/users/${encodeURIComponent(sharedEmail)}/messages/`))
  assert.equal(sent[0].body.message.from.emailAddress.address, sharedEmail)
  assert.equal(f.db.records.get(`mailboxConnections/${connectionId}`).status, 'connected')
  const blocked = sharedFixture()
  await assert.rejects(blocked.handlers.sendMailboxReply(sharedRequest({ ...reply, toRecipients: ['outside@example.com'] })), { code: 'permission-denied' })
  assert.equal(blocked.fetchCount(), 0)
})

test('shared pagination rejects personal and foreign mailbox links but supports its stored target', () => {
  const target = {kind:'shared',email:sharedEmail,graphUserId:sharedEmail}
  assert.ok(mailboxMessagePagePath(`https://graph.microsoft.com/v1.0/users('${sharedEmail}')/mailFolders('inbox')/messages?$skip=30`, target))
  assert.throws(() => mailboxMessagePagePath('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=30', target), {code:'unavailable'})
  assert.throws(() => mailboxMessagePagePath('https://graph.microsoft.com/v1.0/users/other@example.com/mailFolders/inbox/messages?$skip=30', target), {code:'unavailable'})
})

test('shared disconnect never deletes the parent credential; personal disconnect invalidates all its children', async () => {
  const removed = []
  const f = sharedFixture({ secrets: { remove: async name => removed.push(name) } })
  await f.handlers.disconnectMailbox(sharedRequest({}))
  assert.deepEqual(removed, [])
  assert.equal(f.db.records.get(`mailboxConnections/${connectionId}`).status, 'connected')
  await f.db.doc(`mailboxConnections/${sharedId}`).update({status:'connected'})
  await f.handlers.disconnectMailbox(request({}))
  assert.deepEqual(removed, ['test'])
  assert.equal(f.db.records.get(`mailboxConnections/${sharedId}`).status, 'disconnected')
  await assert.rejects(f.handlers.listMailboxMessages(sharedRequest({})))
  assert.equal((await f.handlers.listMailboxConnections(request({}))).connections.length, 0)
})

test('shared token refresh rotates only the parent secret and reuses it for replies', async () => {
  const writes = [], destroyed = [], paths = []
  const f = sharedFixture({ secrets: {read:async version=>{assert.equal(version,'test/version');return {refreshToken:'refresh',expiresAt:0}},write:async(name,value)=>{writes.push({name,value});return 'test/v2'},destroy:async value=>destroyed.push(value)}, fetch:async url=>{paths.push(url);return url.includes('/token')?response({access_token:'renewed',refresh_token:'renewed-refresh',scope:'User.Read Mail.Read Mail.Send Mail.Read.Shared Mail.Send.Shared'}):response(null,202)} })
  assert.equal((await f.handlers.sendMailboxReply(sharedRequest(reply))).status, 'accepted')
  assert.equal(writes[0].name, 'test')
  assert.equal(writes.length, 1)
  assert.deepEqual(destroyed,['test/version'])
  assert.equal(f.db.records.get(`mailboxConnections/${connectionId}`).secretVersion,'test/v2')
  assert.equal(f.db.records.get(`mailboxConnections/${sharedId}`).secretVersion,undefined)
  assert.ok(paths[1].includes(`/users/${encodeURIComponent(sharedEmail)}/messages/`))
})

test('a disconnected parent blocks shared access without any Graph call, and addition revalidates the parent', async () => {
  const f = sharedFixture()
  await f.db.doc(`mailboxConnections/${connectionId}`).update({status:'disconnecting'})
  await assert.rejects(f.handlers.listMailboxMessages(sharedRequest({})), {code:'failed-precondition'})
  assert.equal(f.fetchCount(),0)
  const changed = sharedFixture({fetch:async()=>{await changed.db.doc(`mailboxConnections/${connectionId}`).update({status:'disconnecting'});return response({id:'inbox'})}})
  changed.db.records.delete(`mailboxConnections/${sharedId}`)
  await assert.rejects(changed.handlers.addSharedMailbox(request({email:sharedEmail})),{code:'aborted'})
  assert.equal(changed.db.records.has(`mailboxConnections/${sharedId}`),false)
})

test('suggestions and drafts never create learning cases; capture requires the separate SentItems opt-in', async () => {
  const evidenceProfile = { ...profile, permissions: { mailboxes: 'edit', handbook: 'view' } }
  const selection = { sources: [], coverage: 'none', limited: false, gap: { existingGapId: '', intentKey: 'invoice_mismatch', missingAspect: 'response' } }
  const f = fixture({ requireProfile: async () => evidenceProfile, fetch: async (_url, options) => options.method === 'POST' ? response(null, 202) : response({ id: 'evidence-mail', body: { contentType: 'text', content: 'PRIVATE incoming original mail' } }), loadReplyKnowledge: async () => ({ articles: [], rules: [], gaps: [], limited: false }), selectReplyKnowledge: async () => selection, generateReplySuggestion: async () => 'KI Antwortentwurf' })
  f.db.records.set('users/owner', evidenceProfile)
  const generated = await f.handlers.suggestMailboxReply(request({ messageId: 'evidence-mail' }))
  assert.deepEqual(generated, { suggestion: 'KI Antwortentwurf', knowledge: { sources: [] } })
  await f.handlers.saveMailboxDraft(request({ messageId: 'evidence-mail', draft: { ...draft, revision: 0, suggestion: '' } }))
  const loaded = await f.handlers.getMailboxDraft(request({ messageId: 'evidence-mail' }))
  assert.equal(JSON.stringify(loaded).includes('gap'), false)
  assert.equal((await f.handlers.sendMailboxReply(request({ ...reply, messageId: 'evidence-mail', revision: 1 }))).status, 'accepted')
  assert.equal([...f.db.records.keys()].some(key => key.startsWith('knowledgeGap')), false)
})

test('uncertain sends do not add attempted answers to the learning collection', async () => {
  const evidenceId = 'e'.repeat(64)
  const f = fixture({ fetch: async () => { throw new Error('Network loss') } })
  const root = `mailboxDrafts/${hash(`owner|${connectionId}|message-1`)}`
  f.db.records.set(root, { ownerId: 'owner', connectionId, draft: { ...draft, revision: 0 }, knowledgeEvidenceId: evidenceId })
  f.db.records.set(`knowledgeGapEvidence/${evidenceId}`, { gapId: 'gap', latestSuggestion: 'Vorschlag', sendStatus: 'draft' })
  const sent = await f.handlers.sendMailboxReply(request(reply))
  assert.equal(sent.status, 'unknown')
  const evidence = f.db.records.get(`knowledgeGapEvidence/${evidenceId}`)
  assert.equal(evidence.sentReply, undefined)
  assert.equal(evidence.sendStatus, 'draft')
  assert.equal(evidence.sentAt, undefined)
  assert.equal(evidence.latestSuggestion, 'Vorschlag')
})

test('failure acknowledging evidence after Graph acceptance cannot change accepted send or cause another POST', async () => {
  const evidenceId = 'f'.repeat(64)
  const f = fixture()
  const root = `mailboxDrafts/${hash(`owner|${connectionId}|message-1`)}`
  f.db.records.set(root, { ownerId: 'owner', connectionId, draft: { ...draft, revision: 0 }, knowledgeEvidenceId: evidenceId })
  f.db.records.set(`knowledgeGapEvidence/${evidenceId}`, { gapId: 'gap', latestSuggestion: 'Vorschlag', sendStatus: 'draft' })
  const originalTransaction = f.db.runTransaction
  f.db.runTransaction = callback => originalTransaction(tx => callback({ ...tx, set: (ref, value, options) => {
    if (ref.path === `knowledgeGapEvidence/${evidenceId}` && value.sendStatus === 'accepted') throw new Error('Evidence temporarily unavailable')
    return tx.set(ref, value, options)
  } }))
  assert.equal((await f.handlers.sendMailboxReply(request(reply))).status, 'accepted')
  assert.equal((await f.handlers.sendMailboxReply(request(reply))).status, 'accepted')
  assert.equal(f.fetchCount(), 1)
  assert.equal(f.db.records.get(`mailboxSendOperations/${hash(`owner|${reply.operationId}`)}`).status, 'accepted')
})


test('reply lookup is owner-scoped and all batch subrequests use the shared mailbox stored on the server', async () => {
  const paths = []
  const f = sharedFixture({ fetch: async (url, options) => {
    assert.ok(url.endsWith('/$batch'))
    const requests = JSON.parse(options.body).requests
    paths.push(...requests.map(item => item.url))
    return response({ responses: requests.map(item => ({ id: item.id, status: 200, body: item.url.includes('internetMessageHeaders') ? {id:'sent',internetMessageId:'<sent>',sentDateTime:'2026-10-31T10:00:00Z',internetMessageHeaders:[{name:'In-Reply-To',value:'<source>'}]} : item.url.includes('sentitems') ? {value:[{id:'sent'}]} : {id:'source',internetMessageId:'<source>',conversationId:'c',receivedDateTime:'2026-10-31T09:00:00Z'} })) })
  } })
  const result = await f.handlers.listMailboxReplies(sharedRequest({messageIds:['source'],base:'/users/attacker'}))
  assert.equal(result.replies.source.length,1)
  assert.ok(paths.every(path=>path.startsWith(`/users/${encodeURIComponent(sharedEmail)}/`)))
  await assert.rejects(f.handlers.listMailboxReplies({auth:{uid:'other'},data:{connectionId:sharedId,messageIds:['source']}}),{code:'permission-denied'})
})

test('sending preserves exact text and does not capture or update legacy draft learning evidence', async () => {
  const evidenceId = 'd'.repeat(64)
  let submitted
  const f = fixture({ fetch: async (_url, options) => { submitted = JSON.parse(options.body).message.body.content; return response(null, 202) } })
  const root = `mailboxDrafts/${hash(`owner|${connectionId}|message-1`)}`
  f.db.records.set(root, { ownerId: 'owner', connectionId, draft: { ...draft, revision: 0 }, knowledgeEvidenceId: evidenceId })
  const previous = { gapId: 'gap', latestSuggestion: 'AI-Entwurf', sendStatus: 'draft', caseRevision: 1, learnedRevision: 1 }
  f.db.records.set(`knowledgeGapEvidence/${evidenceId}`, previous)
  const body = 'Hallo Frau Müller,\nwir prüfen den Auftrag.\n\nMit freundlichen Grüßen\nMax Beispiel'
  assert.equal((await f.handlers.sendMailboxReply(request({ ...reply, body }))).status, 'accepted')
  assert.equal(submitted, body)
  assert.deepEqual(f.db.records.get(`knowledgeGapEvidence/${evidenceId}`), previous)
})

test('webhook adapter reads exactly one owned immutable message and creates a created-only inbox subscription', async () => {
  const calls = []
  const f = fixture({ fetch: async (url, options) => { calls.push({ url, options }); return response({ id: 'immutable-id', body: { contentType: 'text', content: 'Ankunft 18 Uhr' } }) } })
  await f.handlers.recommendationGraph({ connectionId, operation: 'message', messageId: 'immutable-id' })
  assert.ok(calls[0].url.includes('/me/messages/immutable-id?'))
  assert.ok(calls[0].options.headers.Prefer.includes('ImmutableId'))
  assert.equal(calls[0].options.method, undefined)
  await f.handlers.recommendationGraph({ connectionId, operation: 'create', data: { changeType: 'created' } })
  assert.equal(JSON.parse(calls[1].options.body).resource, "/me/mailFolders('inbox')/messages")
  assert.ok(calls.every(call => !call.url.includes('/inbox/messages?') && !call.url.includes('attachments')))
  await assert.rejects(f.handlers.recommendationGraph({ connectionId, operation: 'list-inbox' }), { code: 'invalid-argument' })
})

test('recommendation attachment reads stay on the notified message and reject inline or oversized file bodies', async () => {
  const calls = []
  const f = fixture({ fetch: async (url, options) => {
    calls.push({ url, options })
    if (url.includes('/attachments?')) return response({ value: [] })
    return response({ '@odata.type': '#microsoft.graph.fileAttachment', name: 'Test.pdf', contentType: 'application/pdf', contentBytes: Buffer.from('%PDF-1.4 test').toString('base64') })
  } })
  await f.handlers.recommendationGraph({ connectionId, operation: 'attachment-list', messageId: 'message/one' })
  const file = await f.handlers.recommendationGraph({ connectionId, operation: 'attachment', messageId: 'message/one', attachmentId: 'attachment/two' })
  assert.match(calls[0].url, /messages\/message%2Fone\/attachments\?\$select=id,name,contentType,size,isInline&\$top=20$/)
  assert.match(calls[1].url, /messages\/message%2Fone\/attachments\/attachment%2Ftwo$/)
  assert.equal(file.name, 'Test.pdf')
  assert.ok(calls.every(call => !call.url.includes('inbox/messages') && !call.url.includes('delta')))
  for (const invalid of [{ '@odata.type': '#microsoft.graph.itemAttachment', contentBytes: 'YQ==' }, { '@odata.type': '#microsoft.graph.fileAttachment', isInline: true, contentBytes: 'YQ==' }, { '@odata.type': '#microsoft.graph.fileAttachment', contentBytes: 'not base64' }, { '@odata.type': '#microsoft.graph.fileAttachment', contentBytes: 'YQ=='.repeat(2 * 1024 * 1024) }]) {
    const g = fixture({ fetch: async () => response(invalid) })
    await assert.rejects(g.handlers.recommendationGraph({ connectionId, operation: 'attachment', messageId: 'message', attachmentId: 'file' }), { code: 'failed-precondition' })
  }
})

test('shared mailbox identity is resolved from the actual inbox, never a client label or alias', async () => {
  const f = fixture({ fetch: async url => { assert.ok(url.endsWith('/me/mailFolders/inbox?$select=id')); return response({ id: 'same-physical-inbox' }) } })
  assert.equal(await f.handlers.resolveRecommendationMailboxIdentity(connectionId), 'same-physical-inbox')
  assert.equal(f.db.records.get(`mailboxConnections/${connectionId}`).canonicalMailboxId, 'same-physical-inbox')
})

test('functional mailbox direct sign-in uses scoped app authentication for automatic recommendations only', async () => {
  const calls = [], email = 'buchhaltung@brennpunkt-logistik.de'
  const f = fixture({ fetch: async (url, options) => {
    calls.push({ url, options })
    if (url.includes('/oauth2/v2.0/token')) {
      assert.equal(options.body.get('grant_type'), 'client_credentials')
      return response({ access_token: 'synthetic-scoped-app-token', expires_in: 3600 })
    }
    assert.equal(options.headers.Authorization, 'Bearer synthetic-scoped-app-token')
    return response({ id: 'message' })
  } })
  Object.assign(f.db.records.get(`mailboxConnections/${connectionId}`), { kind: 'personal', email })
  await f.handlers.recommendationGraph({ connectionId, operation: 'create', data: { changeType: 'created' } })
  const request = JSON.parse(calls[1].options.body)
  assert.equal(request.resource, `/users/${encodeURIComponent(email)}/mailFolders('inbox')/messages`)
  await f.handlers.recommendationGraph({ connectionId, operation: 'message', messageId: 'message' })
  assert.ok(calls[2].url.includes(`/users/${encodeURIComponent(email)}/messages/message?`))
  assert.equal(calls.filter(call => call.url.includes('/token')).length, 1)
})
