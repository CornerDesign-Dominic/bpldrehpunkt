import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { isDeepStrictEqual } from 'node:util'
import { FieldPath, FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'
import { sendReminderMail } from './systemMails.js'
import { externalEffectsEnvironment } from './externalEffects.js'
import { reminderRecipientPolicy } from './reminderRecipientPolicy.js'
import { reminderMinuteState } from './shared/reminderTime.js'
import { canReadReminderSource, createReminderRecipientCache, legacyReminderDeliveryId, loadReminderRecipient, loadReminderRecipients, loadReminderSource, reminderDeliveryId, reminderParentVersion, reminderPermission, reminderSourceDescriptor, reminderSourceKey } from './reminderSources.js'

const pageSize = 100
const workRef = (db, path) => db.doc(`reminderWork/${reminderSourceKey(path)}`)
const statusRef = (db, path) => db.doc(`reminderSourceStatus/${reminderSourceKey(path)}`)
const stamp = () => FieldValue.serverTimestamp()
const publicRecipient = (recipient, status) => ({ userId: recipient.userId, name: recipient.name, status })

function baseStatus(context, now) {
  if (!context?.exists) return { status: 'suppressed', reason: 'Die Quelle wurde gelöscht.' }
  if (!context.enabled) return { status: 'disabled' }
  if (context.suppressed) return { status: 'suppressed', reason: context.suppressed }
  if (context.configuration) return { status: 'configuration_required', reason: context.configuration }
  const minute = reminderMinuteState(context.dueAt, now)
  return { status: minute === 'upcoming' ? 'scheduled' : minute === 'due' ? 'due' : 'missed' }
}

export async function refreshReminderSource(db, sourcePath, { now = new Date() } = {}) {
  if (!reminderSourceDescriptor(sourcePath)) return { ignored: true }
  return db.runTransaction(async (transaction) => {
    const context = await loadReminderSource(db, sourcePath, transaction)
    const [previousStatus, previousWork] = await Promise.all([transaction.get(statusRef(db, sourcePath)), transaction.get(workRef(db, sourcePath))])
    const previous = previousStatus.data()
    const base = baseStatus(context, now)
    if (previous?.scheduleId === context.scheduleId && previous?.status === 'missed' && context.enabled && !context.suppressed && !context.configuration) base.status = 'missed'
    const reuseStatus = previous?.version === context.version && ['accepted', 'uncertain', 'partial', 'failed'].includes(previous.status)
    const complete = reuseStatus && !previous.recipients?.some((item) => item.status === 'sending')
    const next = { sourcePath, parentPath: context.parentPath, scheduleId: context.scheduleId, version: context.version, dueAt: context.dueAt, ...base, ...(reuseStatus ? { status: previous.status, recipients: previous.recipients || [], ...(previous.reason ? { reason: previous.reason } : {}) } : {}) }
    const comparable = { ...previous }; delete comparable.updatedAt
    if (!isDeepStrictEqual(comparable, next)) transaction.set(statusRef(db, sourcePath), { ...next, updatedAt: stamp() })
    // Valid future jobs remain indexed even if their parent/user is currently
    // blocked: reopening or changing access before the minute cannot lose work.
    if (context.exists && context.enabled && context.dueAt && base.status !== 'missed' && reminderMinuteState(context.dueAt, now) !== 'missed' && !complete) {
      const work = { sourcePath, parentPath: context.parentPath, scheduleId: context.scheduleId, dueAt: Timestamp.fromDate(new Date(context.dueAt)) }
      if (!isDeepStrictEqual(previousWork.data(), work)) transaction.set(workRef(db, sourcePath), work)
    } else if (previousWork.exists) transaction.delete(workRef(db, sourcePath))
    return { sourcePath, ...base, dueAt: context.dueAt }
  })
}

async function currentStatus(db, context, now, cache, environment = externalEffectsEnvironment()) {
  const base = baseStatus(context, now)
  if (!context.exists || !context.enabled || !context.dueAt || context.suppressed) return { sourcePath: context.sourcePath, dueAt: context.dueAt, ...base, recipients: [] }
  const previous = (await statusRef(db, context.sourcePath).get()).data()
  const missed = reminderMinuteState(context.dueAt, now) === 'missed' || (previous?.scheduleId === context.scheduleId && previous.status === 'missed')
  const recipients = await loadReminderRecipients(db, context, cache)
  const rows = await Promise.all(recipients.map(async (recipient) => {
    const receipt = (await db.doc(`reminderDeliveries/${reminderDeliveryId(context, recipient.userId)}`).get()).data()
    const policy = reminderRecipientPolicy(recipient.email, environment)
    const status = receipt?.status === 'sending' && missed ? 'uncertain' : receipt?.status || (!policy.allowed ? 'blocked' : missed ? 'missed' : recipient.eligible ? 'pending' : 'blocked')
    return publicRecipient(recipient, status)
  }))
  let status = base.status, reason = base.reason
  const states = rows.map((row) => row.status)
  if (states.length && states.every((item) => item === 'accepted')) status = 'accepted'
  else if (states.includes('accepted')) status = 'partial'
  else if (states.includes('uncertain') || states.includes('sending')) status = 'uncertain'
  else if (states.includes('failed')) status = 'failed'
  else if (missed || (states.includes('missed') && states.every((item) => ['missed', 'cancelled', 'blocked'].includes(item)))) status = 'missed'
  else if (states.length && states.every((item) => item === 'blocked')) { status = 'configuration_required'; reason = recipients.map((recipient) => reminderRecipientPolicy(recipient.email, environment)).find((policy) => !policy.allowed)?.reason || 'Der Versand wurde blockiert. Die Versandkonfiguration und den automatischen Mail-Stopp prüfen.' }
  else if (states.length && states.every((item) => item === 'cancelled')) { status = 'suppressed'; reason = 'Quelle oder Zuständigkeit wurde vor dem Versand geändert.' }
  else if (context.configuration || !recipients.length || !recipients.some((item) => item.eligible)) { status = 'configuration_required'; reason = context.configuration || recipients[0]?.reason || 'Es gibt keine aktive Person mit Lesezugriff und gültiger Profil-E-Mail-Adresse.' }
  return { sourcePath: context.sourcePath, status, dueAt: context.dueAt, recipients: rows, ...(reason ? { reason } : {}) }
}

/** Read-only endpoint: validate all source paths and access before reading any
 * delivery metadata. No email, text, note or private source content escapes. */
export async function listReminderStatusesHandler(request, { db = getFirestore(), authorize = requireActiveProfile, now = new Date(), environment = externalEffectsEnvironment() } = {}) {
  const profile = await authorize(request)
  const paths = request.data?.sourcePaths
  if (!request.auth?.uid || !Array.isArray(paths) || paths.length > 50 || paths.some((path) => !reminderSourceDescriptor(path))) throw new HttpsError('invalid-argument', 'Bitte höchstens 50 gültige Erinnerungsquellen angeben.')
  const contexts = []
  const permissions = new Map()
  for (const path of [...new Set(paths)]) {
    const context = await loadReminderSource(db, path)
    const key = context.calendarId
    let permission = null
    if (key && profile.role !== 'superadmin' && context.parent?.ownerUserId !== request.auth.uid) {
      if (!permissions.has(key)) permissions.set(key, reminderPermission(db, context, request.auth.uid))
      permission = await permissions.get(key)
    }
    if (!canReadReminderSource(context, request.auth.uid, profile, permission)) throw new HttpsError('permission-denied', 'Keine Berechtigung für diese Erinnerungsquelle.')
    contexts.push(context)
  }
  const cache = createReminderRecipientCache(db)
  return { statuses: await Promise.all(contexts.map((context) => currentStatus(db, context, now, cache, environment))) }
}

async function technicalFailure(db, code, deliveryId = '') {
  try {
    const safeCode = /^[a-z0-9-]{1,80}$/.test(code || '') ? code : 'reminder-dispatch-failed'
    const shouldReport = await db.runTransaction(async (transaction) => {
      const ref = db.doc(`reminderState/diagnostic-${safeCode}`)
      const snapshot = await transaction.get(ref)
      if (snapshot.data()?.reportedAt?.toMillis?.() > Date.now() - 15 * 60_000) return false
      transaction.set(ref, { reportedAt: stamp() })
      return true
    })
    if (shouldReport) await recordDiagnostic({ module: 'reminders', stage: 'dispatch', code: safeCode, message: 'Eine Erinnerung konnte technisch nicht sicher versendet werden. Den Erinnerungsstatus prüfen.', actorId: 'system', actorName: 'Erinnerungsdienst', recordId: deliveryId }, db)
  } catch { /* diagnosis must not turn a known provider outcome into a retry */ }
}

async function claimRecipient(db, expected, userId, now, environment) {
  return db.runTransaction(async (transaction) => {
    const context = await loadReminderSource(db, expected.sourcePath, transaction)
    const recipient = await loadReminderRecipient(db, context, userId, transaction)
    const deliveryId = reminderDeliveryId(context, userId)
    const ref = db.doc(`reminderDeliveries/${deliveryId}`)
    const previous = await transaction.get(ref)
    if (previous.exists) return null // permanent reservation; never reclaim HTTP uncertainty
    if (!context.exists || !context.enabled || context.suppressed || context.configuration || context.version !== expected.version || !recipient?.eligible || !reminderRecipientPolicy(recipient.email, environment).allowed || reminderMinuteState(context.dueAt, now()) !== 'due') return null
    const legacyId = legacyReminderDeliveryId(context, recipient.email)
    const legacy = legacyId ? await transaction.get(db.doc(`caseDeadlineReminderDeliveries/${legacyId}`)) : null
    if (['sent', 'delivered'].includes(legacy?.data()?.status)) {
      transaction.create(ref, { sourcePath: context.sourcePath, scheduleId: context.scheduleId, dueAt: context.dueAt, userId, status: 'accepted', legacy: true, updatedAt: stamp() })
      return null
    }
    const token = randomUUID()
    transaction.create(ref, { sourcePath: context.sourcePath, scheduleId: context.scheduleId, dueAt: context.dueAt, userId, status: 'sending', token, attemptedAt: stamp(), updatedAt: stamp() })
    return { context, recipient, ref, deliveryId, token }
  })
}

async function finishRecipient(db, claim, outcome) {
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(claim.ref)
    if (snapshot.data()?.token !== claim.token) return
    transaction.update(claim.ref, { status: outcome.status, ...(outcome.reason ? { reason: String(outcome.reason).replace(/[^a-z0-9-]/g, '').slice(0, 80) } : {}), updatedAt: stamp() })
  })
}

