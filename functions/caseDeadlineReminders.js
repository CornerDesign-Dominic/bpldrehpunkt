import { createHash } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { shipmentTrackingBerlinIso, shipmentTrackingBerlinLocal } from './shared/shipmentTrackingDryRun.js'
import { sendSystemMailTemplate, systemMailNotificationUrl } from './systemMails.js'

const region = 'europe-west3'
const reminderPageSize = 500
const reminderDispatchConcurrency = 10
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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

async function claimDelivery(db, deadlineRef, metadata, now) {
  const deliveryRef = db.doc(`caseDeadlineReminderDeliveries/${deadlineReminderDeliveryId(deadlineRef, metadata)}`)
  let claimed = false
  let caseData = null
  await db.runTransaction(async (transaction) => {
    const [currentDeadline, currentDelivery, currentCase] = await Promise.all([
      transaction.get(deadlineRef), transaction.get(deliveryRef), transaction.get(metadata.caseRef),
    ])
    const current = currentDeadline.exists ? deadlineReminderMetadata(deadlineRef, currentDeadline.data()) : null
    const delivery = currentDelivery.exists ? currentDelivery.data() : null
    if (!current || current.dueAt !== metadata.dueAt || !isDeadlineReminderDue(current, now) || !currentCase.exists) return
    if (delivery?.status === 'sent') return
    if (delivery?.status === 'sending' && delivery.lockedAt?.toMillis?.() > now.getTime() - 10 * 60 * 1000) return
    caseData = currentCase.data()
    claimed = true
    transaction.set(deliveryRef, {
      status: 'sending', deadlinePath: deadlineRef.path, casePath: metadata.caseRef.path, recipient: current.recipient,
      dueAt: current.dueAt, attempts: (delivery?.attempts || 0) + 1, lockedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  })
  return claimed ? { deliveryRef, caseData } : null
}

async function dispatchReminder(db, deadlineSnapshot, now, sendMail) {
  const metadata = deadlineReminderMetadata(deadlineSnapshot.ref, deadlineSnapshot.data())
  if (!metadata || !isDeadlineReminderDue(metadata, now)) return { skipped: true }
  const claimed = await claimDelivery(db, deadlineSnapshot.ref, metadata, now)
  if (!claimed) return { skipped: true }
  const values = metadata.templateId === 'todo_deadline_reminder'
    ? { todoTitle: caseLabel(claimed.caseData), dueDateTime: germanDateTime(metadata.date, metadata.time), note: text(deadlineSnapshot.data()?.note) || '–' }
    : { caseType: metadata.type, caseNumber: caseLabel(claimed.caseData), dueDateTime: germanDateTime(metadata.date, metadata.time), note: text(deadlineSnapshot.data()?.note) || '–' }
  try {
    const delivered = await sendMail({ recipient: metadata.recipient, templateId: metadata.templateId, values })
    if (!delivered) throw new Error('delivery-disabled')
    await claimed.deliveryRef.set({ status: 'sent', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete() }, { merge: true })
    return { sent: true }
  } catch (error) {
    await claimed.deliveryRef.set({ status: 'failed', failedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: error instanceof Error ? error.message.slice(0, 240) : 'delivery-failed' }, { merge: true })
    logger.error('Fallfrist-Erinnerung konnte nicht zugestellt werden.', { deadlinePath: deadlineSnapshot.ref.path, error: error instanceof Error ? error.message : 'unknown' })
    return { failed: true }
  }
}

/** Returns the versioned collection-group query used by the scheduler.
 * Date-only filtering retains all already overdue entries, while excluding
 * future dates. `startAfter` below makes every due entry reachable even when
 * an individual scheduler run crosses the page size. */
export function deadlineReminderQuery(db, now = new Date()) {
  const today = shipmentTrackingBerlinLocal(now)?.date
  if (!today) throw new Error('deadline-reminder-clock-invalid')
  return db.collectionGroup('deadlines')
    .where('reminderEnabled', '==', true)
    .where('date', '<=', today)
    .orderBy('date', 'asc')
    .orderBy('time', 'asc')
}

/** Scans reminder-enabled, due deadline subcollections in deterministic pages.
 * A deterministic delivery record provides at-most-once semantics across
 * scheduler retries and later pages cannot be hidden behind the first 500. */
export async function runCaseDeadlineReminderDispatch(now = new Date(), { db = getFirestore(), sendMail = sendSystemMailTemplate } = {}) {
  const result = { scanned: 0, sent: 0, failed: 0 }
  let cursor = null
  while (true) {
    let query = deadlineReminderQuery(db, now).limit(reminderPageSize)
    if (cursor) query = query.startAfter(cursor)
    const deadlines = await query.get()
    result.scanned += deadlines.size
    for (let offset = 0; offset < deadlines.docs.length; offset += reminderDispatchConcurrency) {
      const pageResults = await Promise.all(deadlines.docs
        .slice(offset, offset + reminderDispatchConcurrency)
        .map((deadline) => dispatchReminder(db, deadline, now, sendMail)))
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

export const scheduledCaseDeadlineReminderDispatch = onSchedule({ region, schedule: '* * * * *', timeZone: 'Europe/Berlin', secrets: [systemMailNotificationUrl] }, async () => runCaseDeadlineReminderDispatch())
