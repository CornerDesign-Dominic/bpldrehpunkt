import { Buffer } from 'node:buffer'
import { constants, createHash, createPrivateKey, createPublicKey, randomUUID, sign, X509Certificate } from 'node:crypto'
import { setTimeout, clearTimeout } from 'node:timers'

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export class EntraClientCredentialsError extends Error {
  constructor(code) { super('Certificate authentication failed.'); this.name = 'EntraClientCredentialsError'; this.code = code }
}
const fail = (code) => { throw new EntraClientCredentialsError(code) }
const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
export const entraTokenEndpoint = (tenantId) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
export function validateEntraClientConfiguration(config) {
  if (!config || !['tenantId', 'clientId', 'servicePrincipalId'].every((key) => typeof config[key] === 'string' && guid.test(config[key]))) fail('configuration')
  return config
}
export function signEntraClientAssertion({ tenantId, clientId, privateKey, thumbprint }, now = Date.now()) {
  const seconds = Math.floor(now / 1000)
  const unsigned = `${part({ alg: 'PS256', typ: 'JWT', 'x5t#S256': thumbprint })}.${part({ aud: entraTokenEndpoint(tenantId), iss: clientId, sub: clientId, jti: randomUUID(), nbf: seconds - 30, iat: seconds, exp: seconds + 300 })}`
  const signature = sign('sha256', Buffer.from(unsigned), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 })
  return `${unsigned}.${signature.toString('base64url')}`
}
export function createEntraClientAssertion(config, now = Date.now()) {
  try {
    const certificate = new X509Certificate(config.certificatePem)
    const privateKey = createPrivateKey(config.privateKeyPem)
    if (certificate.publicKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyType !== 'rsa'
      || privateKey.asymmetricKeyDetails.modulusLength < 2048
      || !Number.isFinite(now) || now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)
      || !certificate.publicKey.equals(createPublicKey(privateKey))) fail('configuration')
    return signEntraClientAssertion({ ...config, privateKey, thumbprint: createHash('sha256').update(certificate.raw).digest('base64url') }, now)
  } catch { fail('configuration') }
}
async function boundedTokenJson(response, signal) {
  const maximum = 128 * 1024
  if (response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || Number(response.headers.get('content-length')) > maximum || !response.body) {
    void response.body?.cancel().catch(() => {}); fail('invalid_response')
  }
  const reader = response.body.getReader(), chunks = []
  let size = 0
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      if (signal.aborted) fail('timeout')
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) { cancel(); fail('invalid_response') }
      chunks.push(Buffer.from(value))
    }
    if (signal.aborted) fail('timeout')
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) { if (error instanceof EntraClientCredentialsError) throw error; fail(signal.aborted ? 'timeout' : 'invalid_response') }
  finally { signal.removeEventListener('abort', cancel); reader.releaseLock() }
}
function checkedToken(response, config, audience, now) {
  try {
    if (typeof response?.token_type !== 'string' || response.token_type.toLowerCase() !== 'bearer' || typeof response.access_token !== 'string' || response.access_token.length > 64000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(response.access_token)) fail('authentication')
    const claims = JSON.parse(Buffer.from(response.access_token.split('.')[1], 'base64url').toString('utf8'))
    const tenant = config.tenantId.toLowerCase(), client = config.clientId.toLowerCase()
    if (claims.aud !== audience || claims.tid?.toLowerCase() !== tenant || claims.oid?.toLowerCase() !== config.servicePrincipalId.toLowerCase()
      || (!claims.appid && !claims.azp) || [claims.appid, claims.azp].filter((value) => value !== undefined).some((value) => typeof value !== 'string' || value.toLowerCase() !== client)
      || ![`https://sts.windows.net/${tenant}/`, `https://login.microsoftonline.com/${tenant}/v2.0`].includes(claims.iss)
      || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now + 60000 || !Number.isFinite(Number(response.expires_in)) || Number(response.expires_in) <= 60) fail('authentication')
    // The token is received only from the tenant-bound Entra HTTPS endpoint.
    return { token: response.access_token, expires: Math.min(claims.exp * 1000, now + Number(response.expires_in) * 1000) }
  } catch { fail('authentication') }
}
function waitForCaller(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new EntraClientCredentialsError('aborted'))
  return new Promise((resolve, reject) => {
    const abort = () => reject(new EntraClientCredentialsError('aborted'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then((value) => signal.aborted ? abort() : resolve(value), reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
/** A provider owns its cache and in-flight request; callers never share their
 * cancellation signal with other callers. No business endpoint is invoked. */
export function createEntraClientCredentialsProvider({ config, audience, fetchImpl = fetch, now = Date.now, timeoutMs = 5000 }) {
  let cached = null, flight = null, activeKey = null
  return async function authorization({ signal } = {}) {
    if (signal?.aborted) fail('aborted')
    const credentials = validateEntraClientConfiguration(typeof config === 'function' ? config() : config)
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 5000 || typeof audience !== 'string' || !audience.startsWith('https://')) fail('configuration')
    const key = createHash('sha256').update(JSON.stringify([credentials.tenantId, credentials.clientId, credentials.servicePrincipalId, credentials.certificatePem, credentials.privateKeyPem, audience])).digest('hex')
    if (key !== activeKey) { activeKey = key; cached = null }
    let token
    if (cached?.key === key && cached.expires > now() + 60000) token = Promise.resolve(cached.token)
    else {
      if (flight?.key !== key) {
        const current = { key }
        current.promise = (async () => {
          const controller = new AbortController()
          let timer
          try {
            const assertion = createEntraClientAssertion(credentials, now())
            const exchange = async () => {
              let response
              try {
                response = await fetchImpl(entraTokenEndpoint(credentials.tenantId), { method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: credentials.clientId, scope: `${audience}/.default`, grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion }) })
              } catch (error) { fail(controller.signal.aborted || ['AbortError', 'TimeoutError'].includes(error?.name) ? 'timeout' : 'unavailable') }
              if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); fail('timeout') }
              if (response.status !== 200) { void response.body?.cancel().catch(() => {}); fail('authentication') }
              return checkedToken(await boundedTokenJson(response, controller.signal), credentials, audience, now())
            }
            const result = await Promise.race([exchange(), new Promise((resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new EntraClientCredentialsError('timeout')) }, timeoutMs) })])
            if (activeKey === key) cached = { key, ...result, expires: Math.min(result.expires, Date.parse(new X509Certificate(credentials.certificatePem).validTo)) }
            return result.token
          } finally { clearTimeout(timer) }
        })()
        flight = current
        void current.promise.finally(() => { if (flight === current) flight = null }).catch(() => {})
      }
      token = flight.promise
    }
    return `Bearer ${await waitForCaller(token, signal)}`
  }
}
