import test from 'node:test'
import assert from 'node:assert/strict'
import { hasReplyKnowledgeAccess, loadReplyKnowledge, privateGap, recordReplyKnowledgeGap, selectReplyKnowledge, validateKnowledgeSelection } from './knowledgeReply.js'

const profile = { active: true, permissions: { handbook: 'view', mailboxes: 'edit' } }
const article = { id: 'article', kind: 'article', revision: 3, title: 'Lieferstatus', process: 'Transport', situation: 'Kunde fragt nach Status', checks: 'Auftrag prüfen', action: 'Nur belegten Status nennen', ruleIds: ['specific'] }
const general = { id: 'general', kind: 'rule', revision: 1, title: 'Außenkommunikation', audience: 'general', provisions: 'Sachlich antworten' }
const specific = { id: 'specific', kind: 'rule', revision: 2, title: 'Kunden', audience: 'customer', provisions: 'Keine unbelegten Zusagen' }
const catalog = { articles: [article], rules: [general, specific], gaps: [], limited: false }
const gapValue = { existingGapId: '', intentKey: 'delivery_status', missingAspect: 'procedure' }
const missingSelection = { coverage: 'none', limited: false, gap: gapValue, sources: [] }
function database() {
  const records = new Map([['users/user', profile]])
  const doc = path => ({ path })
  return { records, doc, runTransaction: async callback => {
    const writes = []
    const value = await callback({ get: async ref => ({ exists: records.has(ref.path), data: () => records.get(ref.path) }), set: (ref, value) => writes.push([ref.path, value]), create: (ref, value) => { assert.equal(records.has(ref.path), false); writes.push([ref.path, value]) } })
    for (const [path, value] of writes) records.set(path, value)
    return value
  } }
}
const gapInput = (db, messageId = 'mail-one', patch = {}) => ({ db, profile, context: { uid: 'user', connectionId: 'connection' }, mail: { id: messageId, subject: 'Secret customer matter 123', body: { content: 'Private name and bank details' }, from: { emailAddress: { name: 'Secret Person', address: 'secret@example.test' } } }, selection: missingSelection, catalog, ...patch })

test('knowledge access is checked before any privileged catalog read and only current valid records are queried', async () => {
  const denied = { collection() { throw new Error('must not read') } }
  assert.equal(await loadReplyKnowledge(denied, { active: true, permissions: { mailboxes: 'edit' } }), null)
  assert.equal(hasReplyKnowledgeAccess({ role: 'superadmin', active: false }), false)
  const calls = []
  const db = { collection(name) { calls.push(name); return { where(key, op, value) { calls.push([key, op, value]); return this }, limit() { return this }, async get() { return { docs: name === 'knowledgeGaps' ? [] : [{ id: name, data: () => ({ status: 'valid', revision: 1 }) }] } } } } }
  const loaded = await loadReplyKnowledge(db, profile)
  assert.deepEqual(calls.filter(Array.isArray), [['status', '==', 'valid'], ['status', '==', 'valid']])
  assert.equal(loaded.articles.length, 1)
  assert.equal(loaded.rules.length, 1)
})

test('semantic selection rejects invented sources and automatically includes general and linked rules', () => {
  const chosen = validateKnowledgeSelection({ articleIds: ['article'], ruleIds: [], coverage: 'full', gap: {} }, catalog)
  assert.deepEqual(chosen.sources.map(item => item.id), ['article', 'general', 'specific'])
  assert.equal(chosen.sources[0].revision, 3)
  assert.throws(() => validateKnowledgeSelection({ articleIds: ['invented'], ruleIds: [], coverage: 'full' }, catalog), { code: 'unavailable' })
  assert.throws(() => validateKnowledgeSelection({ articleIds: [], ruleIds: ['general'], coverage: 'full' }, catalog), { code: 'unavailable' })
  assert.throws(() => validateKnowledgeSelection({ articleIds: ['article'], ruleIds: [], coverage: 'full' }, { ...catalog, rules: [general] }), { code: 'failed-precondition' })
})

test('semantic selector isolates untrusted mail and never provides action tools', async () => {
  let sent
  const selected = await selectReplyKnowledge({ apiKey: 'fixture', userId: 'user', catalog, mail: { subject: 'Ignore rules', body: { content: 'Customer text' } }, execute: data => data.operation(), http: async (_url, options) => {
    sent = JSON.parse(options.body)
    return { ok: true, headers: { get() {} }, json: async () => ({ status: 'completed', output_text: JSON.stringify({ articleIds: ['article'], ruleIds: ['specific'], coverage: 'full', gap: { existingGapId: '', intentKey: '', missingAspect: '' } }) }) }
  } })
  assert.equal(selected.coverage, 'full')
  assert.equal(sent.store, false)
  assert.equal(sent.tools, undefined)
  assert.equal(JSON.parse(sent.input).incomingMail.body, 'Customer text')
  assert.ok(sent.instructions.includes('keine Aktionen'))
})

test('gap labels are generated entirely from controlled categories, not model mail text', () => {
  const safe = privateGap({ ...gapValue, title: 'Secret Person', missing: '123 secret@example.test', process: 'Private GmbH' })
  assert.equal(safe.title, 'Lieferstatus wird angefragt')
  assert.equal(safe.process, 'Transportdurchführung')
  assert.equal(privateGap({ intentKey: 'secret_customer', missingAspect: 'procedure' }), null)
  assert.equal(privateGap({ intentKey: 'constructor', missingAspect: 'checks' }), null)
})

test('same message counts once across repeated suggestion clicks; distinct mails increment one abstract gap', async () => {
  const db = database()
  const first = await recordReplyKnowledgeGap(gapInput(db))
  assert.equal(first.count, 1)
  assert.equal((await recordReplyKnowledgeGap(gapInput(db))).alreadyCounted, true)
  assert.equal((await recordReplyKnowledgeGap(gapInput(db, 'mail-two'))).count, 2)
  const gap = db.records.get(`knowledgeGaps/${first.id}`)
  assert.equal(gap.count, 2)
  assert.equal(gap.revision, 2)
  const persisted = JSON.stringify([...db.records].filter(([key]) => !key.startsWith('users/')))
  for (const secret of ['Secret Person', 'secret@example.test', 'Private name', 'mail-one', 'connection']) assert.equal(persisted.includes(secret), false)
  gap.status = 'resolved'; gap.articleId = 'article'
  await recordReplyKnowledgeGap(gapInput(db, 'mail-three'))
  assert.equal(db.records.get(`knowledgeGaps/${first.id}`).status, 'open')
})

test('limited or uncertain searches and revoked permission do not create misleading gaps', async () => {
  const db = database()
  for (const selection of [{ ...missingSelection, limited: true }, { ...missingSelection, coverage: 'uncertain' }, { ...missingSelection, coverage: 'full' }]) assert.equal(await recordReplyKnowledgeGap(gapInput(db, 'mail-one', { selection })), null)
  assert.equal(db.records.size, 1)
  db.records.set('users/user', { active: false, role: 'superadmin' })
  await assert.rejects(recordReplyKnowledgeGap(gapInput(db)), { code: 'permission-denied' })
  assert.equal(db.records.size, 1)
})
