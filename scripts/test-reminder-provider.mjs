import { randomBytes, createHash } from 'node:crypto'
import { access, mkdir, open, readFile, realpath } from 'node:fs/promises'
import { dirname, join, resolve, parse } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildReminderProviderRequest, parseReminderProviderResponse } from '../functions/reminderProviderContract.js'
import { createReminderFlowAuthorizationProvider } from '../functions/reminderFlowAuth.js'

const scenarios = ['fresh', 'replay', 'changed-digest', 'expired', 'cross-environment']
const recipients = ['no-reply@brennpunkt-logistik.de', 'bb@brennpunkt-logistik.de', 'df@brennpunkt-logistik.de']
const environments = ['development', 'production']
const approvedHost = 'defaultb829bbdcc0b74128a3416715a67b45.1b.environment.api.powerplatform.com'
const guid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const fail = code => { throw new ManualProviderTestError(code) }
export class ManualProviderTestError extends Error { constructor(code) { super(code); this.name = 'ManualProviderTestError'; this.code = code } }

export function validatePrivateProviderConfiguration(config) {
  if (!config || Object.keys(config).some(key => !environments.includes(key))) fail('invalid-private-configuration')
  for (const environment of environments) {
    const profile = config[environment]
    if (!profile || Object.keys(profile).some(key => !['url', 'tenantId', 'clientId', 'servicePrincipalId', 'certificatePath', 'privateKeyPath'].includes(key))) fail('invalid-private-configuration')
    let endpoint
    try { endpoint = new URL(profile.url) } catch { fail('invalid-private-endpoint') }
    if (endpoint.protocol !== 'https:' || endpoint.hostname !== approvedHost || endpoint.port || endpoint.username || endpoint.password || endpoint.hash || !endpoint.pathname.endsWith('/invoke') || [...endpoint.searchParams.keys()].some(key => key !== 'api-version')) fail('invalid-private-endpoint')
    for (const key of ['tenantId', 'clientId', 'servicePrincipalId']) if (typeof profile[key] !== 'string' || !guid.test(profile[key])) fail('invalid-private-identity')
    for (const key of ['certificatePath', 'privateKeyPath']) if (typeof profile[key] !== 'string' || !profile[key]) fail('missing-private-credential-path')
  }
  if (config.development.url === config.production.url || config.development.clientId.toLowerCase() === config.production.clientId.toLowerCase() || config.development.servicePrincipalId.toLowerCase() === config.production.servicePrincipalId.toLowerCase()) fail('environments-not-isolated')
  return config
}

/** Reject any ancestor Git checkout, including linked worktrees and symlinked paths. */
async function privatePath(path, { mustExist = true } = {}) {
  if (typeof path !== 'string' || !path) fail('private-path-required')
  let probe = resolve(path)
  const suffix = []
  while (true) {
    try { probe = await realpath(probe); break }
    catch { if (mustExist || dirname(probe) === probe) fail('private-path-unavailable'); suffix.unshift(parse(probe).base); probe = dirname(probe) }
  }
  let ancestor = probe
  while (true) {
    try { await access(join(ancestor, '.git')); fail('private-path-inside-git') }
    catch (error) { if (error instanceof ManualProviderTestError) throw error }
    if (dirname(ancestor) === ancestor) break
    ancestor = dirname(ancestor)
  }
  return resolve(probe, ...suffix)
}

async function exclusiveJson(path, value) {
  let handle
  try { handle = await open(path, 'wx', 0o600) }
  catch { fail('attempt-already-reserved-or-journal-unavailable') }
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync() }
  finally { await handle.close() }
}

export function createPrivateTestSession({ environment, recipient = recipients[0], now = new Date(), deliveryId = randomBytes(32).toString('hex') }) {
  if (!environments.includes(environment) || !recipients.includes(recipient)) fail('test-recipient-or-environment-not-authorized')
  const dueAt = new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString()
  return { version: 1, environment, request: buildReminderProviderRequest({ environment, recipient, deliveryId, dueAt, subject: 'Drehpunkt reminder provider test', message: 'Authorized reminder transport test. No business data.', messageHtml: '<p>Authorized reminder transport test. No business data.</p>' }) }
}

function checkedSession(session, environment) {
  if (session?.version !== 1 || session.environment !== environment || !session.request || !recipients.includes(session.request.to)) fail('private-session-invalid')
  const request = session.request
  let rebuilt
  try { rebuilt = buildReminderProviderRequest({ environment, recipient: request.to, deliveryId: request.deliveryId, dueAt: request.dueAt, subject: request.subject, message: request.message, messageHtml: request.messageHtml }) }
  catch { fail('private-session-invalid') }
  if (JSON.stringify(request) !== JSON.stringify(rebuilt) || request.subject !== 'Drehpunkt reminder provider test' || request.message !== 'Authorized reminder transport test. No business data.' || request.messageHtml !== '<p>Authorized reminder transport test. No business data.</p>') fail('private-session-invalid')
  return session
}