async function attemptRecipient(db, expected, userId, now, send, environment) {
  const claim = await claimRecipient(db, expected, userId, now, environment)
  if (!claim) return
  const beforeSend = async () => {
    if (reminderMinuteState(claim.context.dueAt, now()) !== 'due') return false
    const current = await loadReminderSource(db, expected.sourcePath)
    const recipient = await loadReminderRecipient(db, current, userId)
    return current.exists && current.enabled && !current.suppressed && !current.configuration && current.version === claim.context.version && recipient?.eligible && recipient.email === claim.recipient.email && reminderRecipientPolicy(recipient.email, environment).allowed && reminderMinuteState(current.dueAt, now()) === 'due'
  }
  let outcome
  try {
    if (!await beforeSend()) outcome = { status: reminderMinuteState(claim.context.dueAt, now()) === 'missed' ? 'missed' : 'cancelled', reason: 'no-longer-eligible' }
    else outcome = await send({ recipient: claim.recipient.email, templateId: 'central_reminder', values: { title: claim.context.title, note: claim.context.note || '–', dueDateTime: `${claim.context.date.split('-').reverse().join('.')}, ${claim.context.time} Uhr (Europe/Berlin${claim.context.occurrence ? `, ${claim.context.occurrence === 'earlier' ? 'erstes Vorkommen' : 'zweites Vorkommen'}` : ''})`, sourceType: claim.context.sourceType }, deliveryId: claim.deliveryId, dueAt: claim.context.dueAt, beforeSend })
    if (!outcome || !['accepted', 'blocked', 'failed', 'uncertain', 'missed', 'cancelled'].includes(outcome.status)) outcome = { status: 'uncertain', reason: 'invalid-provider-result' }
  } catch { outcome = { status: 'uncertain', reason: 'provider-call-uncertain' } }
  try { await finishRecipient(db, claim, outcome) }
  catch (error) { await technicalFailure(db, 'reminder-receipt-write-failed', claim.deliveryId); throw error }
  if (['failed', 'uncertain'].includes(outcome.status)) await technicalFailure(db, outcome.reason || 'provider-call-failed', claim.deliveryId)
  return outcome
}

