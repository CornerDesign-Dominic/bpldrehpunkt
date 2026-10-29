import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { defineSecret, defineString } from 'firebase-functions/params'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'
import { runtimeProjectId } from './externalEffects.js'

export const mailboxClientSecret = defineSecret('MAILBOX_CLIENT_SECRET')
export const mailboxRedirectUri = defineString('MAILBOX_REDIRECT_URI', { default: '' })
export const mailboxFrontendOrigin = defineString('MAILBOX_FRONTEND_ORIGIN', { default: '' })
export const mailboxTestAccount = defineString('MAILBOX_TEST_ACCOUNT', { default: '' })
const TENANT = 'b829bbdc-c0b7-4128-a341-6715a67b451b'
const CLIENT = 'a23dc8d8-e22a-40ef-997c-d28aa753ee29'
const SCOPES = 'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send offline_access'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const MAX_ATTACHMENT = 5 * 1024 * 1024
const digest = value => createHash('sha256').update(value).digest('hex')
const fail = (code, message, details) => { throw new HttpsError(code, message, details) }
const clean = (value, max = 1024) => typeof value === 'string' && value.length <= max && ![...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ? value.trim() : ''
const id = value => clean(value, 2048) || fail('invalid-argument', 'Ungültige Nachrichtenreferenz.')
const segment = value => encodeURIComponent(id(value))
const address = value => {
  const result = clean(typeof value === 'string' ? value : value?.emailAddress?.address, 254).toLowerCase()
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(result)) fail('invalid-argument', 'Ungültige E-Mail-Adresse.')
  return result
}

export function assertMailboxAccess(profile, edit = false) {
  if (profile?.active !== true || !(profile.role === 'superadmin' || (edit ? profile.permissions?.mailboxes === 'edit' : ['view', 'edit'].includes(profile.permissions?.mailboxes)))) fail('permission-denied', 'Keine Berechtigung für Postfächer.')
}

export function assertMailboxEnvironment(projectId) {
  if (projectId !== 'db-bpl-drehpunkt-dev') fail('failed-precondition', 'Die Postfachanbindung ist ausschließlich für die Dev-Umgebung freigegeben.')
}

export function validateMailboxDraft(data) {
  const recipients = key => {
    if (!Array.isArray(data?.[key]) || data[key].length > 30) fail('invalid-argument', 'Ungültige Empfängerliste.')
    return data[key].map(value => ({ emailAddress: { address: address(value) } }))
  }
  if (typeof data?.body !== 'string' || data.body.length > 100000 || data.body.includes('\0')) fail('invalid-argument', 'Ungültiger Antworttext.')
  return { toRecipients: recipients('toRecipients'), ccRecipients: recipients('ccRecipients'), bccRecipients: recipients('bccRecipients'), body: data.body, replyAll: data.replyAll === true }
}

export function assertTestRecipients(draft) {
  const recipients = [...draft.toRecipients, ...draft.ccRecipients, ...draft.bccRecipients]
  if (!draft.toRecipients.length || recipients.some(r => address(r).split('@')[1] !== 'brennpunkt-logistik.de')) fail('permission-denied', 'Im Dev-Test sind ausschließlich Empfänger mit @brennpunkt-logistik.de erlaubt, auch in CC und BCC.')
}

// Graph can canonicalize both users and folders to OData key syntax in its
// opaque nextLink. Keep its full path/query; only validate origin, resource
// type and mailbox ownership instead of requiring the initial spelling.
export function mailboxMessagePagePath(value, connection) {
  try {
    if (typeof value !== 'string' || value.length > 16000) throw new Error('invalid-link')
    const link = new URL(value)
    const resource = link.pathname.match(/^\/v1\.0\/(me|users\/([^/]+)|users\('([^']+)'\))\/mailfolders(?:\/[^/]+|\('[^']+'\))\/messages$/i)
    if (link.origin !== 'https://graph.microsoft.com' || link.username || link.password || link.hash || !resource) throw new Error('invalid-resource')
    if (resource[1].toLowerCase() !== 'me') {
      const owner = decodeURIComponent(resource[2] || resource[3]).toLowerCase()
      if (![connection?.graphUserId, connection?.email].some(id => typeof id === 'string' && id.toLowerCase() === owner)) throw new Error('foreign-mailbox')
    }
    return `${link.pathname.slice(5)}${link.search}`
  } catch {
    fail('unavailable', 'Ungültige Microsoft-Folgeseite.', { technicalCode: 'graph_pagination_invalid' })
  }
}

