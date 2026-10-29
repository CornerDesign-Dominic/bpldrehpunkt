import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { constants, generateKeyPairSync, randomUUID, verify } from 'node:crypto'
import test from 'node:test'
import { createDycosClientAssertion, DycosFlowError, fetchDycosFlowOrder, signDycosClientAssertion, validateDycosFlowConfiguration } from './dycosFlowClient.js'

const now = Date.parse('2026-10-29T12:00:00Z')
const audience = 'https://service.flow.microsoft.com/'
function configuration() {
  const tenantId = randomUUID()
  const tenant = tenantId.replaceAll('-', '')
  return { tenantId, clientId: randomUUID(), servicePrincipalId: randomUUID(), certificatePem: 'synthetic-certificate', privateKeyPem: 'synthetic-private-key',
    flowUrl: `https://default${tenant.slice(0, -2)}.${tenant.slice(-2)}.environment.api.powerplatform.com/powerautomate/workflows/example/triggers/manual/paths/invoke?api-version=1`,
  }
}
function token(config, patch = {}) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return { access_token: `${part({ alg: 'test-only' })}.${part({ aud: audience, tid: config.tenantId, oid: config.servicePrincipalId, appid: config.clientId,
    iss: `https://sts.windows.net/${config.tenantId}/`, exp: Math.floor(now / 1000) + 3600, ...patch })}.synthetic-signature`, token_type: 'Bearer', expires_in: 3600 }
}
function json(value, status = 200, headers = {}) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } }) }
function options(config, fetchImpl) { return { config, fetchImpl, now: () => now, assertionFactory: () => 'synthetic-assertion' } }
const rejects = (code, stage) => (error) => error instanceof DycosFlowError && error.code === code && (!stage || error.stage === stage)

test('configuration binds credentials to the approved tenant environment and HTTPS invoke endpoint', () => {
  const config = configuration()
  assert.equal(validateDycosFlowConfiguration(config), config)
  for (const flowUrl of ['http://localhost/invoke', 'https://example.test/invoke', config.flowUrl.replace('https://', 'https://user:password@'), `${config.flowUrl}#fragment`, config.flowUrl.replace('/invoke?', '/manage?'), config.flowUrl.replace('.environment.', '.environment.evil.')]) {
    assert.throws(() => validateDycosFlowConfiguration({ ...config, flowUrl }), rejects('source_configuration', 'fetch'))
  }
  assert.throws(() => validateDycosFlowConfiguration({ ...config, tenantId: '../other-tenant' }), rejects('source_configuration', 'authenticate'))
})

test('client assertions use a fresh ID, five minute lifetime and RSA PSS signature', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const config = { ...configuration(), privateKey, thumbprint: 'synthetic-public-thumbprint' }
  const assertion = signDycosClientAssertion(config, now)
  const [header, payload, signature] = assertion.split('.')
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'PS256', typ: 'JWT', 'x5t#S256': config.thumbprint })
  const claims = JSON.parse(Buffer.from(payload, 'base64url'))
  assert.equal(claims.aud, `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`)
  assert.equal(claims.iss, config.clientId)
  assert.equal(claims.sub, config.clientId)
  assert.equal(claims.exp - claims.iat, 300)
  assert.equal(claims.iat - claims.nbf, 30)
  assert.equal(verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(signature, 'base64url')), true)
  assert.notEqual(JSON.parse(Buffer.from(signDycosClientAssertion(config, now).split('.')[1], 'base64url')).jti, claims.jti)
  assert.throws(() => createDycosClientAssertion(configuration(), now), rejects('source_configuration', 'authenticate'))
})

