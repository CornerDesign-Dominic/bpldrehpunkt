import { createHash } from 'node:crypto'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { advanceBackgroundRebuild, reportBackgroundFailure, withBackgroundDiagnostic } from './backgroundWork.js'
import { shipmentTrackingBerlinIso } from './shared/shipmentTrackingDryRun.js'
import { sendSystemMailTemplate, systemMailNotificationUrl } from './systemMails.js'
import { areAutomaticMailsPaused } from './automaticMailDelivery.js'

const region = 'europe-west3'
const reminderPageSize = 500
const reminderDispatchConcurrency = 10
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const workCollection = 'caseDeadlineReminderWork'
const deadlineCollections = Object.freeze({
  damageCases: { type: 'Schadenfall', templateId: 'case_deadline_reminder' },
  inkassoCases: { type: 'Inkassofall', templateId: 'case_deadline_reminder' },
  legalDisputes: { type: 'Gericht-/Streitfall', templateId: 'case_deadline_reminder' },
  insolvencies: { type: 'Insolvenzfall', templateId: 'case_deadline_reminder' },
  todos: { type: 'To-do', templateId: 'todo_deadline_reminder' },
})

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) }
function validTime(value) { return /^\d{2}:\d{2}$/.test(text(value)) }

export function deadlineReminderMetadata(deadlineRef, deadline) {
  const caseRef = deadlineRef?.parent?.parent
  const collection = caseRef?.parent?.id
  const definition = deadlineCollections[collection]
  const email = text(deadline?.reminderRecipientEmail)
  const date = text(deadline?.date)
  const time = text(deadline?.time)
  if (!definition || !caseRef || !validDate(date) || !validTime(time) || deadline?.reminderEnabled !== true || !emailPattern.test(email)) return null
  const dueAt = shipmentTrackingBerlinIso({ date, time })
  if (!dueAt) return null
  return { caseRef, type: definition.type, templateId: definition.templateId, recipient: email, date, time, dueAt }
}

export function deadlineReminderDeliveryId(deadlineRef, metadata) {
  const version = `${deadlineRef.path}|${metadata.date}|${metadata.time}|${metadata.recipient.toLowerCase()}`
  return createHash('sha256').update(version).digest('hex')
}

function reminderWorkRef(db, deadlineRef) {
  return db.collection(workCollection).doc(createHash('sha256').update(deadlineRef.path).digest('hex'))
}

export async function refreshDeadlineReminderWork(db, deadlineRef) {
  const workRef = reminderWorkRef(db, deadlineRef)
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(deadlineRef)
    const metadata = snapshot.exists ? deadlineReminderMetadata(deadlineRef, snapshot.data()) : null
    if (!metadata) { transaction.delete(workRef); return }
    const deliveryId = deadlineReminderDeliveryId(deadlineRef, metadata)
    const [delivery, parent] = await Promise.all([transaction.get(db.doc(`caseDeadlineReminderDeliveries/${deliveryId}`)), transaction.get(metadata.caseRef)])
    if (!parent.exists || ['sent', 'delivered'].includes(delivery.data()?.status)) { transaction.delete(workRef); return }
    transaction.set(workRef, { deadlinePath: deadlineRef.path, deliveryId, dueAt: Timestamp.fromDate(new Date(metadata.dueAt)) })
  })
}

export const maintainCaseDeadlineReminderWork = onDocumentWritten({ region, document: '{collection}/{caseId}/deadlines/{deadlineId}', retry: true, maxInstances: 3 }, async (event) => {
  if (!deadlineCollections[event.params.collection]) return
  const db = getFirestore()
  await withBackgroundDiagnostic(db, 'deadline-projection', () => refreshDeadlineReminderWork(db, event.data.after.ref))
})

export function advanceDeadlineReminderWork(db) {
  return advanceBackgroundRebuild(db, 'deadline-reminders-v1', db.collectionGroup('deadlines'), (item) => refreshDeadlineReminderWork(db, item.ref))
}

export function isDeadlineReminderDue(metadata, now = new Date()) {
  const dueAt = new Date(metadata?.dueAt || '')
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() <= now.getTime()
}

function germanDateTime(date, time) {
  const [year, month, day] = date.split('-')
  return `${day}.${month}.${year}, ${time} Uhr`
}

function caseLabel(caseData) {
  return text(caseData?.caseNumber) || text(caseData?.title) || text(caseData?.partnerName) || text(caseData?.debtorName) || 'Fallakte'
}

