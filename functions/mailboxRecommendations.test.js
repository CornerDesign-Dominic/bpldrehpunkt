import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyRecommendation, recommendationKinds, recommendationScope, createRecommendationHandlers, freshRecommendation } from './mailboxRecommendations.js'

test('shared identity ignores the delegate; personal consent remains owner scoped', () => {
  const shared = { tenantId: 'tenant', email: 'Team@Example.org', kind: 'shared', canonicalMailboxId: 'shared-folder', ownerId: 'one' }
  assert.equal(recommendationScope(shared), recommendationScope({ ...shared, ownerId: 'two', parentConnectionId: 'other', email: 'alias@example.org' }))
  const personal = { ...shared, kind: 'personal', graphUserId: 'graph' }
  assert.notEqual(recommendationScope(personal), recommendationScope({ ...personal, ownerId: 'two' }))
  assert.notEqual(recommendationScope(shared), recommendationScope({ ...shared, tenantId: 'another' }))
})
test('only confident allowlisted action kinds survive, with no duplicates', () => {
  assert.deepEqual(recommendationKinds([{ kind: 'tracking', confidence: 'high' }, { kind: 'tracking', confidence: 'high' }, { kind: 'order', confidence: 'medium' }]), ['tracking'])
  assert.throws(() => recommendationKinds([{ kind: 'send', confidence: 'high' }]))
  assert.throws(() => recommendationKinds('tracking'))
})
test('classification sends only bounded subject/newest text; no tools, attachments or business lookups', async () => {
  let body
  const result = await classifyRecommendation({ mail: { subject: 'Ankunft', body: { contentType: 'text', content: 'LKW ist um 18 Uhr angekommen.\n\nOn Friday someone wrote:\nGehe zu Gericht.' }, attachments: [{ content: 'NEVER SENT' }] }, userId: 'user', apiKey: 'synthetic', execute: async ({ operation }) => operation(), http: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    body = JSON.parse(options.body)
    return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify({ actions: [{ kind: 'tracking', confidence: 'high' }] }) }) }
  } })
  assert.deepEqual(result, ['tracking'])
  assert.equal(body.store, false); assert.equal(body.tools, undefined)
  assert.ok(!body.input[0].content[0].text.includes('Gehe zu Gericht'))
  assert.ok(!JSON.stringify(body).includes('NEVER SENT'))
})

test('forwarded submissions include the first forwarded message, with current text kept separate and old reply history excluded', async () => {
  for (const prefix of ['WG:', 'Fw:', 'FWD:']) {
    let input
    const result = await classifyRecommendation({ mail: { subject: `${prefix} 260200713`, body: { contentType: 'text', content: 'Mit freundlichen Grüßen\nTeam\n\nVon: Lieferant <sender@example.invalid>\nGesendet: Heute\nAn: Rechnung <invoice@example.invalid>\nBetreff: 260200713\n\nAnbei unsere Rechnung.\n\nOn Friday someone wrote:\nALTE MAHNUNG' } }, userId: 'user', apiKey: 'synthetic', execute: async ({ operation }) => operation(), http: async (url, options) => {
      input = JSON.parse(JSON.parse(options.body).input[0].content[0].text)
      return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify({ actions: [{ kind: 'invoice', confidence: 'high' }] }) }) }
    } })
    assert.deepEqual(result, ['invoice'])
    assert.match(input.body, /Mit freundlichen/)
    assert.doesNotMatch(input.body, /Anbei/)
    assert.match(input.forwardedMessage, /Anbei unsere Rechnung/)
    assert.doesNotMatch(input.forwardedMessage, /ALTE MAHNUNG/)
  }
})

test('forwarded recommendation input shares the 12000 character budget and explicit current instructions remain present', async () => {
  let input
  await classifyRecommendation({ mail: { subject: 'WG: Rechnung', body: { contentType: 'text', content: 'Nur zur Ablage, keine neue Rechnung.\n' + 'x'.repeat(11000) + '\n\nOn Friday sender wrote:\n' + 'r'.repeat(8000) } }, userId: 'user', apiKey: 'synthetic', execute: async ({ operation }) => operation(), http: async (url, options) => {
    input = JSON.parse(JSON.parse(options.body).input[0].content[0].text)
    return { ok: true, json: async () => ({ status: 'completed', output_text: '{"actions":[]}' }) }
  } })
  assert.match(input.body, /^Nur zur Ablage/)
  assert.equal(input.body.length + input.forwardedMessage.length, 12000)
})

test('a reply to an earlier forward does not reintroduce the forwarded invoice', async () => {
  let input
  await classifyRecommendation({ mail: { subject: 'AW: WG: Rechnung 123', body: { contentType: 'text', content: 'Ist diese Rechnung bereits bezahlt?\n\nOn Friday someone wrote:\nAnbei unsere Rechnung.' } }, userId: 'user', apiKey: 'synthetic', execute: async ({ operation }) => operation(), http: async (url, options) => {
    input = JSON.parse(JSON.parse(options.body).input[0].content[0].text)
    return { ok: true, json: async () => ({ status: 'completed', output_text: '{"actions":[]}' }) }
  } })
  assert.match(input.body, /bereits bezahlt/)
  assert.doesNotMatch(input.body, /Anbei/)
  assert.equal(input.forwardedMessage, undefined)
})
test('truncated or invalid provider responses are failures, not misleading recommendations', async () => {
  for (const payload of [{ status: 'incomplete' }, { status: 'completed', output_text: '{bad' }]) {
    await assert.rejects(classifyRecommendation({ mail: { subject: 'Test' }, userId: 'user', apiKey: 'synthetic', execute: async ({ operation }) => operation(), http: async () => ({ ok: true, json: async () => payload }) }))
  }
})
test('unknown environments are rejected before any database access', async () => {
  const handlers = createRecommendationHandlers({ project: 'foreign-project' })
  await assert.rejects(handlers.maintain(), { code: 'failed-precondition' })
  await assert.rejects(handlers.process({ scopeId: 'a'.repeat(64) }), { code: 'failed-precondition' })
})

test('five minutes is a freshness boundary, never a scan interval', () => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  assert.equal(freshRecommendation(now - 300000, now, now - 600000), true)
  assert.equal(freshRecommendation(now - 300001, now, now - 600000), false)
  assert.equal(freshRecommendation(now - 1000, now, now), false)
  assert.equal(freshRecommendation(now + 61000, now, now - 600000), false)
})
