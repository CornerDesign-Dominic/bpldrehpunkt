import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { createPrivateTestSession, prepareManualProviderScenario, runManualProviderTest, validatePrivateProviderConfiguration } from './test-reminder-provider.mjs'

const fixedNow = () => new Date('2026-10-31T12:00:05.000Z')
const host = 'defaultb829bbdcc0b74128a3416715a67b45.1b.environment.api.powerplatform.com'
const guid = digit => `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'dpr-provider-manual-'))
  const certificatePath = join(directory, 'fake-certificate.txt')
  const privateKeyPath = join(directory, 'fake-key.txt')
  await writeFile(certificatePath, 'TEST ONLY. Not a certificate.')
  await writeFile(privateKeyPath, 'TEST ONLY. Not a private key.')
  const config = Object.fromEntries([['development', '1'], ['production', '2']].map(([environment, digit]) => [environment, { url: `https://${host}/powerautomate/automations/direct/workflows/${guid(digit)}/triggers/manual/paths/invoke?api-version=1`, tenantId: guid('3'), clientId: guid(digit), servicePrincipalId: guid(environment === 'development' ? '4' : '5'), certificatePath, privateKeyPath }]))
  const privateConfigPath = join(directory, 'config.json')
  await writeFile(privateConfigPath, JSON.stringify(config))
  const calls = []
  const auth = []
  const dependencies = {
    now: fixedNow,
    authorizationFactory: options => { auth.push(options); return async () => 'Bearer FAKE_TEST_TOKEN' },
    fetchImpl: async (url, options) => {
      const payload = JSON.parse(options.body)
      calls.push({ url, options, payload })
      return Response.json({ contractVersion: 1, projectId: payload.projectId, environment: payload.environment, deliveryId: payload.deliveryId, payloadDigest: payload.payloadDigest, sender: payload.from, accepted: true, outcome: 'accepted' })
    },
  }
  const options = { scenario: 'fresh', environment: 'development', sessionId: 'fixture1', mode: 'execute', privateConfigPath, stateDirectory: join(directory, 'state') }
  return { directory, config, options, dependencies, calls, auth, async close() { assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`)); await rm(directory, { recursive: true, force: true }) } }
}

test('dry-run is default and reads no credentials, invokes no auth/fetch and creates no state', async () => {
  const f = await fixture()
  try {
    const result = await runManualProviderTest({ ...f.options, mode: undefined, privateConfigPath: undefined }, f.dependencies)
    assert.equal(result.status, 'dry-run')
    assert.equal(result.requiresExplicitExecute, true)
    assert.equal(f.calls.length, 0)
    assert.equal(f.auth.length, 0)
    assert.ok(!(await readdir(f.directory)).includes('state'))
  } finally { await f.close() }
})

test('whitelist is exact; SAS, foreign host, shared identities and credential input fields are rejected', async () => {
  const f = await fixture()
  try {
    for (const recipient of ['other@brennpunkt-logistik.de', 'no-reply@brennpunkt-logistik.de;df@brennpunkt-logistik.de', 'NO-REPLY@brennpunkt-logistik.de']) assert.throws(() => createPrivateTestSession({ environment: 'development', recipient, now: fixedNow() }))
    for (const url of [`https://${host}/invoke?sig=forbidden`, 'https://foreign.invalid/invoke', `http://${host}/invoke`, `https://${host}/invoke#fragment`]) assert.throws(() => validatePrivateProviderConfiguration({ ...f.config, development: { ...f.config.development, url } }))
    assert.throws(() => validatePrivateProviderConfiguration({ ...f.config, production: { ...f.config.production, clientId: f.config.development.clientId } }))
    assert.throws(() => validatePrivateProviderConfiguration({ ...f.config, development: { ...f.config.development, privateKeyPem: 'must-not-accept-inline' } }))
  } finally { await f.close() }
})