async function persistStatus(db, context, result, remove) {
  await db.runTransaction(async (transaction) => {
    const current = await loadReminderSource(db, context.sourcePath, transaction)
    if (current.version !== context.version) return
    transaction.set(statusRef(db, context.sourcePath), { ...result, parentPath: context.parentPath, scheduleId: context.scheduleId, version: context.version, updatedAt: stamp() })
    if (remove) transaction.delete(workRef(db, context.sourcePath))
  })
}

async function processJob(db, sourcePath, now, send, environment) {
  const context = await loadReminderSource(db, sourcePath)
  if (!context) return
  const minute = context.dueAt ? reminderMinuteState(context.dueAt, now()) : 'invalid'
  const outcomes = { accepted: 0, failed: 0, uncertain: 0 }
  if (!context.exists || !context.enabled || !context.dueAt || minute === 'upcoming') { await refreshReminderSource(db, sourcePath, { now: now() }); return }
  if (minute === 'due' && !context.suppressed && !context.configuration) {
    const recipients = await loadReminderRecipients(db, context)
    for (let offset = 0; offset < recipients.length; offset += 5) {
      const attempted = await Promise.all(recipients.slice(offset, offset + 5).filter((item) => item.eligible).map((item) => attemptRecipient(db, context, item.userId, now, send, environment)))
      for (const outcome of attempted) if (outcome && Object.hasOwn(outcomes, outcome.status)) outcomes[outcome.status] += 1
    }
  }
  const result = await currentStatus(db, context, now(), undefined, environment)
  // A crashed worker's durable sending record is uncertain, not a retry lease.
  if (minute === 'missed') {
    const receipts = await db.collection('reminderDeliveries').where('scheduleId', '==', context.scheduleId).get()
    for (const receipt of receipts.docs.filter((item) => item.data().status === 'sending')) {
      const ref = receipt.ref
      await db.runTransaction(async (transaction) => { const snap = await transaction.get(ref); if (snap.data()?.status === 'sending') transaction.update(ref, { status: 'uncertain', reason: 'worker-outcome-unknown', updatedAt: stamp() }) })
      await technicalFailure(db, 'worker-outcome-unknown', ref.id)
    }
  }
  await persistStatus(db, context, result, !result.recipients.some((row) => row.status === 'sending'))
  return outcomes
}