test('authenticated fetch requests the exact audience scope and only sends the token to the configured flow', async () => {
  const config = configuration(); const calls = []; const access = token(config)
  const result = await fetchDycosFlowOrder('260900123', options(config, async (url, init) => {
    calls.push({ url, init })
    return calls.length === 1 ? json(access) : json({ auftrag: { Nummer: 260900123 } })
  }))
  assert.equal(result.auftrag.Nummer, 260900123)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`)
  assert.equal(calls[0].init.body.get('scope'), 'https://service.flow.microsoft.com//.default')
  assert.equal(calls[0].init.body.get('client_assertion'), 'synthetic-assertion')
  assert.equal(calls[1].url, config.flowUrl)
  assert.equal(calls[1].init.headers.Authorization, `Bearer ${access.access_token}`)
  assert.deepEqual(JSON.parse(calls[1].init.body), { taNummer: '260900123' })
  assert.ok(calls.every(({ init }) => init.redirect === 'error' && init.signal instanceof AbortSignal))
  await fetchDycosFlowOrder('260900124', options(config, async (url) => { assert.equal(url, config.flowUrl); return json({ auftrag: { Nummer: 260900124 } }) }))
})

test('invalid TA values never authenticate or call the flow', async () => {
  for (const ta of ['', 'abc', '1.2', '-1', '001', '2147483648', 123, null]) {
    await assert.rejects(fetchDycosFlowOrder(ta, { fetchImpl: () => assert.fail('unexpected network') }), rejects('invalid_ta'))
  }
})

test('tokens for other audiences, tenants, applications, principals or expired tokens are rejected before source read', async () => {
  for (const patch of [{ aud: 'https://graph.microsoft.com' }, { aud: audience.slice(0, -1) }, { tid: randomUUID() }, { oid: randomUUID() }, { appid: randomUUID() }, { iss: 'https://untrusted.example/' }, { exp: now / 1000 + 10 }]) {
    const config = configuration(); let calls = 0
    await assert.rejects(fetchDycosFlowOrder('123', options(config, async () => { calls++; return json(token(config, patch)) })), rejects('source_auth', 'authenticate'))
    assert.equal(calls, 1)
  }
})

test('authentication rejection is sanitized and never copied from the upstream body', async () => {
  const config = configuration()
  await assert.rejects(fetchDycosFlowOrder('123', options(config, async () => json({ error_description: config.privateKeyPem }, 401))), (error) => {
    assert.equal(error.code, 'source_auth'); assert.ok(!error.message.includes(config.privateKeyPem)); assert.ok(!error.message.includes(config.flowUrl)); return true
  })
})

test('source not-found and invalid input require the expected response contract', async () => {
  for (const [status, body, expected] of [[404, { code: 'TA_NOT_FOUND' }, 'ta_not_found'], [400, { code: 'INVALID_TA_NUMBER' }, 'invalid_ta'], [404, { code: 'route-not-found' }, 'source_invalid_response'], [500, { code: 'SOURCE_ERROR' }, 'source_unavailable']]) {
    const config = configuration(); let count = 0
    await assert.rejects(fetchDycosFlowOrder('123', options(config, async () => ++count === 1 ? json(token(config)) : json(body, status))), rejects(expected, 'fetch'))
  }
})

test('unauthorized source responses evict the cached token without retrying a call', async () => {
  const config = configuration(); let count = 0
  await assert.rejects(fetchDycosFlowOrder('123', options(config, async () => ++count === 1 ? json(token(config)) : json({}, 403))), rejects('source_auth', 'fetch'))
  assert.equal(count, 2)
  count = 0
  await fetchDycosFlowOrder('123', options(config, async () => ++count === 1 ? json(token(config)) : json({ auftrag: {} })))
  assert.equal(count, 2)
})

test('timeouts and network failures have fixed messages and do not leak URLs', async () => {
  for (const name of ['TimeoutError', 'AbortError', 'TypeError']) {
    const config = configuration()
    await assert.rejects(fetchDycosFlowOrder('123', options(config, async () => { const error = new Error(config.flowUrl); error.name = name; throw error })), (error) => {
      assert.equal(error.code, name === 'TypeError' ? 'source_unavailable' : 'source_timeout'); assert.ok(!error.message.includes(config.flowUrl)); return true
    })
  }
})

test('oversized, malformed and unexpected response content is rejected rather than treated as an empty order', async () => {
  for (const response of [() => new Response('not json', { headers: { 'Content-Type': 'text/plain' } }), () => new Response('{', { headers: { 'Content-Type': 'application/json' } }), () => json([]), () => json(null), () => json({}, 202), () => json({}, 200, { 'Content-Length': String(3 * 1024 * 1024) }), () => json({ oversized: 'x'.repeat(2 * 1024 * 1024) })]) {
    const config = configuration(); let count = 0
    await assert.rejects(fetchDycosFlowOrder('123', options(config, async () => ++count === 1 ? json(token(config)) : response())), rejects('source_invalid_response', 'fetch'))
  }
})