function seal(value, secret) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}
function unseal(value, secret) {
  const bytes = Buffer.from(value, 'base64url')
  const cipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), bytes.subarray(0, 12))
  cipher.setAuthTag(bytes.subarray(12, 28))
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8')
}

// Secret payloads never enter Firestore, diagnostic events or browser responses.
async function secretRequest(path, { method = 'GET', body, missingOkay = false } = {}) {
  const credential = await getApp().options.credential.getAccessToken()
  const response = await fetch(`https://secretmanager.googleapis.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${credential.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) })
  if (method === 'DELETE' && response.status === 404) return {}
  if (missingOkay && response.status === 404) return null
  if (!response.ok) fail('unavailable', 'Der sichere Postfachspeicher ist derzeit nicht verfügbar.', { technicalCode: `secret_storage_http_${response.status}` })
  return response.status === 204 ? {} : response.json()
}
function secretStore(project) {
  const base = `projects/${project}/secrets`
  return {
    async write(name, value, create = false) {
      if (create) await secretRequest(`${base}?secretId=${name}`, { method: 'POST', body: { replication: { automatic: {} } } })
      return (await secretRequest(`${base}/${name}:addVersion`, { method: 'POST', body: { payload: { data: Buffer.from(JSON.stringify(value)).toString('base64') } } })).name
    },
    async read(version) { return JSON.parse(Buffer.from((await secretRequest(`${version}:access`)).payload.data, 'base64').toString('utf8')) },
    async remove(name) { await secretRequest(`${base}/${name}`, { method: 'DELETE' }) },
    async destroy(version) {
      const metadata = await secretRequest(version, { missingOkay: true })
      if (metadata && metadata.state !== 'DESTROYED') await secretRequest(`${version}:destroy`, { method: 'POST', body: {} })
    },
  }
}

export function createMailboxHandlers(deps = {}) {
  const db = () => deps.db || getFirestore()
  const now = () => deps.now?.() ?? Date.now()
  const config = () => deps.config || { project: runtimeProjectId(), secret: mailboxClientSecret.value(), redirect: mailboxRedirectUri.value(), origin: mailboxFrontendOrigin.value(), testAccount: mailboxTestAccount.value() }
  const store = () => deps.secrets || secretStore(config().project)
  const http = deps.fetch || fetch
  const diagnose = async event => {
    // Throttle identical technical events across instances without persisting
    // mailbox content or Graph identifiers. Diagnosis never masks the error.
    try {
      const ref = db().doc(`mailboxDiagnosticQuotas/${digest(`${event.actorId}|${event.stage}|${event.code}`)}`)
      const accepted = await db().runTransaction(async tx => {
        const previous = (await tx.get(ref)).data()
        if (previous && now() - previous.at < 60000) return false
        tx.set(ref, { at: now() })
        return true
      })
      if (accepted) await (deps.diagnostic || recordDiagnostic)({ module: 'mailboxes', ...event })
    } catch { /* The original outcome remains authoritative. */ }
  }
  const check = async (request, edit = false) => {
    assertMailboxEnvironment(config().project)
    const profile = await (deps.requireProfile || requireActiveProfile)(request)
    assertMailboxAccess(profile, edit)
    return { uid: request.auth.uid, profile }
  }
  const owned = async (request, edit = false, disconnecting = false) => {
    const actor = await check(request, edit)
    const connectionId = clean(request.data?.connectionId, 64)
    if (!/^[a-f0-9]{64}$/.test(connectionId)) fail('invalid-argument', 'Ungültige Postfachreferenz.')
    const ref = db().doc(`mailboxConnections/${connectionId}`)
    const snap = await ref.get()
    if (!snap.exists || snap.data().ownerId !== actor.uid || !['connected', ...(disconnecting ? ['disconnecting'] : [])].includes(snap.data().status)) fail('permission-denied', 'Kein Zugriff auf dieses persönliche Postfach.')
    return { ...actor, ref, connectionId, connection: snap.data() }
  }
  const tokenRequest = async fields => {
    const c = config()
    const response = await http(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CLIENT, client_secret: c.secret, scope: SCOPES, ...fields }), signal: AbortSignal.timeout(20000) })
    if (!response.ok) fail('failed-precondition', 'Microsoft-Verbindung abgelaufen oder nicht freigegeben. Bitte erneut verbinden.')
    const result = await response.json()
    if (!result.access_token || (fields.grant_type === 'authorization_code' && !result.refresh_token)) fail('failed-precondition', 'Microsoft hat keine vollständige Verbindung bereitgestellt.')
    const scopes = new Set((result.scope || '').toLowerCase().split(' ').map(s => s.replace('https://graph.microsoft.com/', '')))
    if (!['mail.read', 'mail.send', 'user.read'].every(s => scopes.has(s))) fail('failed-precondition', 'Die erforderlichen Microsoft-Berechtigungen fehlen.')
    return { accessToken: result.access_token, refreshToken: result.refresh_token || fields.refresh_token, expiresAt: now() + Math.min(Number(result.expires_in) || 3600, 86400) * 1000 }
  }
  const accessToken = async context => {
    const saved = await store().read(context.connection.secretVersion)
    if (saved.expiresAt > now() + 60000) return saved.accessToken
    const lock = randomBytes(16).toString('hex')
    await db().runTransaction(async tx => {
      const current = (await tx.get(context.ref)).data()
      if (current?.ownerId !== context.uid || current.status !== 'connected') fail('permission-denied', 'Postfach wurde getrennt.')
      if (current.refreshUntil > now()) fail('aborted', 'Postfachverbindung wird gerade erneuert. Bitte erneut versuchen.')
      if (current.secretVersion !== context.connection.secretVersion) fail('aborted', 'Postfachverbindung wurde erneuert. Bitte erneut versuchen.')
      tx.update(context.ref, { refreshLock: lock, refreshUntil: now() + 60000 })
    })
    try {
      const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: saved.refreshToken })
      const version = await store().write(context.connection.secretName, tokens)
      const retirement = db().doc(`mailboxSecretRetirements/${digest(context.connection.secretVersion)}`)
      try {
        await db().runTransaction(async tx => {
          const current = (await tx.get(context.ref)).data()
          if (current?.refreshLock !== lock || current.status !== 'connected') fail('aborted', 'Postfachverbindung wurde geändert.')
          tx.update(context.ref, { secretVersion: version, refreshUntil: 0 })
          tx.set(retirement, { ownerId: context.uid, secretVersion: context.connection.secretVersion, expiresAt: now() })
        })
      } catch (error) {
        try { await store().destroy(version) } catch {
          await db().doc(`mailboxSecretRetirements/${digest(version)}`).set({ ownerId: context.uid, secretVersion: version, expiresAt: now() })
        }
        throw error
      }
      try {
        await store().destroy(context.connection.secretVersion)
        await retirement.delete()
      } catch {
        await diagnose({ stage: 'connect', code: 'retired_version_cleanup_pending', message: 'Alte Postfachzugangsdaten werden durch die geplante Bereinigung entfernt.', actorId: context.uid })
      }
      context.connection.secretVersion = version
      return tokens.accessToken
    } finally {
      await db().runTransaction(async tx => {
        const current = (await tx.get(context.ref)).data()
        if (current?.refreshLock === lock) tx.update(context.ref, { refreshUntil: 0 })
      })
    }
  }
  const graph = async (token, path, options = {}) => {
    const response = await http(`${GRAPH}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text", IdType="ImmutableId"', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000) })
    if (!response.ok) fail(response.status === 404 ? 'not-found' : response.status === 403 ? 'permission-denied' : 'unavailable', 'Microsoft konnte die Postfachanfrage nicht ausführen.', { technicalCode: `graph_http_${response.status}` })
    return response.status === 202 || response.status === 204 ? null : response.json()
  }
  const guarded = (stage, handler) => async request => {
    try { return await handler(request) } catch (error) {
      const technicalCode = typeof error?.details?.technicalCode === 'string' && /^[a-z0-9_]{1,80}$/.test(error.details.technicalCode) ? error.details.technicalCode : null
      if (technicalCode || !(error instanceof HttpsError) || ['unavailable', 'internal'].includes(error.code)) await diagnose({ stage, code: technicalCode || (error instanceof HttpsError ? error.code : 'unexpected_error'), message: 'Postfachaktion konnte nicht abgeschlossen werden.', actorId: request?.auth?.uid || '' })
      if (error instanceof HttpsError) throw error
      fail('unavailable', 'Postfachaktion konnte nicht abgeschlossen werden. Bitte erneut versuchen.')
    }
  }
  const draftRef = context => db().doc(`mailboxDrafts/${digest(`${context.uid}|${context.connectionId}|${id(context.messageId)}`)}`)
  const handlers = {
    beginMailboxConnection: guarded('connect', async request => {
      const { uid } = await check(request, true)
      const c = config()
      if (!c.secret || !c.testAccount || !c.redirect.startsWith('https://') || !c.origin.startsWith('https://')) fail('failed-precondition', 'Die Postfachanbindung ist noch nicht eingerichtet.')
      const proofChallenge = clean(request.data?.proofChallenge, 60)
      if (!/^[a-zA-Z0-9_-]{43}$/.test(proofChallenge)) fail('invalid-argument', 'Ungültige Browserbindung.')
      const state = randomBytes(32).toString('base64url')
      const verifier = randomBytes(48).toString('base64url')
      await db().doc(`mailboxOAuthStates/${digest(state)}`).create({ ownerId: uid, expiresAt: now() + 10 * 60000, verifier: seal(verifier, c.secret), proofChallenge, used: false })
      const params = new URLSearchParams({ client_id: CLIENT, response_type: 'code', redirect_uri: c.redirect, response_mode: 'query', scope: SCOPES, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account', login_hint: c.testAccount })
      return { authorizationUrl: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params}` }
    }),
    finishMailboxConnection: guarded('connect', async request => {
      const { uid } = await check(request, true)
      const ticket = clean(request.data?.ticket, 60)
      const proof = clean(request.data?.proof, 60)
      if (!/^[a-zA-Z0-9_-]{43}$/.test(ticket) || !/^[a-zA-Z0-9_-]{43}$/.test(proof)) fail('invalid-argument', 'Ungültige Browserbindung.')
      const pendingRef = db().doc(`mailboxOAuthPending/${digest(ticket)}`)
      let previousSecret = null
      const connectionId = await db().runTransaction(async tx => {
        const pending = (await tx.get(pendingRef)).data()
        if (!pending || pending.used || pending.expiresAt < now() || pending.ownerId !== uid || pending.proofChallenge !== createHash('sha256').update(proof).digest('base64url') || pending.email !== config().testAccount.toLowerCase().trim()) fail('permission-denied', 'Postfachverbindung abgelaufen oder nicht in diesem Browser gestartet.')
        const ref = db().doc(`mailboxConnections/${pending.connectionId}`)
        const previous = (await tx.get(ref)).data()
        previousSecret = previous?.secretName || null
        tx.set(ref, { ownerId: uid, tenantId: TENANT, graphUserId: pending.graphUserId, email: pending.email, displayName: pending.displayName, status: 'connected', secretName: pending.secretName, secretVersion: pending.secretVersion, connectedAt: now(), refreshUntil: 0, refreshLock: '' })
        tx.update(pendingRef, { used: true, retiredSecretName: previousSecret })
        return pending.connectionId
      })
      if (previousSecret) {
        try {
          await store().remove(previousSecret)
          await pendingRef.update({ retiredSecretName: null })
        } catch {
          await diagnose({ stage: 'connect', code: 'retired_secret_cleanup_pending', message: 'Alte Postfachzugangsdaten werden durch die geplante Bereinigung entfernt.', actorId: uid })
        }
      }
      return { connectionId }
    }),
    listMailboxConnections: guarded('list-connections', async request => {
      const { uid } = await check(request)
      const snapshots = await db().collection('mailboxConnections').where('ownerId', '==', uid).get()
      return { connections: snapshots.docs.filter(d => d.data().status === 'connected').map(d => ({ id: d.id, email: d.data().email, displayName: d.data().displayName, status: 'connected' })) }
    }),
    listMailboxMessages: guarded('list-messages', async request => {
      const context = await owned(request)
      let path = '/me/mailFolders/inbox/messages?$top=30&$orderby=receivedDateTime%20desc&$select=id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview'
      if (request.data.pageToken) {
        const token = clean(request.data.pageToken, 16000)
        const [encoded, signature] = token.split('.')
        const expected = createHmac('sha256', config().secret).update(`${context.uid}|${context.connectionId}|${encoded}`).digest('base64url')
        if (!encoded || signature !== expected) fail('invalid-argument', 'Ungültige Folgeseite.')
        const cursor = JSON.parse(Buffer.from(encoded, 'base64url').toString())
        if (!Number.isFinite(cursor.expiresAt) || cursor.expiresAt < now() || typeof cursor.path !== 'string') fail('invalid-argument', 'Folgeseite ist abgelaufen.')
        path = mailboxMessagePagePath(`${GRAPH}${cursor.path}`, context.connection)
      }
      const result = await graph(await accessToken(context), path)
      let nextPageToken = null
      if (result['@odata.nextLink']) {
        const nextPath = mailboxMessagePagePath(result['@odata.nextLink'], context.connection)
        const encoded = Buffer.from(JSON.stringify({ path: nextPath, expiresAt: now() + 30 * 60000 })).toString('base64url')
        nextPageToken = `${encoded}.${createHmac('sha256', config().secret).update(`${context.uid}|${context.connectionId}|${encoded}`).digest('base64url')}`
      }
      return { messages: result.value || [], nextPageToken }
    }),
    getMailboxMessage: guarded('read', async request => {
      const context = await owned(request)
      const token = await accessToken(context)
      const path = `/me/messages/${segment(request.data.messageId)}`
      const message = await graph(token, `${path}?$select=id,subject,from,sender,toRecipients,ccRecipients,bccRecipients,replyTo,receivedDateTime,isRead,hasAttachments,body,webLink`)
      if (message.body?.contentType?.toLowerCase() !== 'text') fail('unavailable', 'Microsoft hat keine sichere Textansicht geliefert.')
      const attachments = await graph(token, `${path}/attachments?$select=id,name,contentType,size,isInline&$top=100`)
      message.attachments = (attachments.value || []).map(a => ({ id: a.id, name: a.name, contentType: a.contentType, size: a.size, isInline: a.isInline, supported: a['@odata.type'] === '#microsoft.graph.fileAttachment' && a.size <= MAX_ATTACHMENT }))
      message.attachmentsTruncated = Boolean(attachments['@odata.nextLink'])
      return { message }
    }),
    getMailboxAttachment: guarded('attachment', async request => {
      const context = await owned(request)
      const token = await accessToken(context)
      const path = `/me/messages/${segment(request.data.messageId)}/attachments/${segment(request.data.attachmentId)}`
      const metadata = await graph(token, `${path}?$select=id,name,contentType,size`)
      if (metadata['@odata.type'] !== '#microsoft.graph.fileAttachment' || !Number.isFinite(metadata.size) || metadata.size > MAX_ATTACHMENT) fail('failed-precondition', 'Dieser Anhang kann hier nicht geöffnet werden (maximal 5 MB).')
      const result = await graph(token, path)
      if (typeof result.contentBytes !== 'string' || result.contentBytes.length > Math.ceil(MAX_ATTACHMENT / 3) * 4) fail('resource-exhausted', 'Der Anhang ist zu groß.')
      return { name: clean(result.name, 255), contentType: result.contentType, contentBase64: result.contentBytes }
    }),
    getMailboxDraft: guarded('draft-load', async request => {
      const context = await owned(request)
      const snapshot = await draftRef({ ...context, messageId: request.data.messageId }).get()
      if (!snapshot.exists) return { draft: null }
      const data = snapshot.data()
      const result = { ...data.draft }
      if (data.operationId) {
        const operation = await db().doc(`mailboxSendOperations/${digest(`${context.uid}|${data.operationId}`)}`).get()
        result.operationId = data.operationId
        result.sendStatus = operation.exists && operation.data().status === 'accepted' ? 'accepted' : 'unknown'
      }
      return { draft: result }
    }),
    saveMailboxDraft: guarded('draft-save', async request => {
      const context = await owned(request, true)
      const draft = validateMailboxDraft(request.data.draft)
      const revision = request.data.draft?.revision
      if (!Number.isSafeInteger(revision) || revision < 0) fail('invalid-argument', 'Ungültiger Entwurfsstand.')
      const ref = draftRef({ ...context, messageId: request.data.messageId })
      await db().runTransaction(async tx => {
        const previous = (await tx.get(ref)).data()
        if ((previous?.draft?.revision || 0) !== revision || previous?.operationId) fail('aborted', 'Der Entwurf wurde bereits geändert oder versendet. Bitte neu laden; Ihr Text bleibt erhalten.')
        draft.revision = revision + 1
        tx.set(ref, { ownerId: context.uid, connectionId: context.connectionId, messageId: id(request.data.messageId), draft, updatedAt: now() })
      })
      return { draft }
    }),
    sendMailboxReply: guarded('send', async request => {
      const context = await owned(request, true)
      const draft = validateMailboxDraft(request.data)
      assertTestRecipients(draft)
      if (!draft.body.trim()) fail('invalid-argument', 'Bitte einen Antworttext eingeben.')
      const operationId = clean(request.data.operationId, 80)
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(operationId)) fail('invalid-argument', 'Ungültige Versandreferenz.')
      const messageId = id(request.data.messageId)
      const revision = request.data.revision
      if (!Number.isSafeInteger(revision) || revision < 0) fail('invalid-argument', 'Ungültiger Entwurfsstand.')
      const fingerprint = digest(JSON.stringify({ connectionId: context.connectionId, messageId, draft }))
      const operation = db().doc(`mailboxSendOperations/${digest(`${context.uid}|${operationId}`)}`)
      const persistedDraft = draftRef({ ...context, messageId })
      const token = await accessToken(context)
      const existing = await db().runTransaction(async tx => {
        const previous = await tx.get(operation)
        if (previous.exists) {
          if (previous.data().fingerprint !== fingerprint) fail('already-exists', 'Diese Versandreferenz gehört zu einer anderen Antwort.')
          return previous.data().status === 'accepted' ? 'accepted' : 'unknown'
        }
        const liveConnection = (await tx.get(context.ref)).data()
        if (liveConnection?.status !== 'connected' || liveConnection.ownerId !== context.uid || liveConnection.secretVersion !== context.connection.secretVersion) fail('aborted', 'Postfachverbindung wurde geändert. Bitte erneut laden.')
        const previousDraft = (await tx.get(persistedDraft)).data()
        if ((previousDraft?.draft?.revision || 0) !== revision || previousDraft?.operationId) fail('aborted', 'Diese Nachricht wurde bereits bearbeitet oder eine Antwort wurde versendet. Bitte zuerst neu laden und den Versandstatus prüfen.')
        draft.revision = revision
        tx.create(operation, { ownerId: context.uid, connectionId: context.connectionId, fingerprint, status: 'pending', createdAt: now() })
        tx.set(persistedDraft, { ownerId: context.uid, connectionId: context.connectionId, messageId, draft, operationId, updatedAt: now() }, { merge: true })
        return null
      })
      if (existing) return { status: existing, operationId }
      try {
        // Explicit recipient arrays also override reply-all defaults: the domain restriction
        // is checked against every recipient that is actually submitted.
        await graph(token, `/me/messages/${segment(messageId)}/reply`, { method: 'POST', body: JSON.stringify({ message: { body: { contentType: 'Text', content: draft.body }, toRecipients: draft.toRecipients, ccRecipients: draft.ccRecipients, bccRecipients: draft.bccRecipients } }) })
        await operation.update({ status: 'accepted', finishedAt: now() })
        return { status: 'accepted', operationId }
      } catch {
        await operation.update({ status: 'unknown', finishedAt: now() })
        await diagnose({ stage: 'send', code: 'send_outcome_unknown', message: 'Versandstatus unklar. Vor erneutem Versand in Outlook prüfen.', actorId: context.uid, recordId: operationId })
        return { status: 'unknown', operationId }
      }
    }),
    disconnectMailbox: guarded('disconnect', async request => {
      const context = await owned(request, true, true)
      // Disable first: no further request can refresh/use this connection. A
      // failed secret deletion remains visible as an incomplete disconnection.
      await db().runTransaction(async tx => {
        const current = (await tx.get(context.ref)).data()
        if (current?.secretName !== context.connection.secretName || !['connected', 'disconnecting'].includes(current.status)) fail('aborted', 'Postfachverbindung wurde inzwischen geändert.')
        tx.update(context.ref, { status: 'disconnecting' })
      })
      await store().remove(context.connection.secretName)
      await db().runTransaction(async tx => {
        const current = (await tx.get(context.ref)).data()
        if (current?.secretName !== context.connection.secretName || !['disconnecting', 'disconnected'].includes(current.status)) fail('aborted', 'Postfach wurde inzwischen erneut verbunden.')
        tx.update(context.ref, { status: 'disconnected', disconnectedAt: now() })
      })
      return { disconnected: true }
    }),
  }
  handlers.mailboxOAuthCallback = async (req, res) => {
    let actorId = ''
    res.set('Cache-Control', 'no-store')
    res.set('Referrer-Policy', 'no-referrer')
    try {
      assertMailboxEnvironment(config().project)
      const state = clean(req.query?.state, 100)
      if (!/^[a-zA-Z0-9_-]{43}$/.test(state)) fail('invalid-argument', 'Ungültige Anmeldung.')
      const ref = db().doc(`mailboxOAuthStates/${digest(state)}`)
      const saved = await db().runTransaction(async tx => {
        const snapshot = await tx.get(ref)
        const value = snapshot.data()
        if (!snapshot.exists || value.used || value.expiresAt < now()) fail('permission-denied', 'Anmeldung abgelaufen oder bereits verwendet.')
        tx.update(ref, { used: true, verifier: null })
        return value
      })
      actorId = saved.ownerId
      await check({ auth: { uid: saved.ownerId } }, true)
      if (req.query.error || !clean(req.query.code, 10000)) fail('failed-precondition', 'Microsoft-Anmeldung wurde nicht abgeschlossen.')
      const tokens = await tokenRequest({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: config().redirect, code_verifier: unseal(saved.verifier, config().secret) })
      const me = await graph(tokens.accessToken, '/me?$select=id,mail,userPrincipalName,displayName')
      const email = address(me.mail || me.userPrincipalName)
      if (email !== config().testAccount.trim().toLowerCase() || !me.id) fail('permission-denied', 'Nur das freigegebene Testpostfach darf verbunden werden.')
      const connectionId = digest(`${saved.ownerId}|${TENANT}|${me.id}`)
      const secretName = `drehpunkt-mailbox-${connectionId}-${randomBytes(6).toString('hex')}`
      const secretVersion = await store().write(secretName, tokens, true)
      const ticket = randomBytes(32).toString('base64url')
      try {
        await db().doc(`mailboxOAuthPending/${digest(ticket)}`).create({ ownerId: saved.ownerId, connectionId, proofChallenge: saved.proofChallenge, graphUserId: me.id, email, displayName: clean(me.displayName, 200), secretName, secretVersion, expiresAt: now() + 10 * 60000, used: false })
      } catch (error) {
        await store().remove(secretName)
        throw error
      }
      const target = new URL('/postfaecher', config().origin)
      target.searchParams.set('connection', 'pending')
      target.searchParams.set('ticket', ticket)
      res.redirect(303, target.toString())
    } catch (error) {
      if (!(error instanceof HttpsError) || ['unavailable', 'internal'].includes(error.code)) await diagnose({ stage: 'connect', code: error instanceof HttpsError ? error.code : 'unexpected_error', message: 'Microsoft-Postfachverbindung konnte technisch nicht abgeschlossen werden.', actorId })
      // No provider description, code, state, token or mailbox content in logs.
      res.status(400).send('Postfach konnte nicht verbunden werden. Bitte Drehpunkt öffnen und die Verbindung erneut starten.')
    }
  }
  handlers.cleanupMailboxConnections = async () => {
    const project = deps.config?.project || runtimeProjectId()
    assertMailboxEnvironment(project)
    // Cleanup needs Secret Manager IAM, but never the Entra client secret.
    const cleanupStore = deps.secrets || secretStore(project)
    // Pending authorizations never become usable without the original browser's
    // proof. Expired credentials must also be removed from Secret Manager.
    const pending = await db().collection('mailboxOAuthPending').where('expiresAt', '<', now()).limit(100).get()
    for (const snapshot of pending.docs) {
      const value = snapshot.data()
      if (!value.used) await cleanupStore.remove(value.secretName)
      if (value.retiredSecretName) await cleanupStore.remove(value.retiredSecretName)
      await snapshot.ref.delete()
    }
    const states = await db().collection('mailboxOAuthStates').where('expiresAt', '<', now()).limit(100).get()
    for (const snapshot of states.docs) await snapshot.ref.delete()
    const retired = await db().collection('mailboxSecretRetirements').where('expiresAt', '<', now()).limit(100).get()
    for (const snapshot of retired.docs) {
      await cleanupStore.destroy(snapshot.data().secretVersion)
      await snapshot.ref.delete()
    }
  }
  return handlers
}

const handlers = createMailboxHandlers()
export const beginMailboxConnectionHandler = handlers.beginMailboxConnection
export const finishMailboxConnectionHandler = handlers.finishMailboxConnection
export const listMailboxConnectionsHandler = handlers.listMailboxConnections
export const listMailboxMessagesHandler = handlers.listMailboxMessages
export const getMailboxMessageHandler = handlers.getMailboxMessage
export const getMailboxAttachmentHandler = handlers.getMailboxAttachment
export const getMailboxDraftHandler = handlers.getMailboxDraft
export const saveMailboxDraftHandler = handlers.saveMailboxDraft
export const sendMailboxReplyHandler = handlers.sendMailboxReply
export const disconnectMailboxHandler = handlers.disconnectMailbox
export const mailboxOAuthCallbackHandler = handlers.mailboxOAuthCallback
export const cleanupMailboxConnectionsHandler = handlers.cleanupMailboxConnections
