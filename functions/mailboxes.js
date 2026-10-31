import { listMailboxReplies } from './mailboxReplies.js'
import { hasReplyKnowledgeAccess, loadReplyKnowledge, selectReplyKnowledge, recordReplyKnowledgeGap, replySuggestionHash, publicReplyKnowledge } from './knowledgeReply.js'
import { generateReplySuggestion, validateReplySuggestionInput, validateReplySuggestion } from './mailboxReplySuggestions.js'
import { searchMailboxOrderCustomers, assignMailboxOrderCustomer } from './mailboxCustomerSearch.js'
import { assertInvoiceReviewAccess, reviewMailboxInvoices } from './invoiceReview.js'
import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { getApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { defineSecret, defineString } from 'firebase-functions/params'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'
import { runtimeProjectId } from './externalEffects.js'
import { assertPersonalTrackingAccess, previewPersonalMailTracking, applyPersonalMailTracking } from './personalMailTracking.js'
import { assertMailboxAgbAccess, validateAgbAttachments, analyzeMailboxAgb, assignMailboxAgbCustomer } from './mailboxAgb.js'
import { assertMailboxOrderAccess, previewMailboxOrderCapture, exportMailboxOrderCapture } from './mailboxOrderCapture.js'

export const mailboxClientSecret = defineSecret('MAILBOX_CLIENT_SECRET')
export const mailboxRedirectUri = defineString('MAILBOX_REDIRECT_URI', { default: '' })
export const mailboxFrontendOrigin = defineString('MAILBOX_FRONTEND_ORIGIN', { default: '' })
// Legacy deployment parameter; it no longer restricts which tenant users can connect.
export const mailboxTestAccount = defineString('MAILBOX_TEST_ACCOUNT', { default: '' })
// EUR was explicitly confirmed by the user as the DyCoS company currency.
export const mailboxOrderCompanyCurrency = defineString('MAILBOX_ORDER_COMPANY_CURRENCY', { default: 'EUR' })
const TENANT = 'b829bbdc-c0b7-4128-a341-6715a67b451b'
const CLIENT = 'a23dc8d8-e22a-40ef-997c-d28aa753ee29'
const SCOPES = 'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read.Shared https://graph.microsoft.com/Mail.Send.Shared offline_access'
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
  const suggestionFields = {}
  for (const [key, max] of [['suggestion', 6000], ['suggestionInstruction', 1000]]) {
    if (data[key] !== undefined) {
      if (typeof data[key] !== 'string' || data[key].length > max || data[key].includes('\0')) fail('invalid-argument', 'Ungültiger Antwortvorschlag.')
      suggestionFields[key] = data[key]
    }
  }
  return { ...suggestionFields, toRecipients: recipients('toRecipients'), ccRecipients: recipients('ccRecipients'), bccRecipients: recipients('bccRecipients'), body: data.body, replyAll: data.replyAll === true }
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
    if (resource[1].toLowerCase() === 'me' && connection?.kind === 'shared') throw new Error('foreign-mailbox')
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
    const context = { ...actor, ref, connectionId, connection: snap.data() }
    if (context.connection.kind === 'shared' && !disconnecting) {
      const parentId = context.connection.parentConnectionId
      if (!/^[a-f0-9]{64}$/.test(parentId || '')) fail('permission-denied', 'Die persönliche Microsoft-Verbindung fehlt.')
      const parentRef = db().doc(`mailboxConnections/${parentId}`)
      const parent = (await parentRef.get()).data()
      if (parent?.ownerId !== actor.uid || parent.kind === 'shared' || parent.status !== 'connected') fail('failed-precondition', 'Bitte zuerst das zugehörige persönliche Microsoft-Konto verbinden.')
      context.credential = { ...actor, ref: parentRef, connectionId: parentId, connection: parent }
    }
    return context
  }
  const mailboxPath = context => context.connection.kind === 'shared' ? `/users/${segment(context.connection.graphUserId)}` : '/me'
  const tokenRequest = async fields => {
    const c = config()
    const response = await http(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CLIENT, client_secret: c.secret, scope: SCOPES, ...fields }), signal: AbortSignal.timeout(20000) })
    if (!response.ok) fail('failed-precondition', 'Microsoft-Verbindung abgelaufen oder nicht freigegeben. Bitte erneut verbinden.')
    const result = await response.json()
    if (!result.access_token || (fields.grant_type === 'authorization_code' && !result.refresh_token)) fail('failed-precondition', 'Microsoft hat keine vollständige Verbindung bereitgestellt.')
    const scopes = new Set((result.scope || '').toLowerCase().split(' ').map(s => s.replace('https://graph.microsoft.com/', '')))
    if (!['mail.read', 'mail.send', 'user.read'].every(s => scopes.has(s))) fail('failed-precondition', 'Die erforderlichen Microsoft-Berechtigungen fehlen.')
    return { accessToken: result.access_token, refreshToken: result.refresh_token || fields.refresh_token, scopes: [...scopes], expiresAt: now() + Math.min(Number(result.expires_in) || 3600, 86400) * 1000 }
  }
  const accessToken = async context => {
    if (context.credential) return accessToken(context.credential)
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
  const orderPdf = async (context, token, messageId, attachmentId) => {
    const path = `${mailboxPath(context)}/messages/${segment(messageId)}/attachments/${segment(attachmentId)}`
    const metadata = await graph(token, `${path}?$select=id,name,contentType,size`)
    if (metadata['@odata.type'] !== '#microsoft.graph.fileAttachment' || !Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > MAX_ATTACHMENT || !(metadata.contentType?.split(';')[0].toLowerCase() === 'application/pdf' || /\.pdf$/i.test(metadata.name || ''))) fail('failed-precondition', 'Es sind nur PDF-Dateianhänge bis 5 MiB unterstützt.')
    const file = await graph(token, path)
    if (typeof file.contentBytes !== 'string' || file.contentBytes.length > Math.ceil(MAX_ATTACHMENT / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.contentBytes)) fail('failed-precondition', 'Der PDF-Anhang ist ungültig oder zu groß.')
    const bytes = Buffer.from(file.contentBytes, 'base64')
    if (!bytes.length || bytes.length > MAX_ATTACHMENT || !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-')) || bytes.toString('base64') !== file.contentBytes) fail('failed-precondition', 'Der Anhang enthält keine unterstützte PDF-Datei.')
    return { id: id(attachmentId), name: clean(file.name || metadata.name, 255) || 'Auftrag.pdf', contentBytes: file.contentBytes }
  }
  const handlers = {
    beginMailboxConnection: guarded('connect', async request => {
      const { uid, profile } = await check(request, true)
      const c = config()
      if (!c.secret || !c.redirect.startsWith('https://') || !c.origin.startsWith('https://')) fail('failed-precondition', 'Die Postfachanbindung ist noch nicht eingerichtet.')
      const proofChallenge = clean(request.data?.proofChallenge, 60)
      if (!/^[a-zA-Z0-9_-]{43}$/.test(proofChallenge)) fail('invalid-argument', 'Ungültige Browserbindung.')
      const state = randomBytes(32).toString('base64url')
      const verifier = randomBytes(48).toString('base64url')
      await db().doc(`mailboxOAuthStates/${digest(state)}`).create({ ownerId: uid, expiresAt: now() + 10 * 60000, verifier: seal(verifier, c.secret), proofChallenge, used: false })
      const params = new URLSearchParams({ client_id: CLIENT, response_type: 'code', redirect_uri: c.redirect, response_mode: 'query', scope: SCOPES, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account', ...((request.data?.loginHint || profile.email) ? { login_hint: address(request.data?.loginHint || profile.email) } : {}) })
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
        if (!pending || pending.used || pending.expiresAt < now() || pending.ownerId !== uid || pending.proofChallenge !== createHash('sha256').update(proof).digest('base64url')) fail('permission-denied', 'Postfachverbindung abgelaufen oder nicht in diesem Browser gestartet.')
        const ref = db().doc(`mailboxConnections/${pending.connectionId}`)
        const previous = (await tx.get(ref)).data()
        previousSecret = previous?.secretName || null
        tx.set(ref, { ownerId: uid, kind: 'personal', sharedAccess: pending.sharedAccess === true, tenantId: TENANT, graphUserId: pending.graphUserId, email: pending.email, displayName: pending.displayName, customName: typeof previous?.customName === 'string' ? previous.customName : '', status: 'connected', secretName: pending.secretName, secretVersion: pending.secretVersion, connectedAt: now(), refreshUntil: 0, refreshLock: '' })
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
      const available = new Map(snapshots.docs.map(doc => [doc.id, doc.data()]))
      return { connections: snapshots.docs.filter(doc => {
        const item = doc.data()
        return ['connected', 'disconnecting'].includes(item.status) && (item.kind !== 'shared' || available.get(item.parentConnectionId)?.status === 'connected')
      }).map(doc => {
        const item = doc.data()
        return { id: doc.id, email: item.email, displayName: item.displayName, customName: typeof item.customName === 'string' ? item.customName : '', status: item.status, kind: item.kind === 'shared' ? 'shared' : 'personal', sharedAccess: item.sharedAccess === true, ...(item.kind === 'shared' ? { parentConnectionId: item.parentConnectionId, parentEmail: available.get(item.parentConnectionId)?.email || '' } : {}) }
      }) }

    }),
    addSharedMailbox: guarded('shared-connect', async request => {
      const context = await owned(request, true)
      if (context.connection.kind === 'shared') fail('invalid-argument', 'Bitte ein persönliches Microsoft-Konto auswählen.')
      if (context.connection.sharedAccess !== true) fail('failed-precondition', 'Bitte das persönliche Microsoft-Konto erneut verbinden und die Freigabe für geteilte Postfächer bestätigen.')
      const email = address(request.data.email)
      if (email === context.connection.email?.toLowerCase()) fail('invalid-argument', 'Dieses persönliche Postfach ist bereits verbunden.')
      const customName = request.data.customName ?? ''
      if (typeof customName !== 'string' || customName.length > 80 || [...customName].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) fail('invalid-argument', 'Der Postfachname darf höchstens 80 Zeichen enthalten.')
      // No directory enumeration or elevated application permission: Exchange verifies the delegate's inbox access.
      await graph(await accessToken(context), `/users/${segment(email)}/mailFolders/inbox/messages?$top=1&$select=id`)
      const connectionId = digest(`${context.uid}|${TENANT}|shared|${context.connectionId}|${email}`)
      await db().runTransaction(async tx => {
        const liveParent = (await tx.get(context.ref)).data()
        if (liveParent?.ownerId !== context.uid || liveParent.status !== 'connected' || liveParent.secretVersion !== context.connection.secretVersion) fail('aborted', 'Das Microsoft-Konto wurde inzwischen geändert. Bitte erneut versuchen.')
        const ref = db().doc(`mailboxConnections/${connectionId}`)
        const previous = (await tx.get(ref)).data()
        tx.set(ref, { ownerId: context.uid, kind: 'shared', tenantId: TENANT, parentConnectionId: context.connectionId, graphUserId: email, email, displayName: email, customName: customName.trim() || previous?.customName || '', status: 'connected', connectedAt: now() })
      })
      return { connectionId }
    }),
    updateMailboxName: guarded('rename', async request => {
      const context = await owned(request, true)
      const customName = request.data?.customName
      if (typeof customName !== 'string' || customName.length > 80 || [...customName].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) fail('invalid-argument', 'Der Postfachname darf höchstens 80 Zeichen und keine Steuerzeichen enthalten.')
      const normalized = customName.trim()
      await db().runTransaction(async tx => {
        const current = (await tx.get(context.ref)).data()
        if (current?.ownerId !== context.uid || current.status !== 'connected') fail('aborted', 'Die Postfachverbindung wurde inzwischen geändert. Bitte erneut laden.')
        tx.update(context.ref, { customName: normalized, nameUpdatedAt: now() })
      })
      return { customName: normalized }
    }),
    previewMailboxTracking: guarded('tracking-preview', async request => {
      const context = await owned(request, true)
      assertPersonalTrackingAccess(context)
      const messageId = segment(request.data?.messageId)
      const mail = await graph(await accessToken(context), `${mailboxPath(context)}/messages/${messageId}?$select=id,subject,body,from,receivedDateTime,internetMessageId`)
      return previewPersonalMailTracking({ db: db(), context, mail, orderNumber: request.data?.orderNumber, inferOrder: deps.inferOrder, infer: deps.inferTracking, now: now() })
    }),
    applyMailboxTracking: guarded('tracking-apply', async request => {
      const context = await owned(request, true)
      return applyPersonalMailTracking({ db: db(), context, previewId: request.data?.previewId, changes: request.data?.changes, transitEntries: request.data?.transitEntries, now: now() })
    }),
    reviewMailboxInvoices: guarded('invoice-review', async request => {
      const context = await owned(request, true)
      assertInvoiceReviewAccess(context)
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(request.data?.operationId || '')) fail('invalid-argument', 'Ungültige Prüfanfrage.')
      const messageId = id(request.data?.messageId)
      const token = await accessToken(context)
      const list = await graph(token, `${mailboxPath(context)}/messages/${segment(messageId)}/attachments?$select=id,name,contentType,size,isInline&$top=100`)
      const available = validateAgbAttachments(list, 'Rechnungsprüfung')
      const files = []
      for (const file of available) files.push(await orderPdf(context, token, messageId, file.id))
      return reviewMailboxInvoices({ db: db(), context, files, operationId: request.data?.operationId, now: now(), infer: deps.inferInvoices, extract: deps.extractInvoicePdf, fetchOrder: deps.fetchInvoiceOrder, revalidate: async () => { assertInvoiceReviewAccess(await owned(request, true)) } })
    }),
    listTransportInvoiceChecks: guarded('invoice-history', async request => {
      assertMailboxEnvironment(deps.config?.project || runtimeProjectId())
      const profile = await (deps.requireProfile || requireActiveProfile)(request)
      if (profile.active !== true || !(profile.role === 'superadmin' || ['view', 'edit'].includes(profile.permissions?.transportOrders))) fail('permission-denied', 'Keine Berechtigung für Transportaufträge.')
      const orderId = id(request.data?.orderId)
      if (orderId.includes('/')) fail('invalid-argument', 'Ungültiger Auftrag.')
      const order = await db().doc(`transportOrders/${orderId}`).get()
      if (!order.exists) fail('not-found', 'Auftrag nicht gefunden.')
      const entries = await db().collection(`transportOrders/${orderId}/invoiceChecks`).orderBy('createdAt', 'desc').limit(20).get()
      const reports = await Promise.all(entries.docs.map(async entry => (await db().doc(`invoiceCheckReports/${entry.data().reportId}`).get()).data()?.report))
      return { reports: reports.filter(Boolean) }
    }),
    analyzeMailboxAgb: guarded('agb-analyse', async request => {
      const context = await owned(request, true)
      assertMailboxAgbAccess(context)
      const messageId = id(request.data?.messageId)
      const token = await accessToken(context)
      const list = await graph(token, `${mailboxPath(context)}/messages/${segment(messageId)}/attachments?$select=id,name,contentType,size,isInline&$top=100`)
      const available = validateAgbAttachments(list)
      const files = []
      for (const file of available) files.push(await orderPdf(context, token, messageId, file.id))
      return analyzeMailboxAgb({ db: db(), context, files, now: now(), extract: deps.extractAgbPdf, analyze: deps.analyzeAgbText })
    }),
    assignMailboxAgbCustomer: guarded('agb-customer', async request => {
      const context = await owned(request, true)
      return assignMailboxAgbCustomer({ db: db(), context, data: request.data })
    }),
    previewMailboxOrder: guarded('order-preview', async request => {
      const context = await owned(request, true)
      assertMailboxOrderAccess(context)
      const messageId = id(request.data?.messageId)
      const token = await accessToken(context)
      const path = `${mailboxPath(context)}/messages/${segment(messageId)}`
      const mail = await graph(token, `${path}?$select=id,subject,body,from,receivedDateTime`)
      const list = await graph(token, `${path}/attachments?$select=id,name,contentType,size,isInline&$top=100`)
      if (list['@odata.nextLink']) fail('failed-precondition', 'Die Anhangsliste ist unvollständig. Bitte die Nachricht mit weniger Anlagen erneut bereitstellen.')
      const available = (list.value || []).filter(file => !file.isInline && (file.contentType?.split(';')[0].toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name || '')))
      const selected = request.data?.selectedPdfIds
      if (selected !== undefined && (!Array.isArray(selected) || selected.length > 5 || selected.some(value => typeof value !== 'string') || new Set(selected).size !== selected.length || selected.some(value => !available.some(file => file.id === value)))) fail('invalid-argument', 'Bitte gültige PDF-Anlagen dieser Nachricht auswählen.')
      const chosen = selected === undefined ? available : available.filter(file => selected.includes(file.id))
      if (!chosen.length) fail('failed-precondition', 'Für die Auftragserfassung ist mindestens ein Original-PDF erforderlich.')
      if (chosen.length > 5 || chosen.reduce((sum, file) => sum + (Number(file.size) || 0), 0) > 15 * 1024 * 1024) fail('failed-precondition', 'Bitte höchstens fünf PDF-Anlagen mit insgesamt maximal 15 MiB auswählen.')
      const files = []
      for (const file of chosen) files.push(await orderPdf(context, token, messageId, file.id))
      const result = await (deps.previewOrderCapture || previewMailboxOrderCapture)({ db: db(), context, mail, files, infer: deps.inferMailboxOrder, now: now() })
      return { ...result, companyCurrency: deps.companyCurrency ?? mailboxOrderCompanyCurrency.value() }
    }),
    assignMailboxOrderCustomer: guarded('order-customer-assign', async request => {
      const context = await owned(request, true)
      assertMailboxOrderAccess(context)
      return assignMailboxOrderCustomer({ db: db(), context, data: request.data, fetchPartner: deps.fetchCustomerPartner, now: now() })
    }),
    searchMailboxOrderCustomers: guarded('order-customer-search', async request => {
      const context = await owned(request, true)
      assertMailboxOrderAccess(context)
      return searchMailboxOrderCustomers({ db: db(), context, data: request.data, fetchMatches: deps.fetchCustomerMatches, now: now() })
    }),
    exportMailboxOrder: guarded('order-export', async request => {
      const context = await owned(request, true)
      assertMailboxOrderAccess(context)
      const originalPdf = await orderPdf(context, await accessToken(context), id(request.data?.messageId), id(request.data?.originalAttachmentId))
      return (deps.exportOrderCapture || exportMailboxOrderCapture)({ db: db(), context, data: request.data, originalPdf, now: now(), companyCurrency: deps.companyCurrency ?? mailboxOrderCompanyCurrency.value() })
    }),
    listMailboxMessages: guarded('list-messages', async request => {
      const context = await owned(request)
      const rawSearch = request.data.search ?? ''
      if (typeof rawSearch !== 'string' || rawSearch.length > 200 || [...rawSearch].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) fail('invalid-argument', 'Der Suchbegriff darf höchstens 200 Zeichen und keine Steuerzeichen enthalten.')
      const search = rawSearch.trim()
      const searchHash = digest(search)
      const query = new URLSearchParams({ '$top': '30', '$select': 'id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview' })
      if (search) query.set('$search', JSON.stringify(search))
      else query.set('$orderby', 'receivedDateTime desc')
      let path = `${mailboxPath(context)}/mailFolders/inbox/messages?${query}`
      if (request.data.pageToken) {
        const token = clean(request.data.pageToken, 16000)
        const [encoded, signature] = token.split('.')
        const expected = createHmac('sha256', config().secret).update(`${context.uid}|${context.connectionId}|${encoded}`).digest('base64url')
        if (!encoded || signature !== expected) fail('invalid-argument', 'Ungültige Folgeseite.')
        const cursor = JSON.parse(Buffer.from(encoded, 'base64url').toString())
        if (!Number.isFinite(cursor.expiresAt) || cursor.expiresAt < now() || typeof cursor.path !== 'string') fail('invalid-argument', 'Folgeseite ist abgelaufen.')
        if ((cursor.searchHash || digest('')) !== searchHash) fail('invalid-argument', 'Die Folgeseite gehört zu einer anderen Suche.')
        path = mailboxMessagePagePath(`${GRAPH}${cursor.path}`, context.connection)
      }
      const result = await graph(await accessToken(context), path)
      let nextPageToken = null
      if (result['@odata.nextLink']) {
        const nextPath = mailboxMessagePagePath(result['@odata.nextLink'], context.connection)
        const encoded = Buffer.from(JSON.stringify({ path: nextPath, searchHash, expiresAt: now() + 30 * 60000 })).toString('base64url')
        nextPageToken = `${encoded}.${createHmac('sha256', config().secret).update(`${context.uid}|${context.connectionId}|${encoded}`).digest('base64url')}`
      }
      return { messages: result.value || [], nextPageToken }
    }),
    listMailboxReplies: guarded('sent-replies', async request => {
      const context = await owned(request)
      const token = await accessToken(context)
      return listMailboxReplies({ ids: request.data.messageIds, base: mailboxPath(context), validatePage: value => mailboxMessagePagePath(value, context.connection), graph: (path, options) => graph(token, path, options) })
    }),
    getMailboxMessage: guarded('read', async request => {
      const context = await owned(request)
      const token = await accessToken(context)
      const path = `${mailboxPath(context)}/messages/${segment(request.data.messageId)}`
      const message = await graph(token, `${path}?$select=id,subject,from,sender,toRecipients,ccRecipients,bccRecipients,replyTo,receivedDateTime,sentDateTime,isRead,hasAttachments,body,webLink`)
      if (message.body?.contentType?.toLowerCase() !== 'text') fail('unavailable', 'Microsoft hat keine sichere Textansicht geliefert.')
      const attachments = await graph(token, `${path}/attachments?$select=id,name,contentType,size,isInline&$top=100`)
      message.attachments = (attachments.value || []).map(a => ({ id: a.id, name: a.name, contentType: a.contentType, size: a.size, isInline: a.isInline, supported: a['@odata.type'] === '#microsoft.graph.fileAttachment' && a.size <= MAX_ATTACHMENT }))
      message.attachmentsTruncated = Boolean(attachments['@odata.nextLink'])
      return { message }
    }),
    getMailboxAttachment: guarded('attachment', async request => {
      const context = await owned(request)
      const token = await accessToken(context)
      const path = `${mailboxPath(context)}/messages/${segment(request.data.messageId)}/attachments/${segment(request.data.attachmentId)}`
      const metadata = await graph(token, `${path}?$select=id,name,contentType,size`)
      if (metadata['@odata.type'] !== '#microsoft.graph.fileAttachment' || !Number.isFinite(metadata.size) || metadata.size > MAX_ATTACHMENT) fail('failed-precondition', 'Dieser Anhang kann hier nicht geöffnet werden (maximal 5 MB).')
      const result = await graph(token, path)
      if (typeof result.contentBytes !== 'string' || result.contentBytes.length > Math.ceil(MAX_ATTACHMENT / 3) * 4) fail('resource-exhausted', 'Der Anhang ist zu groß.')
      return { name: clean(result.name, 255), contentType: result.contentType, contentBase64: result.contentBytes }
    }),
    suggestMailboxReply: guarded('reply-suggestion', async request => {
      const context = await owned(request, true)
      const messageId = id(request.data.messageId)
      const input = validateReplySuggestionInput(request.data)
      const quotaRef = db().doc(`mailboxReplyQuotas/${digest(context.uid)}`)
      const mailKey = digest(`${context.connectionId}|${messageId}`)
      const lock = randomBytes(16).toString('hex')
      const ref = draftRef({ ...context, messageId })
      await db().runTransaction(async tx => {
        const quota = (await tx.get(quotaRef)).data() || {}
        const draft = (await tx.get(ref)).data()
        if (draft?.operationId) fail('failed-precondition', 'Für diese Nachricht wurde bereits eine Antwort versendet oder der Versand gestartet.')
        const attempts = (quota.attempts || []).filter(at => at > now() - 3600000)
        const running = Object.fromEntries(Object.entries(quota.running || {}).filter(([, value]) => value.until > now()))
        if (running[mailKey]) fail('already-exists', 'Für diese Nachricht wird bereits ein Vorschlag erstellt.')
        if (attempts.length >= 20) fail('resource-exhausted', 'Du kannst bis zu 20 Vorschläge pro Stunde erstellen. Bitte später erneut versuchen.')
        running[mailKey] = { lock, until: now() + 180000 }
        tx.set(quotaRef, { attempts: [...attempts, now()], running, expiresAt: now() + 7200000 })
      })
      try {
        const mail = await graph(await accessToken(context), `${mailboxPath(context)}/messages/${segment(messageId)}?$select=id,subject,body,from,bodyPreview`)
        const catalog = await (deps.loadReplyKnowledge || loadReplyKnowledge)(db(), context.profile)
        const selection = catalog ? await (deps.selectReplyKnowledge || selectReplyKnowledge)({ catalog, mail, userId: context.uid }) : null
        const suggestion = validateReplySuggestion(await (deps.generateReplySuggestion || generateReplySuggestion)({ mail, input, userId: context.uid, knowledge: selection }))
        const current = await owned(request, true)
        if ((await ref.get()).data()?.operationId) fail('aborted', 'Die Antwort wurde inzwischen versendet. Der Vorschlag wird nicht übernommen.')
        if (selection && !hasReplyKnowledgeAccess(current.profile)) fail('permission-denied', 'Die Wissensberechtigung wurde inzwischen geändert.')
        const knowledge = { status: !selection || selection.limited || selection.coverage === 'uncertain' ? 'unavailable' : selection.coverage === 'full' ? 'grounded' : 'unmatched', sources: (selection?.sources || []).map(({ id, kind, revision, title }) => ({ id, kind, revision, title })), warnings: [...(!selection ? ['knowledge_access_unavailable'] : []), ...(selection?.limited ? ['knowledge_search_limited'] : []), ...(selection?.coverage === 'uncertain' ? ['knowledge_match_uncertain'] : [])] }
        await db().runTransaction(async tx => {
          const sourceRefs = (selection?.sources || []).map(source => db().doc(`${source.kind === 'article' ? 'knowledgeArticles' : 'knowledgeRules'}/${source.id}`))
          const [draftSnapshot, connectionSnapshot, profileSnapshot, ...sources] = await Promise.all([
            tx.get(ref), tx.get(context.ref), ...(selection ? [tx.get(db().doc(`users/${context.uid}`))] : [Promise.resolve(null)]), ...sourceRefs.map(reference => tx.get(reference)),
          ])
          if (draftSnapshot.data()?.operationId) fail('aborted', 'Die Antwort wurde inzwischen versendet. Der Vorschlag wird nicht übernommen.')
          if (connectionSnapshot.data()?.ownerId !== context.uid || connectionSnapshot.data()?.status !== 'connected') fail('permission-denied', 'Die Postfachverbindung wurde inzwischen geändert.')
          if (selection) {
            assertMailboxAccess(profileSnapshot.data(), true)
            if (!hasReplyKnowledgeAccess(profileSnapshot.data())) fail('permission-denied', 'Die Wissensberechtigung wurde inzwischen geändert.')
            if (sources.some((snapshot, index) => snapshot.data()?.status !== 'valid' || snapshot.data()?.revision !== selection.sources[index].revision)) fail('aborted', 'Das verwendete Wissen wurde inzwischen geändert. Bitte einen neuen Vorschlag erstellen.')
          }
          const previousEvidenceId = /^[a-f0-9]{64}$/.test(draftSnapshot.data()?.knowledgeEvidenceId || '') ? draftSnapshot.data().knowledgeEvidenceId : ''
          const previousEvidence = previousEvidenceId ? await tx.get(db().doc(`knowledgeGapEvidence/${previousEvidenceId}`)) : null
          const gap = selection ? await (deps.recordReplyKnowledgeGap || recordReplyKnowledgeGap)({ db: db(), profile: profileSnapshot.data(), context, mail: { ...mail, id: mail.id || messageId }, selection, catalog, suggestion, transaction: tx }) : null
          const evidenceId = gap?.evidenceId || previousEvidenceId
          if (!gap?.evidenceId && previousEvidence?.exists) tx.set(db().doc(`knowledgeGapEvidence/${previousEvidenceId}`), { ...previousEvidence.data(), latestSuggestion: suggestion, suggestionAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
          tx.set(ref, { ownerId: context.uid, connectionId: context.connectionId, messageId, lastSuggestion: { hash: replySuggestionHash(suggestion), knowledge }, ...(evidenceId ? { knowledgeEvidenceId: evidenceId } : {}) }, { merge: true })
        })
        return { suggestion, knowledge: publicReplyKnowledge(knowledge) }
      } finally {
        await db().runTransaction(async tx => {
          const quota = (await tx.get(quotaRef)).data()
          if (quota?.running?.[mailKey]?.lock === lock) {
            const running = { ...quota.running }
            delete running[mailKey]
            tx.update(quotaRef, { running })
          }
        })
      }
    }),
    getMailboxDraft: guarded('draft-load', async request => {
      const context = await owned(request)
      const snapshot = await draftRef({ ...context, messageId: request.data.messageId }).get()
      if (!snapshot.exists) return { draft: null }
      const data = snapshot.data()
      if (!data.draft) return { draft: null }
      const result = { ...data.draft }
      delete result.suggestionKnowledge
      if (hasReplyKnowledgeAccess(context.profile) && data.lastSuggestion?.hash === replySuggestionHash(result.suggestion || '')) result.suggestionKnowledge = publicReplyKnowledge(data.lastSuggestion.knowledge)
      if (data.operationId) {
        const operation = await db().doc(`mailboxSendOperations/${digest(`${context.uid}|${data.operationId}`)}`).get()
        result.operationId = data.operationId
        result.sendStatus = operation.exists && operation.data().status === 'accepted' ? 'accepted' : 'unknown'
        if (result.sendStatus === 'accepted') { result.body = ''; result.suggestion = ''; result.suggestionInstruction = ''; delete result.suggestionKnowledge }
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
        const lastSuggestion = previous?.lastSuggestion?.hash === replySuggestionHash(draft.suggestion || '') ? previous.lastSuggestion : null
        if ((previous?.draft?.revision || 0) !== revision || previous?.operationId) fail('aborted', 'Der Entwurf wurde bereits geändert oder versendet. Bitte neu laden; Ihr Text bleibt erhalten.')
        draft.revision = revision + 1
        tx.set(ref, { ownerId: context.uid, connectionId: context.connectionId, messageId: id(request.data.messageId), draft, updatedAt: now(), ...(lastSuggestion ? { lastSuggestion } : {}), ...(/^[a-f0-9]{64}$/.test(previous?.knowledgeEvidenceId || '') ? { knowledgeEvidenceId: previous.knowledgeEvidenceId } : {}) })
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
        if (context.credential) {
          const parent = (await tx.get(context.credential.ref)).data()
          if (parent?.ownerId !== context.uid || parent.status !== 'connected' || parent.secretVersion !== context.credential.connection.secretVersion || liveConnection.parentConnectionId !== context.credential.connectionId) fail('aborted', 'Das persönliche Microsoft-Konto wurde geändert. Bitte erneut laden.')
        }
        const previousDraft = (await tx.get(persistedDraft)).data()
        if ((previousDraft?.draft?.revision || 0) !== revision || previousDraft?.operationId) fail('aborted', 'Diese Nachricht wurde bereits bearbeitet oder eine Antwort wurde versendet. Bitte zuerst neu laden und den Versandstatus prüfen.')
        const evidenceId = /^[a-f0-9]{64}$/.test(previousDraft?.knowledgeEvidenceId || '') ? previousDraft.knowledgeEvidenceId : ''
        const evidence = evidenceId ? await tx.get(db().doc(`knowledgeGapEvidence/${evidenceId}`)) : null
        draft.revision = revision
        if (evidence?.exists) tx.set(db().doc(`knowledgeGapEvidence/${evidenceId}`), { ...evidence.data(), sentReply: draft.body, sentAt: null, sendStatus: 'unknown', updatedAt: FieldValue.serverTimestamp() })
        tx.create(operation, { ownerId: context.uid, connectionId: context.connectionId, fingerprint, status: 'pending', createdAt: now(), ...(evidence?.exists ? { knowledgeEvidenceId: evidenceId } : {}) })
        tx.set(persistedDraft, { ownerId: context.uid, connectionId: context.connectionId, messageId, draft, operationId, updatedAt: now() }, { merge: true })
        return null
      })
      if (existing) return { status: existing, operationId }
      try {
        // Explicit recipient arrays also override reply-all defaults: the domain restriction
        // is checked against every recipient that is actually submitted.
        await graph(token, `${mailboxPath(context)}/messages/${segment(messageId)}/reply`, { method: 'POST', body: JSON.stringify({ message: { ...(context.connection.kind === 'shared' ? { from: { emailAddress: { address: context.connection.email } } } : {}), body: { contentType: 'Text', content: draft.body }, toRecipients: draft.toRecipients, ccRecipients: draft.ccRecipients, bccRecipients: draft.bccRecipients } }) })
        await operation.update({ status: 'accepted', finishedAt: now() })
        // An evidence update must never turn an accepted Graph send into an unknown/retriable outcome.
        try {
          const receipt = (await operation.get()).data()
          if (receipt?.knowledgeEvidenceId) await db().doc(`knowledgeGapEvidence/${receipt.knowledgeEvidenceId}`).update({ sendStatus: 'accepted', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
        } catch {
          await diagnose({ stage: 'send', code: 'knowledge_evidence_ack_failed', message: 'Antwort wurde zum Versand angenommen; Nachweisstatus konnte nicht aktualisiert werden.', actorId: context.uid, recordId: operationId }).catch(() => {})
        }
        // Preserve the send receipt, but remove sent text and AI drafting metadata.
        try { await persistedDraft.update({ draft: { ...draft, body: '', suggestion: '', suggestionInstruction: '' } }) } catch { /* Accepted receipt remains authoritative; reads suppress sent text. */ }
        return { status: 'accepted', operationId }
      } catch {
        await operation.update({ status: 'unknown', finishedAt: now() })
        await diagnose({ stage: 'send', code: 'send_outcome_unknown', message: 'Versandstatus unklar. Vor erneutem Versand in Outlook prüfen.', actorId: context.uid, recordId: operationId })
        return { status: 'unknown', operationId }
      }
    }),
    disconnectMailbox: guarded('disconnect', async request => {
      const context = await owned(request, true, true)
      if (context.connection.kind === 'shared') {
        await db().runTransaction(async tx => {
          const current = (await tx.get(context.ref)).data()
          if (current?.ownerId !== context.uid || current.kind !== 'shared') fail('permission-denied', 'Kein Zugriff auf dieses Postfach.')
          tx.update(context.ref, { status: 'disconnected', disconnectedAt: now() })
        })
        return { disconnected: true }
      }
      // Disable first: no further request can refresh/use this connection. A
      // failed secret deletion remains visible as an incomplete disconnection.
      await db().runTransaction(async tx => {
        const current = (await tx.get(context.ref)).data()
        if (current?.secretName !== context.connection.secretName || !['connected', 'disconnecting'].includes(current.status)) fail('aborted', 'Postfachverbindung wurde inzwischen geändert.')
        const children = await tx.get(db().collection('mailboxConnections').where('parentConnectionId', '==', context.connectionId))
        for (const child of children.docs) if (child.data().ownerId === context.uid && child.data().kind === 'shared') tx.update(child.ref, { status: 'disconnected', disconnectedAt: now() })
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
      if (!clean(me.id, 128)) fail('permission-denied', 'Microsoft hat kein gültiges Benutzerkonto geliefert.')
      const connectionId = digest(`${saved.ownerId}|${TENANT}|${me.id}`)
      const secretName = `drehpunkt-mailbox-${connectionId}-${randomBytes(6).toString('hex')}`
      const secretVersion = await store().write(secretName, tokens, true)
      const ticket = randomBytes(32).toString('base64url')
      try {
        await db().doc(`mailboxOAuthPending/${digest(ticket)}`).create({ ownerId: saved.ownerId, connectionId, proofChallenge: saved.proofChallenge, sharedAccess: ['mail.read.shared', 'mail.send.shared'].every(scope => tokens.scopes.includes(scope)), graphUserId: me.id, email, displayName: clean(me.displayName, 200), secretName, secretVersion, expiresAt: now() + 10 * 60000, used: false })
      } catch (error) {
        await store().remove(secretName)
        throw error
      }
      const target = new URL('/profil', config().origin)
      target.searchParams.set('connection', 'pending')
      target.searchParams.set('ticket', ticket)
      target.hash = 'postfaecher'
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
    const previews = await db().collection('mailboxTrackingPreviews').where('expiresAt', '<', now()).limit(100).get()
    for (const snapshot of previews.docs) await snapshot.ref.delete()
    for (const collection of ['mailboxReplyQuotas', 'mailboxOrderPreviews', 'mailboxOrderQuotas', 'mailboxOrderExports', 'mailboxActionRuns']) {
      const expired = await db().collection(collection).where('expiresAt', '<', now()).limit(100).get()
      for (const snapshot of expired.docs) await snapshot.ref.delete()
    }
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
export const addSharedMailboxHandler = handlers.addSharedMailbox
export const updateMailboxNameHandler = handlers.updateMailboxName
export const previewMailboxTrackingHandler = handlers.previewMailboxTracking
export const applyMailboxTrackingHandler = handlers.applyMailboxTracking
export const previewMailboxOrderHandler = handlers.previewMailboxOrder
export const exportMailboxOrderHandler = handlers.exportMailboxOrder
export const listMailboxMessagesHandler = handlers.listMailboxMessages
export const listMailboxRepliesHandler = handlers.listMailboxReplies
export const getMailboxMessageHandler = handlers.getMailboxMessage
export const getMailboxAttachmentHandler = handlers.getMailboxAttachment
export const suggestMailboxReplyHandler = handlers.suggestMailboxReply
export const getMailboxDraftHandler = handlers.getMailboxDraft
export const saveMailboxDraftHandler = handlers.saveMailboxDraft
export const sendMailboxReplyHandler = handlers.sendMailboxReply
export const disconnectMailboxHandler = handlers.disconnectMailbox
export const mailboxOAuthCallbackHandler = handlers.mailboxOAuthCallback
export const cleanupMailboxConnectionsHandler = handlers.cleanupMailboxConnections

export const analyzeMailboxAgbHandler = handlers.analyzeMailboxAgb
export const assignMailboxAgbCustomerHandler = handlers.assignMailboxAgbCustomer

export const reviewMailboxInvoicesHandler = handlers.reviewMailboxInvoices
export const listTransportInvoiceChecksHandler = handlers.listTransportInvoiceChecks

export const searchMailboxOrderCustomersHandler = handlers.searchMailboxOrderCustomers

export const assignMailboxOrderCustomerHandler = handlers.assignMailboxOrderCustomer
