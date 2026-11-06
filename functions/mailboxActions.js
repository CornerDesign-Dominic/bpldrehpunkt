import { recordDiagnostic } from './diagnostics.js'
import { createHash, randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { runtimeProjectId } from './externalEffects.js'
import { assertMailboxEnvironment } from './mailboxEnvironment.js'
import { managedActionScope } from './mailboxSharedActions.js'
import { isManagedRecommendationMailbox } from './mailboxRecommendationPolicy.js'
import { mailboxRecordKinds } from './shared/mailboxRecordFields.js'

const hash = value => createHash('sha256').update(value).digest('hex')
const fail = (code, message) => { throw new HttpsError(code, message) }
const kinds = new Set(['order', 'tracking', 'terms', 'invoice', ...Object.keys(mailboxRecordKinds)])
const maxRunningMs = 12 * 60_000
const persistentExpiry = Number.MAX_SAFE_INTEGER
const validText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
const publicError = error => error instanceof HttpsError ? { code: error.code, message: error.message } : { code: 'unavailable', message: 'Die Auswertung konnte nicht abgeschlossen werden. Bitte erneut versuchen.' }
const serializable = value => JSON.parse(JSON.stringify(value))

export function assertMailboxActionAccess(profile, kind, edit = true) {
  const allowed = module => profile?.role === 'superadmin' || (edit && module === 'mailboxes' ? profile?.permissions?.[module] === 'edit' : ['view', 'edit'].includes(profile?.permissions?.[module]))
  if (profile?.active !== true || !allowed('mailboxes')) fail('permission-denied', 'Keine Berechtigung für diese Postfachaktion.')
  if (kind === 'terms' && !allowed('agbChecker') || ['order', 'tracking', 'invoice'].includes(kind) && !(profile.role === 'superadmin' || profile.permissions?.transportOrders === 'edit') || kind === 'order' && !allowed('masterData')) fail('permission-denied', 'Keine Berechtigung für diese Postfachaktion.')
  if (mailboxRecordKinds[kind] && !(profile.role === 'superadmin' || (kind === 'calendar' || !edit ? ['view', 'edit'].includes(profile.permissions?.[mailboxRecordKinds[kind].module]) : profile.permissions?.[mailboxRecordKinds[kind].module] === 'edit'))) fail('permission-denied', 'Keine Berechtigung für diese Postfachaktion.')
}

export function createMailboxActionHandlers(deps = {}) {
  const db = () => deps.db || getFirestore()
  const now = () => deps.now?.() ?? Date.now()
  const environment = () => assertMailboxEnvironment(deps.project || runtimeProjectId())
  const context = async (request, kind, edit = true) => {
    environment()
    const profile = await (deps.requireProfile || requireActiveProfile)(request)
    assertMailboxActionAccess(profile, kind, edit)
    const connectionId = request.data?.connectionId
    if (!/^[a-f0-9]{64}$/.test(connectionId || '')) fail('invalid-argument', 'Ungültige Postfachreferenz.')
    const connection = (await db().doc(`mailboxConnections/${connectionId}`).get()).data()
    if (!connection || connection.ownerId !== request.auth?.uid || connection.status !== 'connected') fail('permission-denied', 'Kein Zugriff auf dieses persönliche Postfach.')
    if (connection.kind === 'shared') {
      const parent = (await db().doc(`mailboxConnections/${connection.parentConnectionId}`).get()).data()
      if (parent?.ownerId !== request.auth.uid || parent.status !== 'connected' || parent.kind === 'shared') fail('permission-denied', 'Microsoft-Verbindung fehlt.')
    }
    if (isManagedRecommendationMailbox(connection) && !connection.canonicalMailboxId) {
      const resolveIdentity = deps.resolveMailboxIdentity || (await import('./mailboxes.js')).resolveRecommendationMailboxIdentityHandler
      connection.canonicalMailboxId = await resolveIdentity(connectionId)
      if (!managedActionScope(connection)) fail('failed-precondition', 'Die gemeinsame Postfachidentität konnte nicht bestätigt werden. Bitte die Verbindung prüfen.')
    }
    return { uid: request.auth.uid, connectionId, connection, profile }
  }
  const actionIdentity = data => {
    if (!kinds.has(data?.kind) || !validText(data?.messageId, 2048)) fail('invalid-argument', 'Ungültige Postfachaktion.')
    return { messageId: data.messageId, kind: data.kind }
  }
  const collection = (actor, shared = false) => db().collection(`mailboxActionScopes/${shared ? managedActionScope(actor.connection) : hash(`${actor.uid}|${actor.connectionId}`)}/actions`)
  const usesShared = (actor, kind) => ['tracking', 'terms', 'invoice'].includes(kind) && Boolean(managedActionScope(actor.connection))
  const refFor = async (actor, data, starting = false) => {
    const legacy = collection(actor).doc(hash(`${data.messageId}|${data.kind}`))
    if (!usesShared(actor, data.kind)) return legacy
    const central = collection(actor, true).doc(hash(`${data.messageId}|${data.kind}`))
    // Preserve results produced before central slots were introduced. New work always shares one slot.
    const previous = await legacy.get()
    if ((await central.get()).exists) return central
    if (starting && (!previous.exists || ['failed', 'discarded'].includes(previous.data().state) || data.restart === true || data.force === true)) return central
    return previous.exists ? legacy : central
  }
  const output = (ref, value, includeResult = true, actor = null) => {
    if (!value) return null
    const { input: _input, ownerId: _owner, ...action } = value
    void _input; void _owner
    // Old invoice runs auto-completed after extraction, before manual review existed.
    if (action.kind === 'invoice' && action.state === 'completed' && action.completion?.invoiceReviewed !== true) action.state = 'review'
    if (!includeResult) delete action.result
    return { ...action, ...(actor ? { connectionId: actor.connectionId } : {}), id: ref.id, updatedAtMillis: action.updatedAt }
  }
  const expectedMessageKey = (actor, messageId) => hash(`${actor.connection.tenantId || ''}|${actor.connection.graphUserId}|${messageId}`)
  const completion = async (actor, action, transaction = null) => {
    if (mailboxRecordKinds[action.kind] && action.result?.previewId) {
      const ref = db().doc(`mailboxRecordApplications/${action.result.previewId}`)
      const receipt = (await (transaction ? transaction.get(ref) : ref.get())).data()
      return receipt?.ownerId === actor.uid && receipt.connectionId === actor.connectionId && receipt.jobId === action.jobId && receipt.kind === action.kind ? receipt.result : null
    }
    if (!['order', 'tracking'].includes(action.kind) || !action.result?.previewId) return null
    const previewId = action.result.previewId
    const prefix = action.kind === 'order' ? 'mailboxOrderPreviews' : 'mailboxTrackingPreviews'
    const read = ref => transaction ? transaction.get(ref) : ref.get()
    const preview = (await read(db().doc(`${prefix}/${previewId}`))).data()
    const shared = preview && action.sharedScopeId && action.sharedScopeId === managedActionScope(actor.connection) && preview.actionJobId === action.jobId
    if (!preview || (!shared && (preview.ownerId !== actor.uid || preview.connectionId !== actor.connectionId || preview.messageKey !== expectedMessageKey(actor, action.messageId)))) return null
    if (action.kind === 'order') {
      const receipt = (await read(db().doc(`mailboxOrderExports/${previewId}`))).data()
      if (receipt?.ownerId === actor.uid && receipt.connectionId === actor.connectionId && receipt.previewId === previewId && receipt.messageKey === preview.messageKey) return { exportId: receipt.exportId, operationId: receipt.operationId }
      return preview.exportedAt && preview.exportId ? { exportId: preview.exportId } : null
    }
    const receipt = (await read(db().doc(`personalMailTrackingApplications/${preview.messageKey}`))).data()
    return (receipt?.ownerId === actor.uid || shared && receipt?.sharedScopeId === action.sharedScopeId) && receipt.orderId === preview.orderId ? { orderId: receipt.orderId, orderNumber: receipt.orderNumber, appliedChanges: receipt.appliedChanges || null, appliedTransitEntries: receipt.appliedTransitEntries || null } : null
  }
  const retirePreview = async (actor, action, tx) => {
    if (!action?.result?.previewId || !['order', 'tracking', ...Object.keys(mailboxRecordKinds)].includes(action.kind)) return
    const prefix = mailboxRecordKinds[action.kind] ? 'mailboxRecordPreviews' : action.kind === 'order' ? 'mailboxOrderPreviews' : 'mailboxTrackingPreviews'
    const ref = db().doc(`${prefix}/${action.result.previewId}`)
    const preview = (await tx.get(ref)).data()
    if (preview?.actionJobId === action.jobId && (preview.ownerId === actor.uid && preview.connectionId === actor.connectionId || action.sharedScopeId === managedActionScope(actor.connection))) tx.update(ref, { expiresAt: now() })
  }
  const reconcile = async (actor, ref, initial) => {
    let value = initial
    if (!value) return null
    const expired = current => current.state === 'running' && now() - (current.processingAt || current.startedAt) > (current.processingAt ? maxRunningMs : 60 * 60_000)
    const proof = value.state === 'review' ? await completion(actor, value) : null
    const stale = expired(value)
    if (proof || stale) {
      value = await db().runTransaction(async tx => {
        const current = (await tx.get(ref)).data()
        if (!current || current.jobId !== initial.jobId || current.state !== initial.state) return current
        if (!proof && !expired(current)) return current
        const patch = proof ? { state: 'completed', completion: proof, ...(proof.appliedChanges ? { result: { ...current.result, appliedChanges: proof.appliedChanges, appliedTransitEntries: proof.appliedTransitEntries || [] } } : {}), updatedAt: now() } : { state: 'failed', error: { code: 'deadline-exceeded', message: 'Die Auswertung wurde unterbrochen. Bitte erneut starten.' }, updatedAt: now() }
        tx.update(ref, patch)
        return { ...current, ...patch }
      })
    }
    return value
  }
  const hydrate = async (actor, value) => {
    if (value?.kind === 'terms' && value.result?.historyId) {
      const history = (await db().doc(`agbCheckerHistory/${value.result.historyId}`).get()).data()
      if ((history?.createdByUserId === actor.uid || history?.sharedActionScopeId && history.sharedActionScopeId === managedActionScope(actor.connection)) && history.channel === 'personal_mailbox' && history.customerAssignment) return { ...value, result: { ...value.result, customerAssignment: history.customerAssignment } }
    }
    return value
  }
  const startMailboxAction = async (request, automatic = null) => {
    const identity = actionIdentity(request.data)
    const actor = await context(request, identity.kind)
    const ref = await refFor(actor, { ...request.data, ...identity }, true)
    await reconcile(actor, ref, (await ref.get()).data())
    const input = { connectionId: actor.connectionId, messageId: identity.messageId }
    if (mailboxRecordKinds[identity.kind]) input.kind = identity.kind
    if (identity.kind === 'order' && request.data.selectedPdfIds !== undefined) {
      const ids = request.data.selectedPdfIds
      if (!Array.isArray(ids) || ids.length > 5 || ids.some(id => !validText(id, 2048)) || new Set(ids).size !== ids.length) fail('invalid-argument', 'Bitte gültige PDF-Anlagen auswählen.')
      input.selectedPdfIds = ids
    }
    if (identity.kind === 'tracking' && request.data.orderNumber !== undefined) {
      if (!/^\d{9}$/.test(request.data.orderNumber)) fail('invalid-argument', 'Bitte eine gültige TA-Nummer eingeben.')
      input.orderNumber = request.data.orderNumber
    }
    const jobId = randomUUID()
    input.operationId = jobId
    const action = await db().runTransaction(async tx => {
      const current = (await tx.get(ref)).data()
      if (automatic) {
        const scope = (await tx.get(db().doc(`mailboxRecommendationScopes/${automatic.scopeId}`))).data()
        if (!scope?.enabled || scope.mode !== 'automatic' || scope.generation !== automatic.generation) return current || null
        if (current) return current
      }
      const confirmed = current?.state === 'review' ? await completion(actor, current, tx) : null
      if (confirmed) {
        const completed = { ...current, state: 'completed', completion: confirmed, updatedAt: now() }
        tx.set(ref, completed)
        return completed
      }
      if (current?.state === 'running' || current?.state === 'completed' && ['order', 'tracking', ...Object.keys(mailboxRecordKinds)].includes(identity.kind) || current && ['review', 'completed'].includes(current.state) && request.data.restart !== true && request.data.force !== true) return current
      await retirePreview(actor, current, tx)
      const value = { ...identity, ...(usesShared(actor, identity.kind) ? { sharedScopeId: managedActionScope(actor.connection) } : {}), ...(automatic ? { automatic: true, recommendationScopeId: automatic.scopeId } : {}), ownerId: actor.uid, connectionId: actor.connectionId, graphUserId: actor.connection.graphUserId || '', jobId, state: 'running', result: null, error: null, startedAt: now(), updatedAt: now() }
      tx.set(ref, value)
      tx.create(db().doc(`mailboxActionRuns/${jobId}`), { ownerId: actor.uid, connectionId: actor.connectionId, messageId: identity.messageId, kind: identity.kind, slotPath: ref.path, jobId, ...(automatic ? { automatic: true, recommendationScopeId: automatic.scopeId, recommendationGeneration: automatic.generation } : {}), input, createdAt: now(), expiresAt: now() + 86400000, claimedAt: null })
      return value
    })
    return { action: output(ref, action, true, actor) }
  }
  const getMailboxAction = async request => {
    const identity = actionIdentity(request.data)
    const actor = await context(request, identity.kind, false)
    const ref = await refFor(actor, identity)
    const value = await reconcile(actor, ref, (await ref.get()).data())
    if (request.data.jobId && value?.jobId !== request.data.jobId) fail('aborted', 'Die Auswertung wurde inzwischen ersetzt. Bitte erneut laden.')
    return { action: output(ref, await hydrate(actor, value), true, actor) }
  }
  const listMailboxActions = async request => {
    const actor = await context(request, null, false)
    const ids = request.data.messageIds
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !validText(id, 2048)))) fail('invalid-argument', 'Ungültige Nachrichtenliste.')
    const groups = ids ? Array.from({ length: Math.ceil(ids.length / 30) }, (_, index) => [...new Set(ids.slice(index * 30, index * 30 + 30))]) : [null]
    const collections = [collection(actor), ...(managedActionScope(actor.connection) ? [collection(actor, true)] : [])]
    const snapshots = await Promise.all(collections.flatMap(source => groups.map(group => (group ? source.where('messageId', 'in', group) : source).limit(500).get())))
    const actions = []
    for (const snapshot of snapshots) for (const item of snapshot.docs) {
      const value = item.data()
      try { assertMailboxActionAccess(actor.profile, value.kind, false) } catch { continue }
      actions.push(output(item.ref, await reconcile(actor, item.ref, value), false, actor))
    }
    return { actions: [...new Map(actions.map(action => [`${action.messageId}|${action.kind}`, action])).values()] }
  }
  const updateMailboxAction = async request => {
    const identity = actionIdentity(request.data)
    const actor = await context(request, identity.kind)
    if (!['discard', 'complete', 'reopen'].includes(request.data.action)) fail('invalid-argument', 'Ungültige Statusänderung.')
    const ref = await refFor(actor, identity)
    let current = (await ref.get()).data()
    if (!current || current.jobId !== request.data.jobId) fail('aborted', 'Die Auswertung wurde inzwischen ersetzt. Bitte erneut laden.')
    if (identity.kind === 'invoice' && ['complete', 'reopen'].includes(request.data.action)) {
      current = await db().runTransaction(async tx => {
        const value = (await tx.get(ref)).data()
        if (!value || value.jobId !== request.data.jobId) fail('aborted', 'Die Auswertung wurde inzwischen ersetzt. Bitte erneut laden.')
        const shared = value.sharedScopeId && value.sharedScopeId === managedActionScope(actor.connection)
        const owned = value.ownerId === actor.uid && value.connectionId === actor.connectionId && value.graphUserId === (actor.connection.graphUserId || '')
        if ((!shared && !owned) || value.kind !== identity.kind || value.messageId !== identity.messageId) fail('permission-denied', 'Die Auswertung gehört nicht zu dieser Postfachnachricht.')
        if (!['review', 'completed'].includes(value.state) || !value.result) fail('failed-precondition', 'Nur eine erfolgreich ausgewertete Rechnung kann bestätigt oder wieder geöffnet werden.')
        const reviewed = value.state === 'completed' && value.completion?.invoiceReviewed === true
        if (request.data.action === 'complete' && reviewed) return value
        if (request.data.action === 'reopen' && value.state === 'review' && !value.completion) return value
        const patch = request.data.action === 'complete'
          ? { state: 'completed', completion: { invoiceReviewed: true, actorId: actor.uid, reviewedAt: now() }, updatedAt: now() }
          : { state: 'review', completion: null, updatedAt: now() }
        tx.update(ref, patch)
        return { ...value, ...patch }
      })
    } else if (request.data.action === 'reopen') fail('failed-precondition', 'Nur Rechnungsprüfungen können wieder geöffnet werden.')
    else if (request.data.action === 'complete') {
      if (!['order', 'tracking', ...Object.keys(mailboxRecordKinds)].includes(identity.kind)) fail('failed-precondition', 'Diese Prüfung ist bereits abgeschlossen.')
      const proofId = request.data.previewId || request.data.proof?.previewId
      if (proofId && proofId !== current.result?.previewId) fail('permission-denied', 'Die Bestätigung gehört nicht zu dieser Auswertung.')
      current = await reconcile(actor, ref, current)
      if (current?.jobId !== request.data.jobId) fail('aborted', 'Die Auswertung wurde inzwischen ersetzt. Bitte erneut laden.')
      if (current.state !== 'completed') fail('failed-precondition', 'Die Angaben wurden noch nicht übernommen.')
    } else current = await db().runTransaction(async tx => {
      const value = (await tx.get(ref)).data()
      if (!value || value.jobId !== request.data.jobId) fail('aborted', 'Die Auswertung wurde inzwischen ersetzt.')
      if (value.state === 'discarded') return value
      if (value.state !== 'review') fail('failed-precondition', 'Nur offene Vorschläge können verworfen werden.')
      if (await completion(actor, value, tx)) fail('failed-precondition', 'Die Angaben wurden bereits übernommen und können nicht verworfen werden.')
      await retirePreview(actor, value, tx)
      const patch = { state: 'discarded', result: null, error: null, updatedAt: now() }
      tx.update(ref, patch)
      return { ...value, ...patch }
    })
    return { action: output(ref, current, true, actor) }
  }
  const processMailboxActionRun = async jobId => {
    environment()
    if (!/^[a-f0-9-]{36}$/.test(jobId || '')) return
    const runRef = db().doc(`mailboxActionRuns/${jobId}`)
    const run = await db().runTransaction(async tx => {
      const value = (await tx.get(runRef)).data()
      if (!value || value.claimedAt !== null) return null
      const slotRef = db().doc(value.slotPath)
      const current = (await tx.get(slotRef)).data()
      if (!current || current.jobId !== jobId || current.state !== 'running') return null
      tx.update(runRef, { claimedAt: now() })
      tx.update(slotRef, { processingAt: now(), updatedAt: now() })
      return value
    })
    if (!run) return
    const ref = db().doc(run.slotPath)
    const request = { auth: { uid: run.ownerId }, data: run.input }
    let patch
    try {
      const actor = await context(request, run.kind)
      const current = (await ref.get()).data()
      if (!current || current.jobId !== jobId || current.state !== 'running') return
      if (current.graphUserId !== (actor.connection.graphUserId || '')) fail('permission-denied', 'Die Postfachverbindung wurde inzwischen geändert.')
      if (run.automatic) {
        const scope = (await db().doc(`mailboxRecommendationScopes/${run.recommendationScopeId}`).get()).data()
        if (!scope?.enabled || scope.mode !== 'automatic' || scope.generation !== run.recommendationGeneration) fail('cancelled', 'Die automatische Auswertung wurde deaktiviert.')
      }
      const handlers = deps.handlers || (await import('./mailboxes.js')).createMailboxHandlers()
      const method = mailboxRecordKinds[run.kind] ? 'previewMailboxRecord' : { order: 'previewMailboxOrder', tracking: 'previewMailboxTracking', terms: 'analyzeMailboxAgb', invoice: 'reviewMailboxInvoices' }[run.kind]
      const result = serializable(await handlers[method](request))
      await context(request, run.kind)
      if (current.sharedScopeId && run.kind === 'terms' && result.historyId) {
        await db().doc(`agbCheckerHistory/${result.historyId}`).update({ sharedActionScopeId: current.sharedScopeId, actionSlotPath: ref.path, actionJobId: jobId })
      }
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 850000) fail('failed-precondition', 'Das Prüfergebnis ist zu umfangreich. Bitte weniger Anlagen auswählen.')
      if (result.previewId && ['order', 'tracking', ...Object.keys(mailboxRecordKinds)].includes(run.kind)) {
        const prefix = mailboxRecordKinds[run.kind] ? 'mailboxRecordPreviews' : run.kind === 'order' ? 'mailboxOrderPreviews' : 'mailboxTrackingPreviews'
        const previewRef = db().doc(`${prefix}/${result.previewId}`)
        await db().runTransaction(async tx => {
          const preview = (await tx.get(previewRef)).data()
          if (!preview || preview.ownerId !== actor.uid || preview.connectionId !== actor.connectionId || preview.messageKey !== expectedMessageKey(actor, run.messageId)) fail('permission-denied', 'Die Auswertung gehört nicht zu dieser Nachricht.')
          tx.update(previewRef, { actionJobId: jobId, actionSlotPath: ref.path, expiresAt: persistentExpiry })
        })
        result.expiresAt = persistentExpiry
      }
      patch = { result, state: run.kind === 'invoice' ? 'review' : run.kind === 'terms' || result.alreadyApplied ? 'completed' : 'review', error: null, updatedAt: now() }
    } catch (error) {
      patch = { state: 'failed', result: null, error: publicError(error), updatedAt: now() }
      if (error.code !== 'cancelled') {
        try { await (deps.diagnostic || (event => recordDiagnostic(event, db())))({ module: 'mailboxes', stage: 'action-process', code: error instanceof HttpsError ? error.code : 'unavailable', actorId: run.ownerId, message: 'Postfachaktion konnte nicht abgeschlossen werden.', technicalCode: `mailbox_action_${run.kind}_failed` }) } catch { /* Preserve the action's original error. */ }
      }
    }
    await db().runTransaction(async tx => {
      const current = (await tx.get(ref)).data()
      if (current?.jobId === jobId && current.state === 'running') tx.update(ref, patch)
      tx.update(runRef, { finishedAt: now(), state: patch.state })
    })
  }
  const startAutomaticMailboxActions = async ({ scopeId, generation, connections, messageId, kinds: requestedKinds }) => {
    environment()
    if (!/^[a-f0-9]{64}$/.test(scopeId || '') || !validText(messageId, 2048) || typeof generation !== 'string') fail('invalid-argument', 'Ungültiger Automatiklauf.')
    const started = [], blockedKinds = []
    for (const kind of [...new Set(requestedKinds || [])].filter(value => ['tracking', 'terms', 'invoice'].includes(value))) {
      let handled = false
      for (const candidate of connections || []) {
        const request = { auth: { uid: candidate.ownerId }, data: { connectionId: candidate.id, messageId, kind } }
        try {
          const actor = await context(request, kind)
          const scope = (await db().doc(`mailboxRecommendationScopes/${scopeId}`).get()).data()
          if (!scope?.enabled || scope.mode !== 'automatic' || scope.generation !== generation) return { actions: started, blockedKinds }
          const eligible = scope.kind === 'shared' ? actor.connection.canonicalMailboxId === scope.canonicalMailboxId && actor.connection.tenantId === scope.tenantId && Boolean(managedActionScope(actor.connection)) : scope.connectionId === actor.connectionId && scope.ownerId === actor.uid
          if (!eligible) continue
          const result = await startMailboxAction(request, { scopeId, generation })
          if (result.action) started.push(result.action)
          handled = true
          break
        } catch (error) { if (!['permission-denied', 'unauthenticated', 'not-found', 'failed-precondition'].includes(error.code)) throw error }
      }
      if (!handled) {
        blockedKinds.push(kind)
        try { await (deps.diagnostic || (event => recordDiagnostic(event, db())))({ module: 'mailboxes', stage: 'action-process', code: 'permission-denied', actorId: '', message: 'Automatische Postfachaktion hat keine aktive Verbindung mit passenden Modulrechten.', technicalCode: `mailbox_automatic_${kind}_access_required` }) } catch { /* Do not expose mailbox content or obscure the dispatch result. */ }
      }
    }
    return { actions: started, blockedKinds }
  }
  return { startAutomaticMailboxActions, startMailboxAction, getMailboxAction, listMailboxActions, updateMailboxAction, processMailboxActionRun }
}

const handlers = createMailboxActionHandlers()
// onCall also supplies a streaming response argument; never treat it as automatic context.
export const startMailboxActionHandler = request => handlers.startMailboxAction(request)
export const getMailboxActionHandler = handlers.getMailboxAction
export const listMailboxActionsHandler = handlers.listMailboxActions
export const updateMailboxActionHandler = handlers.updateMailboxAction
export const processMailboxActionRunHandler = handlers.processMailboxActionRun

export const startAutomaticMailboxActionsHandler = handlers.startAutomaticMailboxActions