export async function claimDeadlineReminderDelivery(db, deadlineRef, metadata, now) {
  const deliveryRef = db.doc(`caseDeadlineReminderDeliveries/${deadlineReminderDeliveryId(deadlineRef, metadata)}`)
  return db.runTransaction(async (transaction) => {
    const [currentDeadline, currentDelivery, currentCase] = await Promise.all([
      transaction.get(deadlineRef), transaction.get(deliveryRef), transaction.get(metadata.caseRef),
    ])
    const current = currentDeadline.exists ? deadlineReminderMetadata(deadlineRef, currentDeadline.data()) : null
    const delivery = currentDelivery.exists ? currentDelivery.data() : null
    if (!current || deadlineReminderDeliveryId(deadlineRef, current) !== deadlineReminderDeliveryId(deadlineRef, metadata) || !isDeadlineReminderDue(current, now) || !currentCase.exists) return null
    if (['sent', 'delivered'].includes(delivery?.status)) return null
    if (delivery?.status === 'sending' && delivery.lockedAt?.toMillis?.() > now.getTime() - 10 * 60 * 1000) return null
    transaction.set(deliveryRef, {
      status: 'sending', deadlinePath: deadlineRef.path, casePath: metadata.caseRef.path, recipient: current.recipient,
      dueAt: current.dueAt, attempts: (delivery?.attempts || 0) + 1, lockedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { deliveryRef, caseData: currentCase.data() }
  })
}

async function dispatchReminder(db, deadlineSnapshot, now, sendMail) {
  const metadata = deadlineReminderMetadata(deadlineSnapshot.ref, deadlineSnapshot.data())
  if (!metadata || !isDeadlineReminderDue(metadata, now)) return { skipped: true }
  const claimed = await claimDeadlineReminderDelivery(db, deadlineSnapshot.ref, metadata, now)
  if (!claimed) return { skipped: true }
  const [freshDeadline, freshCase] = await Promise.all([deadlineSnapshot.ref.get(), metadata.caseRef.get()])
  const freshMetadata = freshDeadline.exists ? deadlineReminderMetadata(deadlineSnapshot.ref, freshDeadline.data()) : null
  if (!freshCase.exists || !freshMetadata || deadlineReminderDeliveryId(deadlineSnapshot.ref, freshMetadata) !== deadlineReminderDeliveryId(deadlineSnapshot.ref, metadata)) {
    await claimed.deliveryRef.set({ status: 'cancelled', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return { skipped: true }
  }
  const values = metadata.templateId === 'todo_deadline_reminder'
    ? { todoTitle: caseLabel(freshCase.data()), dueDateTime: germanDateTime(metadata.date, metadata.time), note: text(freshDeadline.data()?.note) || '–' }
    : { caseType: metadata.type, caseNumber: caseLabel(freshCase.data()), dueDateTime: germanDateTime(metadata.date, metadata.time), note: text(freshDeadline.data()?.note) || '–' }
  let deliveryAccepted = false
  try {
    const delivered = await sendMail({ recipient: metadata.recipient, templateId: metadata.templateId, values, automatic: true })
    if (!delivered) {
      await claimed.deliveryRef.set({ status: 'paused', pausedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: 'automatic-mail-delivery-paused' }, { merge: true })
      return { paused: true }
    }
    deliveryAccepted = true
    await claimed.deliveryRef.set({ status: 'sent', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete() }, { merge: true })
    return { sent: true }
  } catch (error) {
    await claimed.deliveryRef.set({ status: deliveryAccepted ? 'delivered' : 'failed', updatedAt: FieldValue.serverTimestamp(), lastError: deliveryAccepted ? 'accepted-receipt-incomplete' : 'delivery-failed' }, { merge: true }).catch(() => {})
    await reportBackgroundFailure(db, 'deadline-dispatch', error)
    return { failed: true }
  }
}

/** Only outstanding jobs enter the hot query; sent history never does. */
export function deadlineReminderQuery(db, now = new Date()) {
  if (Number.isNaN(now.getTime())) throw new Error('deadline-reminder-clock-invalid')
  return db.collection(workCollection).where('dueAt', '<=', Timestamp.fromDate(now)).orderBy('dueAt', 'asc')
}

/** Pages outstanding jobs. Deterministic receipts deduplicate completed sends;
 * provider timeouts and process loss still need provider-side idempotency for
 * an absolute at-most-once guarantee (the current webhook has no such contract). */
export async function runCaseDeadlineReminderDispatch(now = new Date(), { db = getFirestore(), sendMail = sendSystemMailTemplate } = {}) {
  await advanceDeadlineReminderWork(db)
  const paused = await areAutomaticMailsPaused(db)
  const result = { scanned: 0, sent: 0, failed: 0, paused }
  if (paused) {
    logger.info('Fallfrist-Erinnerungen sind durch den globalen Mail-Stopp pausiert.', result)
    return result
  }
  let cursor = null
  while (true) {
    let query = deadlineReminderQuery(db, now).limit(reminderPageSize)
    if (cursor) query = query.startAfter(cursor)
    const deadlines = await query.get()
    result.scanned += deadlines.size
    for (let offset = 0; offset < deadlines.docs.length; offset += reminderDispatchConcurrency) {
      const pageResults = await Promise.all(deadlines.docs
        .slice(offset, offset + reminderDispatchConcurrency)
        .map(async (job) => {
          const deadlineRef = db.doc(job.data().deadlinePath)
          const deadline = await deadlineRef.get()
          const result = deadline.exists ? await dispatchReminder(db, deadline, now, sendMail) : { skipped: true }
          await refreshDeadlineReminderWork(db, deadlineRef)
          return result
        }))
      for (const dispatched of pageResults) {
        if (dispatched.sent) result.sent += 1
        if (dispatched.failed) result.failed += 1
      }
    }
    cursor = deadlines.docs.at(-1) || null
    if (!cursor || deadlines.size < reminderPageSize) break
  }

  logger.info('Fallfrist-Erinnerungen verarbeitet.', result)
  return result
}

export const scheduledCaseDeadlineReminderDispatch = onSchedule({ region, schedule: '* * * * *', timeZone: 'Europe/Berlin', maxInstances: 1, secrets: [systemMailNotificationUrl] }, async () => {
  try { return await runCaseDeadlineReminderDispatch() } catch (error) { await reportBackgroundFailure(getFirestore(), 'deadline-reminders', error); throw error }
})