test('fresh reserves durable attempt before auth/provider and cannot be repeated, even after accepted', async () => {
  const f = await fixture()
  try {
    const original = f.dependencies.authorizationFactory
    f.dependencies.authorizationFactory = options => {
      assert.ok(options.config.privateKeyPem.startsWith('TEST ONLY'))
      return original(options)
    }
    const result = await runManualProviderTest(f.options, f.dependencies)
    assert.equal(result.status, 'accepted')
    assert.equal(result.mailCountVerified, false)
    assert.equal(f.calls.length, 1)
    const reservation = JSON.parse(await readFile(join(f.options.stateDirectory, 'fixture1', 'fresh.attempt.json'), 'utf8'))
    assert.equal(reservation.status, 'reserved')
    assert.equal(reservation.deliveryId, result.deliveryId)
    const journal = await readFile(join(f.options.stateDirectory, 'fixture1', 'fresh.result.json'), 'utf8')
    assert.doesNotMatch(journal, /FAKE_TEST_TOKEN|https:|certificate|privateKey|Authorized reminder|brennpunkt-logistik/)
    await assert.rejects(runManualProviderTest(f.options, f.dependencies), /session-already-exists/)
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].options.redirect, 'error')
    assert.equal(f.calls[0].options.headers['Idempotency-Key'], f.calls[0].payload.deliveryKey)
    assert.equal(f.calls[0].payload.to, 'no-reply@brennpunkt-logistik.de')
  } finally { await f.close() }
})

test('replay is byte-identical, changed digest keeps namespace/time/id, cross uses source identity and unchanged payload', async () => {
  const f = await fixture()
  try {
    await runManualProviderTest(f.options, f.dependencies)
    const original = f.calls[0].options.body
    await runManualProviderTest({ ...f.options, scenario: 'replay' }, f.dependencies)
    assert.equal(f.calls[1].options.body, original)
    await runManualProviderTest({ ...f.options, scenario: 'changed-digest' }, f.dependencies)
    const changed = f.calls[2].payload
    const source = f.calls[0].payload
    for (const key of ['deliveryKey', 'deliveryId', 'projectId', 'environment', 'dueAt', 'expiresAt', 'to']) assert.equal(changed[key], source[key])
    assert.notEqual(changed.payloadDigest, source.payloadDigest)
    f.dependencies.fetchImpl = async (url, options) => { f.calls.push({ url, options }); return Response.json({ error: 'DO NOT LOG RAW PROVIDER TEXT' }, { status: 403 }) }
    const cross = await runManualProviderTest({ ...f.options, scenario: 'cross-environment' }, f.dependencies)
    assert.equal(cross.status, 'authorization-denied')
    assert.equal(cross.protocolMatched, true)
    assert.equal(f.calls.at(-1).options.body, original)
    assert.equal(f.calls.at(-1).url, f.config.production.url)
    assert.ok(f.auth.every(options => options.config.clientId === f.config.development.clientId))
  } finally { await f.close() }
})

test('unknown fresh outcome is permanent and blocks follow-ups, with no retry or resubmit', async () => {
  const f = await fixture()
  try {
    let count = 0
    f.dependencies.fetchImpl = async () => { count++; throw new Error('https://secret.invalid/?sig=DO_NOT_LOG') }
    const result = await runManualProviderTest(f.options, f.dependencies)
    assert.equal(result.status, 'uncertain')
    assert.equal(result.reason, 'request-outcome-unknown')
    await assert.rejects(runManualProviderTest(f.options, f.dependencies))
    await assert.rejects(runManualProviderTest({ ...f.options, scenario: 'replay' }, f.dependencies), /fresh-acceptance-required/)
    assert.equal(count, 1)
    assert.doesNotMatch(JSON.stringify(result), /secret.invalid|DO_NOT_LOG/)
  } finally { await f.close() }
})

test('application namespace rejection cannot masquerade as OAuth isolation and Git paths are refused', async () => {
  const f = await fixture()
  try {
    await assert.rejects(runManualProviderTest({ ...f.options, stateDirectory: process.cwd(), mode: 'dry-run' }, f.dependencies), /inside-git/)
    await runManualProviderTest(f.options, f.dependencies)
    f.dependencies.fetchImpl = async () => Response.json({ contractVersion: 1, outcome: 'rejected', accepted: false }, { status: 403 })
    const result = await runManualProviderTest({ ...f.options, scenario: 'cross-environment' }, f.dependencies)
    assert.equal(result.status, 'uncertain')
    assert.equal(result.reason, 'cross-environment-provider-reached')
    assert.equal(result.protocolMatched, false)
    assert.equal(result.authorizationBoundaryVerified, false)
  } finally { await f.close() }
})