export function prepareManualProviderScenario(session, scenario, now = new Date()) {
  if (!scenarios.includes(scenario)) fail('unknown-manual-scenario')
  checkedSession(session, session.environment)
  let request = session.request
  if (scenario === 'changed-digest') request = buildReminderProviderRequest({ environment: session.environment, recipient: request.to, deliveryId: request.deliveryId, dueAt: request.dueAt, subject: `${request.subject} changed`, message: request.message, messageHtml: request.messageHtml })
  const targetEnvironment = scenario === 'cross-environment' ? environments.find(value => value !== session.environment) : session.environment
  const remaining = Date.parse(request.expiresAt) - now.getTime()
  if (scenario === 'expired') { if (remaining > 0) fail('expired-scenario-not-yet-expired') }
  else if (now.getTime() < Date.parse(request.dueAt) || remaining <= 0) fail('delivery-minute-not-current')
  return { request, sourceEnvironment: session.environment, targetEnvironment, expected: { fresh: 'accepted', replay: 'accepted', 'changed-digest': 'uncertain', expired: 'missed', 'cross-environment': 'authorization-denied' }[scenario] }
}

async function boundedJson(response, signal) {
  if (!response.body?.getReader) return null
  const reader = response.body.getReader()
  let size = 0
  const chunks = []
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      if (signal.aborted) fail('request-outcome-unknown')
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 32768) { cancel(); return null }
      chunks.push(Buffer.from(value))
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return null }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock() }
}

/** One manually selected attempt, never a scenario loop or automatic retry.
 * Live execution is opt-in and private credentials are only read after reservation. */
export async function runManualProviderTest({ scenario = 'fresh', environment = 'development', sessionId, mode = 'dry-run', privateConfigPath, stateDirectory, recipient = recipients[0], timeoutMs = 10000 }, {
  now = () => new Date(), fetchImpl = fetch, authorizationFactory = createReminderFlowAuthorizationProvider,
} = {}) {
  if (!['dry-run', 'execute'].includes(mode) || !scenarios.includes(scenario) || !environments.includes(environment) || !recipients.includes(recipient) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(sessionId || '') || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) fail('invalid-manual-test-options')
  const directory = await privatePath(stateDirectory, { mustExist: false })
  const sessionDirectory = join(directory, sessionId)
  let session
  if (scenario === 'fresh') session = createPrivateTestSession({ environment, recipient, now: now() })
  else {
    try { session = checkedSession(JSON.parse(await readFile(await privatePath(join(sessionDirectory, 'session.json')), 'utf8')), environment) }
    catch { fail('private-session-invalid') }
    let first
    try { first = JSON.parse(await readFile(join(sessionDirectory, 'fresh.result.json'), 'utf8')) } catch { fail('fresh-acceptance-required') }
    if (first.status !== 'accepted' || first.payloadDigest !== session.request.payloadDigest || first.deliveryId !== session.request.deliveryId) fail('fresh-acceptance-required')
  }
  const prepared = prepareManualProviderScenario(session, scenario, now())
  const summary = { scenario, sourceEnvironment: environment, targetEnvironment: prepared.targetEnvironment, expected: prepared.expected, actualNetworkCall: false, mailCountVerified: false }
  if (mode === 'dry-run') return { ...summary, mode, status: 'dry-run', requiresExplicitExecute: true }
  let config
  try { config = validatePrivateProviderConfiguration(JSON.parse(await readFile(await privatePath(privateConfigPath), 'utf8'))) }
  catch (error) { if (error instanceof ManualProviderTestError) throw error; fail('private-configuration-unavailable') }
  if (scenario !== 'expired' && Date.parse(prepared.request.expiresAt) - now().getTime() < Math.min(timeoutMs, 1000)) fail('delivery-window-too-short')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await privatePath(directory)
  if (scenario === 'fresh') {
    try { await mkdir(sessionDirectory, { mode: 0o700 }) } catch { fail('session-already-exists-or-unavailable') }
    await exclusiveJson(join(sessionDirectory, 'session.json'), session)
  }
  const requestHash = createHash('sha256').update(JSON.stringify(prepared.request)).digest('hex')
  const identity = { sessionId, scenario, sourceEnvironment: environment, targetEnvironment: prepared.targetEnvironment, deliveryId: prepared.request.deliveryId, payloadDigest: prepared.request.payloadDigest, requestHash, dueAt: prepared.request.dueAt, expiresAt: prepared.request.expiresAt }
  await exclusiveJson(join(sessionDirectory, `${scenario}.attempt.json`), { ...identity, startedAt: now().toISOString(), status: 'reserved', note: 'Permanent reservation. Missing result means unknown; never automatically repeat this scenario.' })
  const controller = new AbortController()
  const remaining = Date.parse(prepared.request.expiresAt) - now().getTime()
  const budget = scenario === 'expired' ? timeoutMs : Math.min(timeoutMs, Math.max(1, remaining))
  let timer
  let outcome = { status: 'uncertain', reason: 'request-outcome-unknown' }
  let httpStatus = null
  let actualNetworkCall = false
  const attempt = async () => {
    const profile = config[environment] // Cross-environment uses SOURCE identity, unchanged payload.
    const certificatePath = await privatePath(profile.certificatePath)
    const privateKeyPath = await privatePath(profile.privateKeyPath)
    const authorize = authorizationFactory({ config: { tenantId: profile.tenantId, clientId: profile.clientId, servicePrincipalId: profile.servicePrincipalId, certificatePem: await readFile(certificatePath, 'utf8'), privateKeyPem: await readFile(privateKeyPath, 'utf8') }, timeoutMs: Math.min(5000, budget) })
    const authorization = await authorize({ signal: controller.signal })
    if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9._~-]{1,64000}$/.test(authorization)) fail('authentication-unavailable')
    if (controller.signal.aborted) fail('request-outcome-unknown')
    if (scenario !== 'expired' && (now().getTime() < Date.parse(prepared.request.dueAt) || now().getTime() >= Date.parse(prepared.request.expiresAt))) fail('delivery-window-ended-before-request')
    actualNetworkCall = true
    const response = await fetchImpl(config[prepared.targetEnvironment].url, { method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': prepared.request.deliveryKey, Authorization: authorization }, body: JSON.stringify(prepared.request) })
    httpStatus = response.status
    const receipt = await boundedJson(response, controller.signal)
    if (scenario === 'cross-environment' && [401, 403].includes(httpStatus)) {
      // A 403 produced by the flow's namespace guard is NOT proof that the
      // foreign identity was stopped by the OAuth trigger boundary.
      if (receipt?.contractVersion === 1 && typeof receipt?.outcome === 'string') return { status: 'uncertain', reason: 'cross-environment-provider-reached' }
      return { status: 'authorization-denied', reason: 'cross-environment-http-denial' }
    }
    return parseReminderProviderResponse(receipt, prepared.request, httpStatus)
  }
  try {
    outcome = await Promise.race([attempt(), new Promise((resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ManualProviderTestError('request-outcome-unknown')) }, budget) })])
  } catch { outcome = { status: 'uncertain', reason: actualNetworkCall ? 'request-outcome-unknown' : 'authentication-or-preflight-failed' } }
  finally { clearTimeout(timer) }
  const result = { ...identity, completedAt: now().toISOString(), status: outcome.status, reason: outcome.reason || null, httpStatus, actualNetworkCall, expected: prepared.expected, protocolMatched: outcome.status === prepared.expected, mailCountVerified: false, ...(scenario === 'cross-environment' ? { authorizationBoundaryVerified: false } : {}) }
  try { await exclusiveJson(join(sessionDirectory, `${scenario}.result.json`), result) }
  catch { fail('result-journal-failed-never-repeat') }
  return { ...summary, mode, ...result }
}

