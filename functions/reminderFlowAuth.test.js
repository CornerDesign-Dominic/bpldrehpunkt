import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { constants, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto'
import test from 'node:test'
import { createReminderFlowAuthorizationProvider, getReminderFlowAuthorization, reminderFlowConfigurationSecrets, ReminderFlowAuthError } from './reminderFlowAuth.js'
import { createEntraClientAssertion } from './entraClientCredentials.js'

// Synthetic self-signed fixtures, created in memory; no certificate store or
// actual credentials are accessed. DER helpers cover this minimal test schema.
const der = (tag, ...parts) => {
  const body = Buffer.concat(parts.map((part) => Buffer.isBuffer(part) ? part : Buffer.from(part)))
  const length = body.length < 128 ? Buffer.from([body.length]) : body.length < 256 ? Buffer.from([0x81, body.length]) : Buffer.from([0x82, body.length >> 8, body.length & 255])
  return Buffer.concat([Buffer.from([tag]), length, body])
}
function certificate({ modulusLength = 2048, notBefore = '200101000000Z', notAfter = '400101000000Z' } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength })
  const algorithm = der(0x30, Buffer.from('06092a864886f70d01010b0500', 'hex'))
  const name = der(0x30, der(0x31, der(0x30, Buffer.from('0603550403', 'hex'), der(0x0c, 'synthetic-only'))))
  const body = der(0x30, der(0xa0, der(0x02, Buffer.from([2]))), der(0x02, Buffer.from([1])), algorithm, name, der(0x30, der(0x17, notBefore), der(0x17, notAfter)), name, publicKey.export({ type: 'spki', format: 'der' }))
  const signed = der(0x30, body, algorithm, der(0x03, Buffer.from([0]), sign('sha256', body, privateKey)))
  return { certificatePem: `-----BEGIN CERTIFICATE-----\n${signed.toString('base64')}\n-----END CERTIFICATE-----`, privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }), publicKey }
}
const keys = certificate()
const clock = Date.parse('2026-10-31T12:00:00Z')
const audience = 'https://service.flow.microsoft.com/'
const configuration = () => ({ tenantId: randomUUID(), clientId: randomUUID(), servicePrincipalId: randomUUID(), certificatePem: keys.certificatePem, privateKeyPem: keys.privateKeyPem })
function access(config, patch = {}, at = clock) {
 const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
 return { token_type: 'Bearer', expires_in: 3600, access_token: `${encode({ alg: 'synthetic' })}.${encode({ aud: audience, tid: config.tenantId, oid: config.servicePrincipalId, appid: config.clientId, iss: `https://sts.windows.net/${config.tenantId}/`, exp: at / 1000 + 3600, ...patch })}.synthetic` }
}
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const code = (value) => (error) => error instanceof ReminderFlowAuthError && error.code === `reminder_auth_${value}`

test('reminder auth uses only separate secrets and fixed tenant HTTPS, audience and double-slash scope', async () => {
 assert.deepEqual(reminderFlowConfigurationSecrets.map((secret) => secret.name), ['REMINDER_TENANT_ID', 'REMINDER_CLIENT_ID', 'REMINDER_SERVICE_PRINCIPAL_ID', 'REMINDER_CERTIFICATE_PEM', 'REMINDER_PRIVATE_KEY_PEM'])
 const config = configuration(), calls = []
 const provider = createReminderFlowAuthorizationProvider({ config, now: () => clock, fetchImpl: async (url, init) => { calls.push({ url, init }); return json(access(config)) } })
 assert.equal(await provider(), `Bearer ${access(config).access_token}`)
 assert.equal(await provider(), `Bearer ${access(config).access_token}`)
 assert.equal(calls.length, 1)
 const { url, init } = calls[0]
 assert.equal(url, `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`)
 assert.equal(init.redirect, 'error'); assert.equal(init.method, 'POST'); assert.ok(init.signal instanceof AbortSignal)
 assert.equal(init.body.get('scope'), 'https://service.flow.microsoft.com//.default')
 const assertion = init.body.get('client_assertion'), [header, payload, signature] = assertion.split('.')
 assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'PS256')
 const claims = JSON.parse(Buffer.from(payload, 'base64url'))
 assert.equal(claims.aud, url); assert.equal(claims.iss, config.clientId); assert.equal(claims.exp - claims.iat, 300)
 assert.ok(verify('sha256', Buffer.from(`${header}.${payload}`), { key: keys.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(signature, 'base64url')))
})
test('certificate validity, matching RSA >=2048 and GUID validation fail closed before network', async () => {
 const wrong = certificate(), weak = certificate({ modulusLength: 1024 })
 for (const patch of [{ tenantId: '../tenant' }, { clientId: '' }, { servicePrincipalId: 'other' }, { certificatePem: 'invalid' }, { privateKeyPem: wrong.privateKeyPem }, weak]) {
  const provider = createReminderFlowAuthorizationProvider({ config: { ...configuration(), ...patch }, now: () => clock, fetchImpl: () => assert.fail('no token request') })
  await assert.rejects(provider(), code('configuration'))
 }
 for (const at of [Date.parse('2019-01-01'), Date.parse('2040-01-01')]) assert.throws(() => createEntraClientAssertion(configuration(), at), { code: 'configuration' })
})
test('wrong token claims, malformed token and lifetime are rejected without disclosing contents', async () => {
 const config = configuration()
 for (const patch of [{ aud: 'https://graph.microsoft.com' }, { aud: audience.slice(0, -1) }, { tid: randomUUID() }, { oid: randomUUID() }, { appid: randomUUID() }, { azp: randomUUID() }, { iss: 'https://evil.test/' }, { exp: clock / 1000 + 30 }, { exp: 'secret' }]) {
  const provider = createReminderFlowAuthorizationProvider({ config, now: () => clock, fetchImpl: async () => json(access(config, patch)) })
  await assert.rejects(provider(), code('failed'))
 }
 const v2 = createReminderFlowAuthorizationProvider({ config, now: () => clock, fetchImpl: async () => json(access(config, { appid: undefined, azp: config.clientId, iss: `https://login.microsoftonline.com/${config.tenantId}/v2.0` })) })
 assert.match(await v2(), /^Bearer /)
})
test('simultaneous refreshes coalesce; certificate, private key and client rotations invalidate cache', async () => {
 let config = configuration(), count = 0, at = clock
 const provider = createReminderFlowAuthorizationProvider({ config: () => config, now: () => at, fetchImpl: async () => { count++; await new Promise((resolve) => setTimeout(resolve, 5)); return json(access(config, {}, at)) } })
 await Promise.all([provider(), provider(), provider()]); assert.equal(count, 1)
 config = { ...config, clientId: randomUUID() }; await provider(); assert.equal(count, 2)
 const rotated = certificate(); config = { ...config, certificatePem: rotated.certificatePem, privateKeyPem: rotated.privateKeyPem }; await provider(); assert.equal(count, 3)
 config = { ...config, privateKeyPem: keys.privateKeyPem }; await assert.rejects(provider(), code('configuration')); assert.equal(count, 3)
 config = { ...config, privateKeyPem: rotated.privateKeyPem }; at += 3600000; await provider(); assert.equal(count, 4)
})
test('a caller abort is independent, stops that caller before authorization and never causes a business POST', async () => {
 const config = configuration(), controller = new AbortController(); let release, requests = 0, businessPosts = 0
 const provider = createReminderFlowAuthorizationProvider({ config, now: () => clock, fetchImpl: async (url) => { requests++; assert.ok(url.startsWith('https://login.microsoftonline.com/')); return new Promise((resolve) => { release = () => resolve(json(access(config))) }) } })
 const cancelled = provider({ signal: controller.signal }).then(() => { businessPosts++ })
 const other = provider(); controller.abort()
 await assert.rejects(cancelled, code('aborted')); release(); assert.match(await other, /^Bearer /)
 assert.equal(requests, 1); assert.equal(businessPosts, 0)
 await assert.rejects(provider({ signal: controller.signal }), code('aborted')); assert.equal(requests, 1)
})
test('deadline bounds ignored abort signals and stalled response bodies; next caller can retry safely', async () => {
 const config = configuration(); let request = 0
 const provider = createReminderFlowAuthorizationProvider({ config, now: () => clock, timeoutMs: 15, fetchImpl: async () => { request++; return request === 1 ? new Promise(() => {}) : json(access(config)) } })
 await assert.rejects(Promise.all([provider(), provider()]), code('timeout')); assert.equal(request, 1)
 assert.match(await provider(), /^Bearer /); assert.equal(request, 2)
 const stalled = createReminderFlowAuthorizationProvider({ config, now: () => clock, timeoutMs: 15, fetchImpl: async () => new Response(new ReadableStream({ pull() { return new Promise(() => {}) } }), { headers: { 'Content-Type': 'application/json' } }) })
 await assert.rejects(stalled(), code('timeout'))
})
test('HTTP/network and oversized/malformed token responses expose only fixed safe errors', async () => {
 const config = configuration()
 for (const [fetchImpl, expected] of [[async () => { throw new Error(config.privateKeyPem) }, 'unavailable'], [async () => json({ error_description: config.privateKeyPem }, 403), 'failed'], [async () => json({ oversized: 'x'.repeat(129 * 1024) }), 'invalid_response'], [async () => json({}, 200, { 'Content-Length': String(129 * 1024) }), 'invalid_response'], [async () => new Response('{', { headers: { 'Content-Type': 'application/json' } }), 'invalid_response'], [async () => new Response('secret'), 'invalid_response'], [async () => json({ token_type: 'Bearer', expires_in: 3600, access_token: 'malformed' }), 'failed']]) {
  await assert.rejects(getReminderFlowAuthorization({ config, now: () => clock, fetchImpl }), (error) => { assert.ok(code(expected)(error)); assert.ok(!error.message.includes(config.privateKeyPem)); assert.ok(!error.cause); return true })
 }
 await assert.rejects(createReminderFlowAuthorizationProvider({ config: () => { throw new Error('secret') } })(), code('configuration'))
})