test('in-flight HTTP is aborted once without retry and the persisted journal remains sanitized', async () => {
  const f = await fixture()
  try {
    let count = 0
    let aborted = false
    f.dependencies.fetchImpl = async (url, options) => new Promise((resolve, reject) => {
      count++
      options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('PRIVATE_TOKEN_MUST_NOT_ESCAPE')) }, { once: true })
    })
    const result = await runManualProviderTest({ ...f.options, timeoutMs: 30 }, f.dependencies)
    assert.equal(result.status, 'uncertain')
    assert.equal(result.actualNetworkCall, true)
    assert.equal(count, 1)
    assert.equal(aborted, true)
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TOKEN/)
  } finally { await f.close() }
})

test('per-call timeout aborts and preserves uncertainty; late auth cannot start HTTP', async () => {
  const f = await fixture()
  try {
    f.dependencies.authorizationFactory = () => async () => { await new Promise(resolve => setTimeout(resolve, 30)); return 'Bearer LATE_FAKE_TOKEN' }
    const result = await runManualProviderTest({ ...f.options, timeoutMs: 5 }, f.dependencies)
    assert.equal(result.status, 'uncertain')
    await new Promise(resolve => setTimeout(resolve, 40))
    assert.equal(f.calls.length, 0)
    await assert.rejects(runManualProviderTest(f.options, f.dependencies))
  } finally { await f.close() }
})

test('minute is rechecked after authentication; expired is explicit, preserves original payload and never waits', async () => {
  const f = await fixture()
  try {
    await runManualProviderTest(f.options, f.dependencies)
    const sourceBody = f.calls[0].options.body
    await assert.rejects(runManualProviderTest({ ...f.options, scenario: 'expired' }, f.dependencies), /not-yet-expired/)
    let time = fixedNow()
    f.dependencies.now = () => time
    const original = f.dependencies.authorizationFactory
    f.dependencies.authorizationFactory = options => { const auth = original(options); return async argument => { const token = await auth(argument); time = new Date('2026-10-31T12:01:00.000Z'); return token } }
    const replay = await runManualProviderTest({ ...f.options, scenario: 'replay' }, f.dependencies)
    assert.equal(replay.status, 'uncertain')
    assert.equal(replay.actualNetworkCall, false)
    assert.equal(f.calls.length, 1)
    f.dependencies.fetchImpl = async (url, options) => {
      f.calls.push({ url, options })
      const payload = JSON.parse(options.body)
      return Response.json({ contractVersion: 1, projectId: payload.projectId, environment: payload.environment, deliveryId: payload.deliveryId, payloadDigest: payload.payloadDigest, sender: payload.from, accepted: false, outcome: 'missed' })
    }
    const expired = await runManualProviderTest({ ...f.options, scenario: 'expired' }, f.dependencies)
    assert.equal(expired.status, 'missed')
    assert.equal(f.calls.at(-1).options.body, sourceBody)
  } finally { await f.close() }
})

test('pure scenario refuses expired positive attempts and unauthorized targets without using credentials', () => {
  const session = createPrivateTestSession({ environment: 'development', now: fixedNow(), deliveryId: 'a'.repeat(64) })
  for (const scenario of ['fresh', 'replay', 'changed-digest', 'cross-environment']) assert.throws(() => prepareManualProviderScenario(session, scenario, new Date('2026-10-31T12:01:00.000Z')), /not-current/)
  const cross = prepareManualProviderScenario(session, 'cross-environment', fixedNow())
  assert.equal(cross.request, session.request)
  assert.equal(cross.sourceEnvironment, 'development')
  assert.equal(cross.targetEnvironment, 'production')
})
