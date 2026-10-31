import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { withBackgroundDiagnostic } from './backgroundWork.js'
import { reminderMailNotificationUrl } from './systemMails.js'
import { advanceReminderPreparation, refreshReminderSource, runReminderDispatch } from './reminders.js'
import { reminderSourceChanged, reminderSourceDescriptor } from './reminderSources.js'

// Preserve the published function names while using the central registry.
export const maintainCaseDeadlineReminderWork = onDocumentWritten({ region: 'europe-west3', document: '{collection}/{caseId}/deadlines/{deadlineId}', retry: true, maxInstances: 3 }, async (event) => {
  const sourcePath = event.data.after.ref.path
  if (!reminderSourceDescriptor(sourcePath)) return
  if (!reminderSourceChanged(event.data.before.data(), event.data.after.data())) return
  const db = getFirestore()
  await withBackgroundDiagnostic(db, 'reminder-projection', () => refreshReminderSource(db, sourcePath))
})

export const advanceDeadlineReminderWork = advanceReminderPreparation
export const runCaseDeadlineReminderDispatch = runReminderDispatch
export const scheduledCaseDeadlineReminderDispatch = onSchedule({ region: 'europe-west3', schedule: '* * * * *', timeZone: 'Europe/Berlin', maxInstances: 1, concurrency: 1, timeoutSeconds: 120, secrets: [reminderMailNotificationUrl] }, async () => runReminderDispatch())
