import { Buffer } from 'node:buffer'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { assertMailboxAccess, assertMailboxEnvironment, recommendationGraphHandler, resolveRecommendationMailboxIdentityHandler } from './mailboxes.js'
import { runtimeProjectId } from './externalEffects.js'
import { isManagedRecommendationMailbox } from './mailboxRecommendationPolicy.js'
import { associateMailboxReplies } from './mailboxReplies.js'
import { cleanKnowledgeMailCopy } from './knowledgeTextClean.js'
import { recordDiagnostic } from './diagnostics.js'

const hash = value => createHash('sha256').update(value).digest('hex')
const validId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const validMessageId = value => typeof value === 'string' && value.length > 0 && value.length <= 2048 && ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
const admin = profile => profile?.active === true && ['admin', 'superadmin'].includes(profile.role)
const fail = (code, message) => { throw new HttpsError(code, message) }
const freshMs = 5 * 60_000
const field = (mail, name) => (mail.internetMessageHeaders || []).filter(item => item.name?.toLowerCase() === name).map(item => String(item.value || '')).join(' ')
const references = mail => {
  const direct = field(mail, 'in-reply-to').match(/<[^<>\s]{1,996}>/gu) || []
  if (direct.length > 1) return null
  return direct[0] || (field(mail, 'references').match(/<[^<>\s]{1,996}>/gu) || []).at(-1) || null
}

export function mailboxLearningScope(connection) {
  const managed = isManagedRecommendationMailbox(connection)
  if (!connection?.tenantId || !connection.email || (managed ? !connection.canonicalMailboxId : !connection.ownerId || !connection.graphUserId)) fail('failed-precondition', 'Postfachidentität fehlt. Bitte die Verbindung prüfen.')
  return hash(managed ? `${connection.tenantId}|shared|${connection.canonicalMailboxId}` : `${connection.tenantId}|personal|${connection.ownerId}|${connection.graphUserId}`)
}

export function eligibleLearningReply(mail, since, now = Date.now()) {
  const sent = Date.parse(mail?.sentDateTime)
  if (!mail || mail.isDraft !== false || !validMessageId(mail.id) || !Number.isFinite(since) || !Number.isFinite(sent) || sent < since || sent > now + 60_000 || now - sent > freshMs) return false
  const submitted = field(mail, 'auto-submitted').trim().toLowerCase()
  if (submitted && submitted !== 'no' || /multipart\/report|delivery-status|disposition-notification/iu.test(field(mail, 'content-type')) || field(mail, 'x-autoreply') || field(mail, 'x-autorespond')) return false
  if (/^\s*(?:fw|fwd|wg|tr|rv|vs)\s*:/iu.test(mail.subject || '')) return false
  if (/^\s*(?:automatic reply|automatische antwort|abwesenheitsnotiz|out of office|undeliverable|unzustellbar|delivery status notification|read receipt)\b/iu.test(mail.subject || '')) return false
  const body = cleanKnowledgeMailCopy(mail.body?.content || mail.bodyPreview || '').trim()
  if (!body || /^(?:(?:vielen|besten) dank(?: für (?:die|ihre|deine) (?:info(?:rmation)?(?:en)?|nachricht|rückmeldung))?|danke(?: schön)?|thank you(?: for (?:the|your) (?:message|information|update))?|thanks|received|erhalten|zur kenntnis genommen|acknowledged|ok|okay|empfang bestätigt)[.!\s]*$/iu.test(body)) return false
  return true
}

// A bounded exact RFC/conversation-index association. Never infer a parent from
// a similar subject or simply choose the latest message in a conversation.
export function learningReplyParent(reply, messages, sentFolderId) {
  const parents = messages.filter(mail => mail.id !== reply.id && mail.parentFolderId !== sentFolderId && mail.isDraft === false && Number.isFinite(Date.parse(mail.receivedDateTime)))
  const count = new Map()
  for (const mail of parents) if (mail.internetMessageId) count.set(mail.internetMessageId, (count.get(mail.internetMessageId) || 0) + 1)
  const uniqueParents = parents.filter(mail => !mail.internetMessageId || count.get(mail.internetMessageId) === 1)
  const sent = [reply, ...messages.filter(mail => mail.id !== reply.id && mail.parentFolderId === sentFolderId)]
  const linked = associateMailboxReplies(uniqueParents, sent)
  const matches = uniqueParents.filter(mail => linked[mail.id]?.some(item => item.id === reply.id))
  return matches.length === 1 ? matches[0] : null
}

