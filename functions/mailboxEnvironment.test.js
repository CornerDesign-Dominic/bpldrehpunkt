import test from 'node:test'
import assert from 'node:assert/strict'
import { assertMailboxEnvironment, assertMailboxOAuthConfiguration, developmentMailboxClientId, resolveMailboxClientId, recommendationWebhookUrl } from './mailboxEnvironment.js'

const production = 'db-bpl-drehpunkt', development = 'db-bpl-drehpunkt-dev'
const client = '11111111-2222-4333-8444-555555555555'

test('production requires an explicit distinct Microsoft client; Dev retains its existing identity', () => {
  assert.equal(resolveMailboxClientId(development), developmentMailboxClientId)
  assert.equal(resolveMailboxClientId(production, client), client)
  for (const value of ['', developmentMailboxClientId, developmentMailboxClientId.toUpperCase(), 'not-a-client-id']) {
    assert.throws(() => resolveMailboxClientId(production, value), { code: 'failed-precondition' })
  }
  assert.throws(() => assertMailboxEnvironment('foreign-project'), { code: 'failed-precondition' })
})

test('webhook callback is generated from the verified server project and never falls back to Dev', () => {
  assert.equal(recommendationWebhookUrl(production), 'https://europe-west3-db-bpl-drehpunkt.cloudfunctions.net/mailboxRecommendationWebhook')
  assert.equal(recommendationWebhookUrl(development), 'https://europe-west3-db-bpl-drehpunkt-dev.cloudfunctions.net/mailboxRecommendationWebhook')
  assert.throws(() => recommendationWebhookUrl('foreign-project'), { code: 'failed-precondition' })
})

test('production OAuth rejects Dev callbacks and origins, credentials and insecure URLs', () => {
  const config = { project: production, origin: 'https://bpldrehpunkt.vercel.app', redirect: 'https://europe-west3-db-bpl-drehpunkt.cloudfunctions.net/mailboxOAuthCallback' }
  assert.doesNotThrow(() => assertMailboxOAuthConfiguration(config))
  for (const origin of ['https://dev.drehpunktlogistik.de', 'https://bpldrehpunkt.vercel.app/path', 'http://bpldrehpunkt.vercel.app', 'https://user:password@example.org']) {
    assert.throws(() => assertMailboxOAuthConfiguration({ ...config, origin }), { code: 'failed-precondition' })
  }
  assert.throws(() => assertMailboxOAuthConfiguration({ ...config, redirect: 'https://europe-west3-db-bpl-drehpunkt-dev.cloudfunctions.net/mailboxOAuthCallback' }), { code: 'failed-precondition' })
})
