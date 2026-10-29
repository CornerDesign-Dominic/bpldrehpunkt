import { Buffer } from 'node:buffer'
import { constants, createHash, createPrivateKey, createPublicKey, randomUUID, sign, X509Certificate } from 'node:crypto'
import { defineSecret } from 'firebase-functions/params'

const secretNames = {
  tenantId: 'DYCOS_TENANT_ID', clientId: 'DYCOS_CLIENT_ID', servicePrincipalId: 'DYCOS_SERVICE_PRINCIPAL_ID',
  certificatePem: 'DYCOS_CERTIFICATE_PEM', privateKeyPem: 'DYCOS_PRIVATE_KEY_PEM', flowUrl: 'DYCOS_FLOW_URL',
}
const parameters = Object.fromEntries(Object.entries(secretNames).map(([key, name]) => [key, defineSecret(name)]))
export const dycosFlowConfigurationSecrets = Object.values(parameters)
const masterDataFlowUrl = defineSecret('DYCOS_MASTER_DATA_FLOW_URL')
export const dycosMasterDataConfigurationSecrets = [...Object.entries(parameters).filter(([key]) => key !== 'flowUrl').map(([, value]) => value), masterDataFlowUrl]
const audience = 'https://service.flow.microsoft.com/'
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let tokenCache = null

const messages = {
  source_configuration: 'Die DyCoS-Schnittstelle ist noch nicht korrekt eingerichtet.',
  source_auth: 'Die Anmeldung an der DyCoS-Schnittstelle ist fehlgeschlagen.',
  source_timeout: 'Die DyCoS-Schnittstelle hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.',
  source_invalid_response: 'Die DyCoS-Schnittstelle hat eine ungültige Antwort geliefert.',
  source_unavailable: 'Die DyCoS-Schnittstelle ist derzeit nicht erreichbar. Bitte erneut versuchen.',
  ta_not_found: 'Die angefragte TA-Nummer wurde in DyCoS nicht gefunden.',
  invalid_ta: 'Bitte eine gültige numerische TA-Nummer eingeben.',
  partner_not_found: 'Die Partnernummer wurde in DyCoS nicht gefunden.',
  partner_not_unique: 'Die Partnernummer ist in DyCoS nicht eindeutig.',
  invalid_partner: 'Bitte eine gültige Debitoren- oder Kreditornummer eingeben.',
}

export class DycosFlowError extends Error {
  constructor(code, stage) { super(messages[code]); this.name = 'DycosFlowError'; this.code = code; this.stage = stage }
}
const problem = (code, stage) => { throw new DycosFlowError(code, stage) }
const jsonPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const tokenEndpoint = (tenantId) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

export function validateDycosFlowConfiguration(config) {
  if (!config || !['tenantId', 'clientId', 'servicePrincipalId'].every((key) => typeof config[key] === 'string' && guid.test(config[key]))) problem('source_configuration', 'authenticate')
  try {
    const url = new URL(config.flowUrl)
    const tenant = config.tenantId.toLowerCase().replaceAll('-', '')
    // This integration is intentionally bound to the approved default environment.
    const host = `default${tenant.slice(0, -2)}.${tenant.slice(-2)}.environment.api.powerplatform.com`
    if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || url.hash || !url.pathname.endsWith('/invoke')) throw new Error()
  } catch { problem('source_configuration', 'fetch') }
  return config
}

export function signDycosClientAssertion({ tenantId, clientId, privateKey, thumbprint }, now = Date.now()) {
  const seconds = Math.floor(now / 1000)
  const unsigned = `${jsonPart({ alg: 'PS256', typ: 'JWT', 'x5t#S256': thumbprint })}.${jsonPart({
    aud: tokenEndpoint(tenantId), iss: clientId, sub: clientId, jti: randomUUID(), nbf: seconds - 30, iat: seconds, exp: seconds + 300,
  })}`
  const signature = sign('sha256', Buffer.from(unsigned), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 })
  return `${unsigned}.${signature.toString('base64url')}`
}

export function createDycosClientAssertion(config, now = Date.now()) {
  try {
    const certificate = new X509Certificate(config.certificatePem)
    const privateKey = createPrivateKey(config.privateKeyPem)
    if (certificate.publicKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyType !== 'rsa'
      || privateKey.asymmetricKeyDetails.modulusLength < 2048
      || now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)
      || !certificate.publicKey.equals(createPublicKey(privateKey))) throw new Error()
    return signDycosClientAssertion({ ...config, privateKey, thumbprint: createHash('sha256').update(certificate.raw).digest('base64url') }, now)
  } catch { problem('source_configuration', 'authenticate') }
}

async function boundedJson(response, maximum, stage) {
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > maximum) {
    await response.body?.cancel().catch(() => {})
    problem('source_invalid_response', stage)
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) problem('source_invalid_response', stage)
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) { await reader.cancel(); problem('source_invalid_response', stage) }
      chunks.push(Buffer.from(value))
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    if (error instanceof DycosFlowError) throw error
    problem(error?.name === 'AbortError' || error?.name === 'TimeoutError' ? 'source_timeout' : 'source_invalid_response', stage)
  } finally { reader.releaseLock() }
}

