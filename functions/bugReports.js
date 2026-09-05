import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'

const powerAutomateNotificationUrl = defineSecret('POWER_AUTOMATE_NOTIFICATION_URL')
const emailPattern = /^\S+@\S+\.\S+$/
const reportModules = new Set(['Dashboard', 'Urlaub', 'Kalender', 'Urlaubsmanagement', 'Team Brennpunkt', 'Kunden & Unternehmer', 'CRM', 'Palettenmanagement', 'News', 'Dokumente', 'To-dos', 'Mein Profil', 'Adminbereich', 'Sonstiges'])

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function reporterName(profile, email) {
  return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || profile?.name || email || 'Unbekannter Nutzer'
}

function reportTime() {
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
}

export const submitBugReport = onCall({ region: 'europe-west3', secrets: [powerAutomateNotificationUrl] }, async (request) => {
  const reporter = await requireActiveProfile(request)

  const module = cleanText(request.data?.module, 100)
  const description = cleanText(request.data?.description, 4000)
  if (!reportModules.has(module) || !description) throw new HttpsError('invalid-argument', 'Modul und Beschreibung müssen gültig angegeben werden.')

  const database = getFirestore()
  const superadminsSnapshot = await database.collection('users').where('role', '==', 'superadmin').get()

  const recipients = [...new Set(superadminsSnapshot.docs
    .map((document) => document.data())
    .filter((profile) => profile.active !== false)
    .map((profile) => cleanText(profile.email, 320).toLowerCase())
    .filter((email) => emailPattern.test(email)))]
  if (!recipients.length) throw new HttpsError('failed-precondition', 'Keine aktiven Superadmins mit gültiger E-Mail-Adresse gefunden.')

  const notificationUrl = powerAutomateNotificationUrl.value()
  if (!notificationUrl) throw new HttpsError('failed-precondition', 'Benachrichtigungsdienst ist nicht konfiguriert.')

  const reporterEmail = cleanText(request.auth.token.email || reporter?.email, 320)
  const reporterNameValue = reporterName(reporter, reporterEmail)
  const reportedAt = reportTime()
  const subject = `Fehlermeldung – ${module}`
  const message = `Meldender Nutzer: ${reporterNameValue}${reporterEmail ? ` (${reporterEmail})` : ''}\nZeitpunkt: ${reportedAt} Uhr\nModul: ${module}\n\nBeschreibung:\n${description}`
  const results = await Promise.allSettled(recipients.map(async (to) => {
    const response = await fetch(notificationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, message, type: 'bug_report', module, description, reporterName: reporterNameValue, reportedAt }),
    })
    if (!response.ok) throw new Error(`Benachrichtigungsdienst antwortete mit ${response.status}.`)
  }))
  const failed = results.filter((result) => result.status === 'rejected').length
  if (failed) {
    logger.error('Der Versand einer Fehlermeldung über Power Automate ist fehlgeschlagen.', { recipients: recipients.length, failed })
    throw new HttpsError('unavailable', 'Die Meldung konnte nicht an alle Superadmins versendet werden.')
  }

  return { success: true }
})
