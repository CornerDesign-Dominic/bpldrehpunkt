import { createHash } from 'node:crypto'
import { FieldPath, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { runtimeProjectId } from './externalEffects.js'
import { assertMailboxEnvironment } from './mailboxEnvironment.js'
import { assertMailboxActionAccess } from './mailboxActions.js'
import { recommendationScope } from './mailboxRecommendations.js'
import { isManagedRecommendationMailbox } from './mailboxRecommendationPolicy.js'
import { recommendationGraphHandler, resolveRecommendationMailboxIdentityHandler } from './mailboxes.js'
import { recordDiagnostic } from './diagnostics.js'

const hash = value => createHash('sha256').update(value).digest('hex')
const kinds = new Set(['tracking', 'order', 'invoice', 'terms', 'todo', 'damage', 'collection', 'court', 'calendar'])
const reasons = new Set(['wrong_action', 'no_action', 'already_done', 'misunderstood', 'other_action', 'other'])
const statuses = new Set(['new', 'reviewing', 'planned', 'verified', 'not_error'])
const outcomes = new Set(['rejected', 'missed'])
const fail = (code, message) => { throw new HttpsError(code, message) }
const isId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const plain = (value, max) => typeof value === 'string' && value.length <= max && [...value].every(character => {
  const code = character.charCodeAt(0)
  return [9, 10, 13].includes(code) || code >= 32 && code !== 127
})
const text = (value, max) => plain(value, max) ? value.trim() : ''
const revision = value => Number.isSafeInteger(value) && value > 0
const sourceId = value => /^(?:subject|body|forwarded|document-[12])$/.test(value || '') ? value : ''

// Quality receives only the bounded classification facts and original excerpts,
// never the original message, attachment binaries or Graph message identifiers.
export function sanitizeMailboxTriageDecision(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return null
  const answerKeys = new Set(['topic', 'messageType', 'requiredAction', 'deadline', 'references'])
  const answers = (Array.isArray(value.answers) ? value.answers : []).slice(0, 5).flatMap(item => {
    if (!answerKeys.has(item?.key) || !plain(item.value, 1000)) return []
    return [{ key: item.key, value: item.value.trim(), sourceId: sourceId(item.sourceId), quote: text(item.quote, 1000) }]
  })
  const actions = (Array.isArray(value.actions) ? value.actions : []).slice(0, 3).flatMap(item => {
    if (!kinds.has(item?.kind) || !['high', 'medium', 'low'].includes(item.confidence)) return []
    return [{ kind: item.kind, confidence: item.confidence, reason: text(item.reason, 1000), sourceId: sourceId(item.sourceId), quote: text(item.quote, 1000) }]
  })
  const coverage = value.coverage || {}
  const names = input => (Array.isArray(input) ? input : []).slice(0, 20).map(item => text(item, 255)).filter(Boolean)
  return {
    version: 1, ...(isId(value.id) ? { id: value.id } : {}),
    status: ['actionable', 'information', 'unclear', 'incomplete'].includes(value.status) ? value.status : 'unclear',
    answers, actions,
    coverage: { ...(coverage.mailTruncated === true ? { mailTruncated: true } : {}), mail: coverage.mail === true, forwarded: coverage.forwarded === true, attachments: ['not_present', 'not_read', 'partial', 'read'].includes(coverage.attachments) ? coverage.attachments : 'not_read', documentNames: names(coverage.documentNames), unreadable: names(coverage.unreadable) },
    ...(plain(value.model, 80) ? { model: value.model } : {}),
    ...(plain(value.promptVersion, 80) ? { promptVersion: value.promptVersion } : {}),
  }
}

function requireQuality(profile, edit = false, cleanup = false) {
  const permitted = (module, write = false) => profile?.role === 'superadmin' || (write ? profile?.permissions?.[module] === 'edit' : ['view', 'edit'].includes(profile?.permissions?.[module]))
  if (profile?.active !== true || !permitted('mailTriageQuality', edit) || cleanup && !permitted('mailTriageCleanup', true)) fail('permission-denied', 'Keine Berechtigung für die Auswertung der Maileinordnung.')
}

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const berlinDate = millis => {
  if (!Number.isFinite(millis)) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(millis))
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value || '').join('-')
}