export function createMailboxLearningHandlers(deps = {}) {
  const db = () => deps.db || getFirestore()
  const now = () => deps.now?.() ?? Date.now()
  const project = () => deps.project || runtimeProjectId()
  const environment = () => assertMailboxEnvironment(project())
  const graph = input => (deps.graph || recommendationGraphHandler)(input)
  const scopes = () => db().collection('mailboxLearningScopes')
  const subscriptions = () => db().collection('mailboxLearningSubscriptions')
  const profileFor = async request => { environment(); return (deps.requireProfile || requireActiveProfile)(request) }
  const connectionFor = async (request, edit = false) => {
    const profile = await profileFor(request)
    if (request.data?.managedScopeId !== undefined) {
      if (!admin(profile) || !validId(request.data.managedScopeId)) fail('permission-denied', 'Nur Admins dürfen gemeinsame Lerneinstellungen verwalten.')
      const scope = (await scopes().doc(request.data.managedScopeId).get()).data() || (await db().doc(`mailboxRecommendationScopes/${request.data.managedScopeId}`).get()).data()
      if (scope?.kind !== 'shared') fail('not-found', 'Gemeinsame Postfacheinstellung nicht gefunden.')
      return { profile, connection: { kind: 'shared', email: scope.email }, scopeId: request.data.managedScopeId, scopeOnly: true }
    }
    if (!validId(request.data?.connectionId)) fail('invalid-argument', 'Ungültige Postfachreferenz.')
    const snapshot = await db().doc(`mailboxConnections/${request.data.connectionId}`).get()
    const connection = snapshot.data()
    if (!connection || connection.status !== 'connected') fail('not-found', 'Postfach nicht verbunden.')
    const managed = isManagedRecommendationMailbox(connection)
    if (managed && edit && !admin(profile)) fail('permission-denied', 'Gemeinsame Postfächer werden ausschließlich durch Admins verwaltet.')
    if (!(managed && admin(profile))) {
      assertMailboxAccess(profile, edit)
      if (connection.ownerId !== request.auth?.uid) fail('permission-denied', 'Kein Zugriff auf dieses Postfach.')
      if (connection.kind === 'shared') {
        const parent = (await db().doc(`mailboxConnections/${connection.parentConnectionId}`).get()).data()
        if (parent?.ownerId !== request.auth.uid || parent.status !== 'connected') fail('permission-denied', 'Microsoft-Verbindung fehlt.')
      }
    }
    if (managed && !connection.canonicalMailboxId) connection.canonicalMailboxId = await (deps.resolveMailboxIdentity || resolveRecommendationMailboxIdentityHandler)(snapshot.id)
    return { profile, connection, scopeId: mailboxLearningScope(connection) }
  }
  const connectionsFor = async scope => {
    let candidates
    if (scope.kind !== 'shared') {
      const item = await db().doc(`mailboxConnections/${scope.connectionId}`).get()
      candidates = item.exists && item.data().status === 'connected' && item.data().ownerId === scope.ownerId ? [{ id: item.id, ...item.data() }] : []
    } else {
      const found = await db().collection('mailboxConnections').where('canonicalMailboxId', '==', scope.canonicalMailboxId).get()
      candidates = found.docs.filter(item => item.data().status === 'connected' && item.data().tenantId === scope.tenantId && isManagedRecommendationMailbox(item.data())).map(item => ({ id: item.id, ...item.data() })).sort((a, b) => a.id.localeCompare(b.id))
    }
    const eligible = []
    for (const candidate of candidates) {
      try { assertMailboxAccess((await db().doc(`users/${candidate.ownerId}`).get()).data(), true) } catch { continue }
      if (candidate.kind === 'shared') {
        const parent = (await db().doc(`mailboxConnections/${candidate.parentConnectionId}`).get()).data()
        if (parent?.ownerId !== candidate.ownerId || parent.status !== 'connected' || parent.kind === 'shared') continue
      }
      eligible.push(candidate)
    }
    return eligible
  }
  const graphFor = async (scope, input) => {
    const connections = await connectionsFor(scope)
    if (!connections.length) fail('failed-precondition', 'Keine aktive Postfachverbindung verfügbar.')
    return graph({ connectionId: connections[0].id, ...input })
  }
  const publicSetting = (connection, value, scopeId) => ({ enabled: value?.enabled === true, managed: isManagedRecommendationMailbox(connection), state: value?.state || 'idle', lastCapturedAt: value?.lastCapturedAt || null, scopeId })
  const diagnose = async (scope, code, stage = 'learning-capture') => {
    try { await (deps.diagnostic || (event => recordDiagnostic(event, db())))({ module: 'knowledgeGaps', stage, code, actorId: scope?.ownerId || scope?.updatedBy || '', message: 'Postfachantwort konnte nicht für die Wissenssammlung erfasst werden.' }) } catch { /* Diagnostics never create a retry or expose correspondence. */ }
  }
  const retire = async (scope, id) => {
    if (!id) return
    await subscriptions().doc(hash(id)).set({ active: false }, { merge: true })
    try { await graphFor(scope, { operation: 'delete', subscriptionId: id }) } catch { /* Registry blocks callbacks until the Microsoft subscription expires. */ }
  }
  const provision = async scopeId => {
    const ref = scopes().doc(scopeId), lease = randomUUID()
    const scope = await db().runTransaction(async tx => {
      const value = (await tx.get(ref)).data()
      if (!value?.enabled || value.setupUntil > now() || value.subscriptionId && value.subscriptionExpiresAt > now() + 86400000) return null
      tx.update(ref, { setupLease: lease, setupUntil: now() + 120000 })
      return value
    })
    if (!scope) return
    let created = false, subscription, clientStateHash
    try {
      const expirationDateTime = new Date(now() + 3 * 86400000).toISOString()
      if (scope.subscriptionId) {
        clientStateHash = (await subscriptions().doc(hash(scope.subscriptionId)).get()).data()?.clientStateHash
        if (clientStateHash) {
          try { subscription = await graphFor(scope, { operation: 'renew', subscriptionId: scope.subscriptionId, data: { expirationDateTime } }) }
          catch (error) { if (error.code !== 'not-found') throw error }
        }
      }
      if (!subscription) {
        const clientState = randomBytes(32).toString('base64url')
        clientStateHash = hash(clientState)
        const webhookUrl = `https://europe-west3-${project()}.cloudfunctions.net/mailboxLearningWebhook`
        subscription = await graphFor(scope, { operation: 'learning-create', data: { changeType: 'created', notificationUrl: webhookUrl, lifecycleNotificationUrl: webhookUrl, expirationDateTime, clientState, includeResourceData: false } })
        created = true
      }
      if (typeof subscription.id !== 'string' || !subscription.id || subscription.id.length > 256 || !clientStateHash || !Number.isFinite(Date.parse(subscription.expirationDateTime))) fail('unavailable', 'Ungültiges Microsoft-Abonnement.')
      const accepted = await db().runTransaction(async tx => {
        const current = (await tx.get(ref)).data()
        if (!current?.enabled || current.generation !== scope.generation || current.setupLease !== lease) return false
        tx.set(subscriptions().doc(hash(subscription.id)), { scopeId, subscriptionId: subscription.id, generation: scope.generation, clientStateHash, active: true, expiresAt: Date.parse(subscription.expirationDateTime) })
        tx.update(ref, { subscriptionId: subscription.id, subscriptionExpiresAt: Date.parse(subscription.expirationDateTime), setupLease: '', setupUntil: 0, state: 'active' })
        return true
      })
      if (!accepted && created) await retire(scope, subscription.id)
    } catch (error) {
      await db().runTransaction(async tx => {
        const current = (await tx.get(ref)).data()
        if (current?.setupLease === lease) tx.update(ref, { setupLease: '', setupUntil: 0, state: ['permission-denied', 'failed-precondition'].includes(error.code) ? 'permission_required' : 'error' })
      })
      await diagnose(scope, ['permission-denied', 'failed-precondition'].includes(error.code) ? 'permission-denied' : 'unavailable', 'learning-subscription')
    }
  }
  const getSettings = async request => {
    const { connection, scopeId } = await connectionFor(request)
    return publicSetting(connection, (await scopes().doc(scopeId).get()).data(), scopeId)
  }
  const setSettings = async request => {
    if (typeof request.data?.enabled !== 'boolean') fail('invalid-argument', 'Aktivierung fehlt.')
    const { connection, scopeId, scopeOnly } = await connectionFor(request, true)
    if (scopeOnly && request.data.enabled) fail('failed-precondition', 'Ohne aktive Postfachverbindung kann nur deaktiviert werden.')
    const ref = scopes().doc(scopeId)
    let retired
    await db().runTransaction(async tx => {
      const previous = (await tx.get(ref)).data()
      if (previous?.enabled === request.data.enabled) return
      retired = previous
      const managed = isManagedRecommendationMailbox(connection)
      tx.set(ref, { ...(scopeOnly ? { kind: 'shared', email: connection.email } : { kind: managed ? 'shared' : 'personal', email: connection.email.toLowerCase(), tenantId: connection.tenantId, canonicalMailboxId: connection.canonicalMailboxId || null, ownerId: managed ? null : connection.ownerId, connectionId: request.data.connectionId }), enabled: request.data.enabled, since: now(), generation: randomUUID(), subscriptionId: null, subscriptionExpiresAt: 0, setupUntil: 0, setupLease: '', state: request.data.enabled ? 'connecting' : 'idle', updatedAt: now(), updatedBy: request.auth.uid }, { merge: true })
    })
    if (retired?.subscriptionId) await retire(retired, retired.subscriptionId)
    if (request.data.enabled) await provision(scopeId)
    return publicSetting(connection, (await ref.get()).data(), scopeId)
  }
  const maintain = async () => {
    environment()
    const enabled = await scopes().where('enabled', '==', true).get()
    for (const item of enabled.docs) await provision(item.id)
    // Only renew subscriptions; never scan sent mail or recover missed events.
    const old = await db().collection('mailboxLearningRuns').where('createdAt', '<', now() - 86400000).limit(200).get()
    for (const item of old.docs) await item.ref.delete()
  }
  const webhook = async (request, response) => {
    environment()
    response.set('Cache-Control', 'no-store'); response.set('X-Content-Type-Options', 'nosniff')
    if (request.method !== 'POST') return response.status(405).send('')
    if (typeof request.query?.validationToken === 'string' && request.query.validationToken.length <= 2048) return response.status(200).type('text/plain').send(request.query.validationToken)
    const notifications = request.body?.value
    if (!Array.isArray(notifications) || notifications.length > 1000 || (request.rawBody?.length || 0) > 1048576) return response.status(400).send('')
    try {
      for (const item of notifications) {
        if (typeof item?.subscriptionId !== 'string' || item.subscriptionId.length > 256 || item.tenantId !== (deps.tenantId || 'b829bbdc-c0b7-4128-a341-6715a67b451b')) continue
        const registration = (await subscriptions().doc(hash(item.subscriptionId)).get()).data()
        if (!registration?.active || registration.expiresAt < now() || typeof item.clientState !== 'string' || item.clientState.length > 128 || !/^[a-f0-9]{64}$/.test(registration.clientStateHash || '') || !timingSafeEqual(Buffer.from(hash(item.clientState), 'hex'), Buffer.from(registration.clientStateHash, 'hex'))) continue
        const ref = scopes().doc(registration.scopeId), scope = (await ref.get()).data()
        if (!scope?.enabled || scope.generation !== registration.generation || scope.subscriptionId !== item.subscriptionId) continue
        if (item.lifecycleEvent) {
          if (item.lifecycleEvent === 'missed') await ref.update({ state: 'missed' })
          else if (['subscriptionRemoved', 'reauthorizationRequired'].includes(item.lifecycleEvent)) {
            await ref.update({ subscriptionExpiresAt: 0, ...(item.lifecycleEvent === 'subscriptionRemoved' ? { subscriptionId: null } : {}) })
            try { await db().doc(`mailboxLearningRuns/${hash(`${registration.scopeId}|${scope.generation}|renew|${Math.floor(now() / 60000)}`)}`).create({ type: 'renew', scopeId: registration.scopeId, generation: scope.generation, createdAt: now() }) } catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error }
          }
          continue
        }
        if (item.changeType !== 'created' || !validMessageId(item.resourceData?.id)) continue
        try { await db().doc(`mailboxLearningRuns/${hash(`${registration.scopeId}|${scope.generation}|${item.resourceData.id}`)}`).create({ type: 'message', scopeId: registration.scopeId, generation: scope.generation, messageId: item.resourceData.id, createdAt: now() }) } catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error }
      }
      return response.status(202).send('')
    } catch { return response.status(503).send('') }
  }
  const process = async run => {
    environment()
    if (!validId(run?.scopeId)) return
    const ref = scopes().doc(run.scopeId), scope = (await ref.get()).data()
    if (!scope?.enabled || scope.generation !== run.generation) return
    if (run.type === 'renew') { await provision(run.scopeId); return }
    if (run.type !== 'message' || !validMessageId(run.messageId) || !Number.isFinite(run.createdAt) || now() - run.createdAt > freshMs) return
    let claimRef, lease
    try {
      const { message: reply, sentFolderId } = await graphFor(scope, { operation: 'learning-sent', messageId: run.messageId })
      if (!eligibleLearningReply(reply, scope.since, now()) || !sentFolderId || reply.parentFolderId !== sentFolderId) return
      // Send-as copies in a user's SentItems do not inherit that user's consent.
      // Only the mailbox visible as the actual From identity may supply cases.
      if (typeof reply.from?.emailAddress?.address !== 'string' || reply.from.emailAddress.address.trim().toLowerCase() !== scope.email?.toLowerCase()) return
      const stableId = typeof reply.internetMessageId === 'string' && /^<[^<>\s]{1,996}>$/u.test(reply.internetMessageId) ? reply.internetMessageId : reply.id
      claimRef = ref.collection('replies').doc(hash(stableId)); lease = randomUUID()
      const claimed = await db().runTransaction(async tx => {
        const current = (await tx.get(ref)).data(), existing = (await tx.get(claimRef)).data()
        if (!current?.enabled || current.generation !== run.generation || existing) return false
        tx.create(claimRef, { state: 'running', generation: run.generation, lease, createdAt: now() })
        return true
      })
      if (!claimed) return
      const referenceId = references(reply)
      let messages = referenceId ? (await graphFor(scope, { operation: 'learning-parents', referenceId })).value || [] : []
      let incoming = learningReplyParent(reply, messages, sentFolderId)
      if (!incoming && typeof reply.conversationId === 'string' && reply.conversationId && reply.conversationId.length <= 1024) {
        messages = (await graphFor(scope, { operation: 'learning-parents', conversationId: reply.conversationId })).value || []
        incoming = learningReplyParent(reply, messages, sentFolderId)
      }
      let captured = false
      if (incoming) {
        const current = (await ref.get()).data()
        if (current?.enabled && current.generation === run.generation) {
          const connection = (await connectionsFor(scope))[0]
          if (!connection) fail('failed-precondition', 'Keine aktive Postfachverbindung verfügbar.')
          const capture = deps.capture || (await import('./mailboxSentLearning.js')).captureSentMailboxLearning
          const result = await capture({ db: db(), scope, scopeId: run.scopeId, generation: run.generation, connection, incoming, reply, now: now() })
          captured = result?.captured !== false && result?.skipped !== true
        }
      }
      await db().runTransaction(async tx => {
        const current = (await tx.get(ref)).data(), claim = (await tx.get(claimRef)).data()
        if (claim?.lease !== lease) return
        tx.update(claimRef, { state: captured ? 'captured' : 'skipped', finishedAt: now(), lease: '' })
        if (current?.enabled && current.generation === run.generation) tx.update(ref, { ...(captured ? { lastCapturedAt: now() } : {}), state: 'active' })
      })
    } catch (error) {
      if (claimRef) await claimRef.set({ state: 'failed', finishedAt: now(), lease: '' }, { merge: true })
      await db().runTransaction(async tx => {
        const current = (await tx.get(ref)).data()
        if (current?.enabled && current.generation === run.generation) tx.update(ref, { state: 'error' })
      })
      await diagnose(scope, ['permission-denied', 'failed-precondition'].includes(error.code) ? 'permission-denied' : 'unavailable')
    }
  }
  return { getSettings, setSettings, maintain, webhook, process, provision }
}

const handlers = createMailboxLearningHandlers()
export const getMailboxLearningSettingsHandler = handlers.getSettings
export const setMailboxLearningSettingsHandler = handlers.setSettings
export const mailboxLearningWebhookHandler = handlers.webhook
export const maintainMailboxLearningSubscriptionsHandler = handlers.maintain
export const processMailboxLearningRunHandler = event => event.data ? handlers.process(event.data.data()) : handlers.process(event)