async function send(fetchImpl, url, options, timeout, stage) {
  try { return await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeout) }) }
  catch (error) { problem(['TimeoutError', 'AbortError'].includes(error?.name) ? 'source_timeout' : 'source_unavailable', stage) }
}

function checkedToken(response, config, now) {
  try {
    if (response.token_type?.toLowerCase() !== 'bearer' || typeof response.access_token !== 'string' || response.access_token.length > 64000) throw new Error()
    const claims = JSON.parse(Buffer.from(response.access_token.split('.')[1], 'base64url').toString('utf8'))
    const tenant = config.tenantId.toLowerCase()
    if (claims.aud !== audience || claims.tid?.toLowerCase() !== tenant || claims.oid?.toLowerCase() !== config.servicePrincipalId.toLowerCase()
      || (claims.appid || claims.azp)?.toLowerCase() !== config.clientId.toLowerCase()
      || ![`https://sts.windows.net/${tenant}/`, `https://login.microsoftonline.com/${tenant}/v2.0`].includes(claims.iss)
      || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now + 60000) throw new Error()
    // Entra's HTTPS token endpoint supplies this token; no third-party decoder is used.
    if (!Number.isFinite(Number(response.expires_in)) || Number(response.expires_in) <= 60) throw new Error()
    return { token: response.access_token, expires: Math.min(claims.exp * 1000, now + Number(response.expires_in) * 1000) }
  } catch { problem('source_auth', 'authenticate') }
}

export async function fetchDycosFlowOrder(taNummer, options = {}) {
  if (typeof taNummer !== 'string' || !/^(?:0|[1-9]\d{0,9})$/.test(taNummer) || Number(taNummer) > 2147483647) problem('invalid_ta', 'fetch')
  return fetchDycosFlowPayload({ taNummer }, options)
}

export async function fetchDycosFlowPartner({ typ, nummer }, options = {}) {
  if (!['kunde', 'utn'].includes(typ) || typeof nummer !== 'string' || !/^(?:0|[1-9]\d{0,9})$/.test(nummer) || Number(nummer) > 2147483647) problem('invalid_partner', 'fetch')
  const config = options.config || { ...Object.fromEntries(Object.entries(parameters).filter(([key]) => key !== 'flowUrl').map(([key, param]) => [key, param.value()])), flowUrl: masterDataFlowUrl.value() }
  return fetchDycosFlowPayload({ typ, nummer }, { ...options, config })
}

async function fetchDycosFlowPayload(payload, options) {
  const config = validateDycosFlowConfiguration(options.config || Object.fromEntries(Object.entries(parameters).map(([key, param]) => [key, param.value()])))
  const fetchImpl = options.fetchImpl || fetch
  const now = options.now || Date.now
  const cacheKey = createHash('sha256').update(JSON.stringify(Object.keys(secretNames).map((key) => config[key]))).digest('hex')
  let accessToken = tokenCache?.key === cacheKey && tokenCache.expires > now() + 60000 ? tokenCache.token : null
  if (!accessToken) {
    const assertion = (options.assertionFactory || createDycosClientAssertion)(config, now())
    const response = await send(fetchImpl, tokenEndpoint(config.tenantId), {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, scope: `${audience}/.default`, grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion }),
    }, 20000, 'authenticate')
    if (!response.ok) { await response.body?.cancel().catch(() => {}); problem('source_auth', 'authenticate') }
    const checked = checkedToken(await boundedJson(response, 128 * 1024, 'authenticate'), config, now())
    tokenCache = { key: cacheKey, ...checked }
    accessToken = checked.token
  }
  const response = await send(fetchImpl, config.flowUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload),
  }, 110000, 'fetch')
  if (!response.ok) {
    if ([400, 404, 409].includes(response.status)) {
      const error = await boundedJson(response, 128 * 1024, 'fetch')
      if (payload.typ) {
        if (response.status === 404 && error?.code === 'PARTNER_NOT_FOUND') problem('partner_not_found', 'fetch')
        if (response.status === 409 && error?.code === 'PARTNER_NOT_UNIQUE') problem('partner_not_unique', 'fetch')
        if (response.status === 400 && error?.code === 'INVALID_REQUEST') problem('invalid_partner', 'fetch')
      }
      if (response.status === 404 && error?.code === 'TA_NOT_FOUND') problem('ta_not_found', 'fetch')
      if (response.status === 400 && error?.code === 'INVALID_TA_NUMBER') problem('invalid_ta', 'fetch')
      problem('source_invalid_response', 'fetch')
    }
    await response.body?.cancel().catch(() => {})
    if ([401, 403].includes(response.status)) { tokenCache = null; problem('source_auth', 'fetch') }
    problem('source_unavailable', 'fetch')
  }
  if (response.status !== 200) problem('source_invalid_response', 'fetch')
  const result = await boundedJson(response, 2 * 1024 * 1024, 'fetch')
  if (!result || Array.isArray(result) || typeof result !== 'object') problem('source_invalid_response', 'fetch')
  return result
}