export const manualProviderTestUsage = `Manual provider test, dry-run by default; one scenario per call, never all scenarios automatically.
node scripts/test-reminder-provider.mjs --scenario fresh --environment development --session <id> --state-dir <PRIVATE directory outside Git>
Add --execute --private-config <PRIVATE JSON outside Git> only for an explicitly selected approved real test.
Scenarios: fresh, replay, changed-digest, expired, cross-environment. Follow-ups require recorded fresh accepted.
Default recipient no-reply@brennpunkt-logistik.de; --recipient permits only no-reply@, bb@ or df@brennpunkt-logistik.de.
Private config keys development/production: {url,tenantId,clientId,servicePrincipalId,certificatePath,privateKeyPath}.
No PEMs inline, SAS endpoints, redirects, retries, resubmits, URL/token printing or cloud configuration changes.
Run replay/changed/cross in the original minute; expired only after original expiry. No automatic waiting.
Existing attempt reservation, including interrupted/unknown outcome, cannot be repeated. Inspect provider run/ledger separately.
ACK matching does not prove inbox delivery or absence of duplicate mail; inspect those separately.
Cross-environment HTTP401/403 is a denial observation, not proof of the OAuth boundary: verify no flow run started.
A provider-shaped namespace rejection is explicitly NOT counted as authorization-denied.`

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length === 1 && args[0] === '--help') console.log(manualProviderTestUsage)
    else {
      const names = { '--scenario': 'scenario', '--environment': 'environment', '--session': 'sessionId', '--state-dir': 'stateDirectory', '--private-config': 'privateConfigPath', '--recipient': 'recipient' }
      const options = {}
      while (args.length) {
        const key = args.shift()
        if (key === '--execute' && !options.mode) { options.mode = 'execute'; continue }
        if (!names[key] || !args[0] || options[names[key]]) fail('invalid-manual-test-arguments')
        options[names[key]] = args.shift()
      }
      console.log(JSON.stringify(await runManualProviderTest(options)))
    }
  } catch (error) { console.error(error instanceof ManualProviderTestError ? error.code : 'manual-provider-test-failed'); process.exitCode = 1 }
}