export async function runReminderDispatch(now = new Date(), { db = getFirestore(), send = sendReminderMail, clock = () => new Date(), environment = externalEffectsEnvironment() } = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('Ungültiger Schedulerzeitpunkt.')
  const startedAt = performance.now()
  const result = { scanned: 0, accepted: 0, failed: 0, uncertain: 0 }
  const queryTime = () => Timestamp.fromDate(clock())
  let cursor = null
  try {
    while (true) {
      let query = db.collection('reminderWork').where('dueAt', '<=', queryTime()).orderBy('dueAt').limit(pageSize)
      if (cursor) query = query.startAfter(cursor)
      const jobs = await query.get()
      for (const job of jobs.docs) {
        if (performance.now() - startedAt > 45_000) break
        if (!reminderSourceDescriptor(job.data().sourcePath) || job.id !== reminderSourceKey(job.data().sourcePath)) {
          await technicalFailure(db, 'invalid-reminder-work')
          await job.ref.delete()
          continue
        }
        const outcome = await processJob(db, job.data().sourcePath, clock, send, environment)
        for (const key of ['accepted', 'failed', 'uncertain']) result[key] += outcome?.[key] || 0
        result.scanned += 1
      }
      cursor = jobs.docs.at(-1) || null
      if (!cursor || jobs.size < pageSize || performance.now() - startedAt > 45_000) break
    }
    if (performance.now() - startedAt <= 45_000) result.preparation = await advanceReminderPreparation(db, { now: clock() })
    return result
  } catch (error) { await technicalFailure(db, 'reminder-worker-failed'); throw error }
}

const prepRef = (db) => db.doc('reminderState/preparation')
export async function requestReminderRebuild(db, { requestId = '' } = {}) {
  await db.runTransaction(async (transaction) => {
    const ref = prepRef(db), state = (await transaction.get(ref)).data() || {}
    if (requestId && state.requestId === requestId) return
    transaction.set(ref, { generation: (state.generation || 0) + 1, requestId, phase: 'calendars', calendarId: null, calendarCursor: null, cursor: null, complete: false, updatedAt: stamp() })
  })
}