export function createMailboxTriageFeedbackHandlers(deps = {}) {
  const db = () => deps.db || getFirestore()
  const now = () => deps.now?.() ?? Date.now()
  const collection = () => db().collection('mailboxTriageFeedback')
  const actor = async request => {
    assertMailboxEnvironment(deps.project || runtimeProjectId())
    if (!request?.auth?.uid) fail('unauthenticated', 'Anmeldung erforderlich.')
    const profile = await (deps.requireProfile || requireActiveProfile)(request)
    if (profile?.active !== true) fail('permission-denied', 'Dieses Benutzerkonto ist nicht freigegeben.')
    return { uid: request.auth.uid, profile }
  }
  const publicItem = snapshot => {
    const data = snapshot.data()
    if (!data) return null
    return { id: snapshot.id, scopeId: data.scopeId, messageKey: data.messageKey, mailboxEmail: text(data.mailboxEmail, 254), subject: text(data.subject, 500), kind: data.kind, outcome: data.outcome, reason: data.reason, correctKind: data.correctKind || null, comment: text(data.comment, 2000), decision: sanitizeMailboxTriageDecision(data.decision), status: data.status, reviewNote: text(data.reviewNote, 4000), createdAtMillis: data.createdAtMillis, updatedAtMillis: data.updatedAtMillis, revision: data.revision, createdBy: data.createdBy, reviewedBy: data.reviewedBy || null }
  }
  const submit = async request => {
    const current = await actor(request), input = request.data || {}
    if (!isId(input.connectionId) || !plain(input.messageId, 2048) || !input.messageId || !kinds.has(input.kind) || !outcomes.has(input.outcome) || !reasons.has(input.reason) || input.correctKind !== undefined && input.correctKind !== null && !kinds.has(input.correctKind) || input.comment !== undefined && !plain(input.comment, 2000) || input.decisionId !== undefined && !isId(input.decisionId) || input.decisionVersion !== undefined && (!Number.isSafeInteger(input.decisionVersion) || input.decisionVersion < 1)) fail('invalid-argument', 'Bitte eine gültige Rückmeldung erfassen.')
    if (input.outcome === 'rejected' && input.reason === 'other_action' && (!input.correctKind || input.correctKind === input.kind) || input.outcome === 'missed' && input.correctKind !== input.kind || input.reason === 'other' && !text(input.comment, 2000)) fail('invalid-argument', 'Bitte die richtige Aktion oder einen kurzen Grund angeben.')
    assertMailboxActionAccess(current.profile, input.kind)
    if (input.correctKind) assertMailboxActionAccess(current.profile, input.correctKind)
    const connectionRef = db().doc(`mailboxConnections/${input.connectionId}`)
    const connection = (await connectionRef.get()).data()
    if (!connection || connection.ownerId !== current.uid || connection.status !== 'connected') fail('permission-denied', 'Kein Zugriff auf dieses Postfach.')
    if (isManagedRecommendationMailbox(connection) && !connection.canonicalMailboxId) connection.canonicalMailboxId = await (deps.resolveMailboxIdentity || resolveRecommendationMailboxIdentityHandler)(input.connectionId)
    const scopeId = recommendationScope(connection)
    const scopeRef = db().doc(`mailboxRecommendationScopes/${scopeId}`)
    const messageKey = hash(input.messageId), messageRef = scopeRef.collection('messages').doc(messageKey)
    const stateRef = db().doc(`mailboxTriageFeedbackStates/${hash(`${current.uid}|${input.connectionId}|${input.messageId}`)}`)
    if (input.outcome === 'missed') {
      const [scope, message] = await Promise.all([scopeRef.get(), messageRef.get()])
      if (!scope.data()?.enabled || message.data()?.state !== 'completed' || message.data()?.generation !== scope.data()?.generation) {
        // A manual miss may have no classifier record. Confirm the message exists
        // in the owned mailbox, without retaining the returned mail contents.
        const mail = await (deps.graph || recommendationGraphHandler)({ connectionId: input.connectionId, operation: 'message', messageId: input.messageId })
        if (mail?.id !== input.messageId) fail('not-found', 'Die Nachricht ist nicht mehr verfügbar.')
      }
    }
    return db().runTransaction(async tx => {
      const refs = [db().doc(`users/${current.uid}`), connectionRef, scopeRef, messageRef, stateRef]
      if (connection.kind === 'shared' && connection.parentConnectionId) refs.push(db().doc(`mailboxConnections/${connection.parentConnectionId}`))
      const [userSnapshot, connectionSnapshot, scopeSnapshot, messageSnapshot, stateSnapshot, parentSnapshot] = await Promise.all(refs.map(ref => tx.get(ref)))
      const liveProfile = userSnapshot.data(), liveConnection = connectionSnapshot.data(), scope = scopeSnapshot.data(), message = messageSnapshot.data()
      assertMailboxActionAccess(liveProfile, input.kind)
      if (input.correctKind) assertMailboxActionAccess(liveProfile, input.correctKind)
      if (!liveConnection || liveConnection.ownerId !== current.uid || liveConnection.status !== 'connected' || liveConnection.graphUserId !== connection.graphUserId || liveConnection.tenantId !== connection.tenantId || liveConnection.kind !== connection.kind || liveConnection.canonicalMailboxId && liveConnection.canonicalMailboxId !== connection.canonicalMailboxId || liveConnection.parentConnectionId !== connection.parentConnectionId || connection.kind === 'shared' && (!parentSnapshot || parentSnapshot.data()?.ownerId !== current.uid || parentSnapshot.data()?.status !== 'connected')) fail('permission-denied', 'Die Postfachverbindung ist nicht mehr verfügbar.')
      const validMessage = message?.state === 'completed' && scope?.enabled === true && message.generation === scope.generation
      const decision = validMessage ? sanitizeMailboxTriageDecision(message.decision) : null
      if (input.decisionId !== undefined && input.decisionId !== decision?.id || input.decisionVersion !== undefined && input.decisionVersion !== decision?.version) fail('aborted', 'Die Maileinordnung wurde inzwischen geändert. Bitte erneut laden.')
      if (input.outcome === 'rejected' && (!validMessage || !Array.isArray(message.kinds) || !message.kinds.includes(input.kind))) fail('failed-precondition', 'Für diese Aktion liegt keine aktuelle Empfehlung vor.')
      const id = hash(`${current.uid}|${input.connectionId}|${input.messageId}|${input.kind}|${input.outcome}|${message?.generation || 'unclassified'}|${decision?.id || decision?.version || 0}`)
      const feedbackRef = collection().doc(id), existing = await tx.get(feedbackRef), state = stateSnapshot.data() || {}
      if (state.ownerId && (state.ownerId !== current.uid || state.connectionId !== input.connectionId || state.messageKey !== messageKey)) fail('permission-denied', 'Die Rückmeldung gehört zu einer anderen Nachricht.')
      const key = `${input.kind}_${input.outcome}`
      if (existing.exists || state.submittedIds?.[key] === id) return { feedbackId: id, suppressed: input.outcome === 'rejected' }
      const timestamp = now(), dismissedKinds = [...new Set([...(state.dismissedKinds || []).filter(kind => kinds.has(kind)), ...(input.outcome === 'rejected' ? [input.kind] : [])])]
      const submittedIds = Object.fromEntries(Object.entries(state.submittedIds || {}).filter(([key, value]) => /^(tracking|order|invoice|terms|todo|damage|collection|court|calendar)_(rejected|missed)$/.test(key) && isId(value)))
      submittedIds[key] = id
      tx.create(feedbackRef, { scopeId, messageKey, mailboxEmail: text(connection.email, 254).toLowerCase(), subject: text(message?.subject || message?.decision?.subject, 500), kind: input.kind, outcome: input.outcome, reason: input.reason, correctKind: input.correctKind || null, comment: text(input.comment, 2000), decision, status: 'new', reviewNote: '', createdAtMillis: timestamp, updatedAtMillis: timestamp, revision: 1, createdBy: current.uid })
      tx.set(stateRef, { ownerId: current.uid, connectionId: input.connectionId, messageKey, dismissedKinds, submittedIds, updatedAtMillis: timestamp })
      return { feedbackId: id, suppressed: input.outcome === 'rejected' }
    })
  }
  const list = async request => {
    const current = await actor(request)
    requireQuality(current.profile)
    const input = request.data || {}
    if (input.cursor && !isId(input.cursor) || input.status && !statuses.has(input.status) || input.outcome && !outcomes.has(input.outcome) || input.kind && !kinds.has(input.kind) || input.mailbox && !plain(input.mailbox, 254) || input.dateFrom && !validDate(input.dateFrom) || input.dateUntil && !validDate(input.dateUntil) || input.dateFrom && input.dateUntil && input.dateUntil < input.dateFrom) fail('invalid-argument', 'Bitte gültige Filter auswählen.')
    let query = collection().orderBy(FieldPath.documentId())
    if (input.cursor) query = query.startAfter(input.cursor)
    const snapshot = await query.limit(51).get(), page = snapshot.docs.slice(0, 50)
    const items = page.map(publicItem).filter(item => {
      const day = berlinDate(item.createdAtMillis)
      return (!input.status || item.status === input.status) && (!input.outcome || item.outcome === input.outcome) && (!input.kind || item.kind === input.kind) && (!input.mailbox || item.mailboxEmail === input.mailbox.trim().toLowerCase()) && (!input.dateFrom || day >= input.dateFrom) && (!input.dateUntil || day <= input.dateUntil)
    })
    const hasMore = snapshot.docs.length > 50
    return { items, hasMore, nextCursor: hasMore ? page.at(-1).id : null, scannedCount: page.length }
  }
  const update = async request => {
    const current = await actor(request)
    requireQuality(current.profile, true)
    const input = request.data || {}
    if (!isId(input.id) || !revision(input.revision) || !statuses.has(input.status) || !plain(input.reviewNote, 4000)) fail('invalid-argument', 'Bitte gültige Auswertungsdaten erfassen.')
    const ref = collection().doc(input.id)
    await db().runTransaction(async tx => {
      const [userSnapshot, snapshot] = await Promise.all([tx.get(db().doc(`users/${current.uid}`)), tx.get(ref)])
      requireQuality(userSnapshot.data(), true)
      if (!snapshot.exists) fail('not-found', 'Die Rückmeldung wurde gelöscht.')
      if (snapshot.data().revision !== input.revision) fail('aborted', 'Die Rückmeldung wurde inzwischen geändert. Bitte erneut laden.')
      tx.update(ref, { status: input.status, reviewNote: input.reviewNote.trim(), revision: input.revision + 1, updatedAtMillis: now(), reviewedBy: current.uid })
    })
    return { item: publicItem(await ref.get()) }
  }
  const remove = async request => {
    const current = await actor(request)
    requireQuality(current.profile, false, true)
    const items = request.data?.items
    if (!Array.isArray(items) || !items.length || items.length > 50 || items.some(item => !isId(item?.id) || !revision(item.revision)) || new Set(items.map(item => item.id)).size !== items.length) fail('invalid-argument', 'Bitte höchstens 50 eindeutige Rückmeldungen auswählen.')
    await db().runTransaction(async tx => {
      const [userSnapshot, ...snapshots] = await Promise.all([tx.get(db().doc(`users/${current.uid}`)), ...items.map(item => tx.get(collection().doc(item.id)))])
      requireQuality(userSnapshot.data(), false, true)
      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) fail('not-found', 'Eine Rückmeldung wurde bereits gelöscht. Bitte erneut laden.')
        if (snapshot.data().revision !== items[index].revision) fail('aborted', 'Eine Rückmeldung wurde inzwischen geändert. Bitte erneut laden.')
      })
      snapshots.forEach(snapshot => tx.delete(snapshot.ref))
    })
    return { deletedIds: items.map(item => item.id) }
  }
  const guard = (stage, operation) => async request => {
    try { return await operation(request) } catch (error) {
      if (!(error instanceof HttpsError) || ['internal', 'unavailable', 'deadline-exceeded'].includes(error.code)) {
        try { await (deps.diagnostic || (event => recordDiagnostic(event, db())))({ module: 'mailboxes', stage, code: 'mail_triage_feedback_failed', actorId: request?.auth?.uid || '', message: 'Die Maileinordnungs-Rückmeldung konnte nicht verarbeitet werden.' }) } catch { /* Diagnostics never replace the original failure. */ }
      }
      throw error
    }
  }
  return { submit: guard('triage-feedback', submit), list: guard('triage-quality', list), update: guard('triage-quality', update), remove: guard('triage-quality', remove) }
}

const handlers = createMailboxTriageFeedbackHandlers()
export const submitMailboxTriageFeedbackHandler = handlers.submit
export const listMailboxTriageFeedbackHandler = handlers.list
export const updateMailboxTriageFeedbackHandler = handlers.update
export const deleteMailboxTriageFeedbackHandler = handlers.remove