/** Bounded, resumable registry bootstrap. Calendar events are scanned under
 * calendars, never the much larger unrelated transport-tracking events group. */
export async function advanceReminderPreparation(db, { now = new Date() } = {}) {
  const ref = prepRef(db), state = (await ref.get()).data() || { phase: 'calendars' }
  if (state.complete) return { complete: true, processed: 0 }
  let next = { ...state }, query, parentId = state.calendarId
  if (state.phase === 'calendars') {
    if (!parentId) {
      let parents = db.collection('calendars').orderBy(FieldPath.documentId()).limit(1)
      if (state.calendarCursor) parents = parents.startAfter(db.doc(`calendars/${state.calendarCursor}`))
      parentId = (await parents.get()).docs[0]?.id
      if (!parentId) next = { ...next, phase: 'todos', cursor: null }
    }
    if (parentId) { query = db.collection(`calendars/${parentId}/events`); next.calendarId = parentId }
  } else query = state.phase === 'todos' ? db.collection('todos') : db.collectionGroup('deadlines')
  let processed = 0
  if (query) {
    query = query.orderBy(FieldPath.documentId()).limit(pageSize)
    if (state.cursor) query = query.startAfter(db.doc(state.cursor))
    const page = await query.get()
    for (const source of page.docs) { if (reminderSourceDescriptor(source.ref.path)) await refreshReminderSource(db, source.ref.path, { now }); processed += 1 }
    if (page.size === pageSize) next.cursor = page.docs.at(-1).ref.path
    else if (state.phase === 'calendars') next = { ...next, calendarId: null, calendarCursor: parentId, cursor: null }
    else if (state.phase === 'todos') next = { ...next, phase: 'deadlines', cursor: null }
    else next.complete = true
  }
  let complete = false
  await db.runTransaction(async (transaction) => {
    const current = (await transaction.get(ref)).data() || { phase: 'calendars' }
    if (JSON.stringify(current) !== JSON.stringify(state)) return
    complete = next.complete === true
    transaction.set(ref, { ...next, updatedAt: stamp() })
  })
  return { complete, processed, phase: next.phase }
}

export async function refreshReminderParent(db, parentPath, { refreshMain = true } = {}) {
  if (!/^(calendars|todos|damageCases|inkassoCases|legalDisputes|insolvencies)\/[^/]{1,240}$/.test(parentPath)) return { ignored: true, complete: true }
  if (refreshMain && parentPath.startsWith('todos/')) await refreshReminderSource(db, parentPath)
  const collection = parentPath.startsWith('calendars/') ? 'events' : 'deadlines'
  const stateRef = db.doc(`reminderState/parent-${reminderSourceKey(parentPath)}`)
  const revision = (snapshot) => reminderParentVersion(snapshot.exists ? snapshot.data() : null)
  const state = await db.runTransaction(async (transaction) => {
    const [parent, previous] = await Promise.all([transaction.get(db.doc(parentPath)), transaction.get(stateRef)])
    if (previous.data()?.revision === revision(parent)) return previous.data()
    const next = { parentPath, revision: revision(parent), generation: (previous.data()?.generation || 0) + 1, cursor: null, complete: false }
    transaction.set(stateRef, next)
    return next
  })
  if (state.complete) return { complete: true, processed: 0 }
  let query = db.collection(`${parentPath}/${collection}`).orderBy(FieldPath.documentId()).limit(pageSize)
  if (state.cursor) query = query.startAfter(db.doc(state.cursor))
  const page = await query.get()
  for (const source of page.docs) await refreshReminderSource(db, source.ref.path)
  let complete = false
  await db.runTransaction(async (transaction) => {
    const [parent, current] = await Promise.all([transaction.get(db.doc(parentPath)), transaction.get(stateRef)])
    if (revision(parent) !== state.revision || current.data()?.generation !== state.generation || current.data()?.cursor !== state.cursor) return
    complete = page.size < pageSize
    transaction.set(stateRef, { ...state, complete, cursor: page.docs.at(-1)?.ref.path || state.cursor, updatedAt: stamp() })
  })
  return { complete, processed: page.size }
}
