import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { hasActiveProfile, requireActiveProfile, requireRole } from './access.js'

if (!getApps().length) initializeApp()
const db = getFirestore()
const powerAutomateNotificationUrl = defineSecret('POWER_AUTOMATE_NOTIFICATION_URL')
const region = 'europe-west3'
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const templateDefinitions = {
  vacation_request_confirmation: {
    displayName: 'Urlaubsantrag – Bestätigung',
    subject: 'Urlaub [Antrag] - {{employeeName}}',
    message: 'Dein Urlaubsantrag wurde versendet.\n\nDein Urlaubsantrag:\n\nZeitraum: {{period}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}\nKommentar: {{comment}}\n\nStatus:\nAusstehend',
    allowedPlaceholders: ['employeeName', 'period', 'days', 'vacationType', 'comment'],
  },
  vacation_request_manager: {
    displayName: 'Urlaubsantrag – Urlaubsmanagement',
    subject: 'Urlaub [Antrag] - {{employeeName}}',
    message: 'Ein Urlaubsantrag ist eingegangen.\n\nVon: {{employeeName}}\nAbteilung: {{department}}\nZeitraum: {{period}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}\nKommentar: {{comment}}\n\nBitte im Drehpunkt prüfen.',
    allowedPlaceholders: ['employeeName', 'department', 'period', 'days', 'vacationType', 'comment'],
  },
  vacation_change_confirmation: {
    displayName: 'Änderungsantrag – Bestätigung',
    subject: 'Urlaub [Änderung] - {{employeeName}}',
    message: 'Dein Änderungsantrag wurde versendet.\n\nDein Änderungsantrag:\n\nBisheriger Zeitraum: {{oldPeriod}}\nNeuer Zeitraum: {{newPeriod}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}\nKommentar: {{comment}}\n\nStatus:\nAusstehend',
    allowedPlaceholders: ['employeeName', 'oldPeriod', 'newPeriod', 'days', 'vacationType', 'comment'],
  },
  vacation_change_manager: {
    displayName: 'Änderungsantrag – Urlaubsmanagement',
    subject: 'Urlaub [Änderung] - {{employeeName}}',
    message: 'Ein Änderungsantrag ist eingegangen.\n\nVon: {{employeeName}}\nAbteilung: {{department}}\nBisheriger Zeitraum: {{oldPeriod}}\nNeuer Zeitraum: {{newPeriod}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}\nKommentar: {{comment}}\n\nBitte im Drehpunkt prüfen.',
    allowedPlaceholders: ['employeeName', 'department', 'oldPeriod', 'newPeriod', 'days', 'vacationType', 'comment'],
  },
  vacation_cancellation_confirmation: {
    displayName: 'Stornoantrag – Bestätigung',
    subject: 'Urlaub [Storno] - {{employeeName}}',
    message: 'Dein Stornoantrag wurde versendet.\n\nDein Stornoantrag:\n\nZeitraum: {{period}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}\nKommentar: {{comment}}\n\nStatus:\nAusstehend',
    allowedPlaceholders: ['employeeName', 'period', 'days', 'vacationType', 'comment'],
  },
  vacation_cancellation_manager: {
    displayName: 'Stornoantrag – Urlaubsmanagement',
    subject: 'Urlaub [Storno] - {{employeeName}}',
    message: 'Ein Stornoantrag ist eingegangen.\n\nVon: {{employeeName}}\nAbteilung: {{department}}\nZeitraum: {{period}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}\nKommentar: {{comment}}\n\nBitte im Drehpunkt prüfen.',
    allowedPlaceholders: ['employeeName', 'department', 'period', 'days', 'vacationType', 'comment'],
  },
  vacation_approved: {
    displayName: 'Urlaub – Genehmigung',
    subject: 'Urlaub [Genehmigt] - {{employeeName}}',
    message: 'Dein {{requestLabel}} wurde genehmigt.\n\n{{requestLabel}}:\n\n{{period}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}{{managerComment}}\n\nStatus:\nGenehmigt',
    allowedPlaceholders: ['employeeName', 'requestLabel', 'period', 'days', 'vacationType', 'managerComment'],
  },
  vacation_rejected: {
    displayName: 'Urlaub – Ablehnung',
    subject: 'Urlaub [Abgelehnt] - {{employeeName}}',
    message: 'Dein {{requestLabel}} wurde abgelehnt.\n\n{{requestLabel}}:\n\n{{period}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}{{managerComment}}\n\nStatus:\nAbgelehnt',
    allowedPlaceholders: ['employeeName', 'requestLabel', 'period', 'days', 'vacationType', 'managerComment'],
  },
  system_test: {
    displayName: 'System – Testmail',
    subject: 'Drehpunkt Testmail',
    message: 'Die Drehpunkt-Systemmail-Schnittstelle funktioniert.',
    allowedPlaceholders: [],
  },
}

function isActive(profile) { return hasActiveProfile(profile) }
function displayName(profile) { return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || profile?.email || '–' }
function cleanText(value, maxLength) { return typeof value === 'string' ? value.trim().slice(0, maxLength) : '' }
function formatDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '–'
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? '–' : new Intl.DateTimeFormat('de-DE').format(date)
}
function period(startDate, endDate) { return `${formatDate(startDate)} – ${formatDate(endDate)}` }
function vacationType(value) { return ({ normal: 'Normal', overtime: 'Überstundenabbau', special: 'Sonderurlaub' })[value] || 'Normal' }
function requestKind(request) {
  if (request?.requestKind === 'cancellation' || request?.cancellationRequest) return 'cancellation'
  return request?.originalRequestId || request?.changeRequest ? 'change' : 'request'
}
function requestLabel(kind) { return ({ request: 'Urlaubsantrag', change: 'Änderungsantrag', cancellation: 'Stornoantrag' })[kind] || 'Urlaubsantrag' }
function requestValues(request, employee) {
  const kind = requestKind(request)
  const details = kind === 'change' ? request.changeRequest || {} : kind === 'cancellation' ? request.cancellationRequest || {} : {}
  const currentPeriod = period(request.startDate, request.endDate)
  return {
    employeeName: displayName(employee),
    department: cleanText(employee?.departmentName || employee?.department, 160) || '–',
    period: currentPeriod,
    oldPeriod: period(details.originalStartDate, details.originalEndDate),
    newPeriod: currentPeriod,
    days: Number.isFinite(Number(request.days)) ? String(request.days) : '–',
    vacationType: vacationType(request.vacationType),
    comment: cleanText(request.requestComment || request.note, 4000) || '–',
    managerComment: cleanText(request.managerComment, 4000) || '–',
    status: request.status === 'approved' ? 'Genehmigt' : request.status === 'rejected' ? 'Abgelehnt' : 'Ausstehend',
    requestLabel: requestLabel(kind),
  }
}
function decisionValues(request, employee) {
  const values = requestValues(request, employee)
  const kind = requestKind(request)
  values.period = kind === 'change'
    ? `Bisheriger Zeitraum: ${values.oldPeriod}\nNeuer Zeitraum: ${values.newPeriod}`
    : `Zeitraum: ${values.period}`
  const managerComment = cleanText(request.managerComment, 4000)
  values.managerComment = managerComment ? `\nKommentar des Genehmigers: ${managerComment}` : ''
  return values
}

function containsOnlyAllowedPlaceholders(text, allowed) {
  if (typeof text !== 'string') return false
  const pattern = /{{\s*([^{}\s]+)\s*}}/g
  const matches = [...text.matchAll(pattern)]
  const remainder = text.replace(pattern, '')
  return matches.every((match) => allowed.includes(match[1])) && !remainder.includes('{{') && !remainder.includes('}}')
}
function validTemplate(id, value) {
  const definition = templateDefinitions[id]
  const subject = typeof value?.subject === 'string' ? value.subject.trim() : ''
  const message = typeof value?.message === 'string' ? value.message.trim() : ''
  if (subject.length > 240 || message.length > 12000) return false
  return Boolean(definition && subject && message && containsOnlyAllowedPlaceholders(subject, definition.allowedPlaceholders) && containsOnlyAllowedPlaceholders(message, definition.allowedPlaceholders))
}
function templateData(id, value) {
  const definition = templateDefinitions[id]
  return {
    id,
    displayName: definition.displayName,
    subject: validTemplate(id, value) ? cleanText(value.subject, 240) : definition.subject,
    message: validTemplate(id, value) ? cleanText(value.message, 12000) : definition.message,
    allowedPlaceholders: definition.allowedPlaceholders,
    ...(value?.updatedAt ? { updatedAt: value.updatedAt } : {}),
    ...(value?.updatedBy ? { updatedBy: value.updatedBy } : {}),
  }
}
async function loadTemplate(id) {
  const saved = await db.doc(`systemMailTemplates/${id}`).get()
  return templateData(id, saved.exists ? saved.data() : null)
}
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
function textToHtml(message) {
  const paragraphs = String(message ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[\t ]*(?:\n[\t ]*)+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('')
}
function renderTemplate(template, values) {
  const replace = (text) => text.replace(/{{\s*([^{}\s]+)\s*}}/g, (_, name) => template.allowedPlaceholders.includes(name) ? String(values[name] ?? '–') : '')
  const subject = replace(template.subject)
  const message = replace(template.message)
  return { subject, message, messageHtml: textToHtml(message) }
}

async function sendWebhook(recipient, templateId, values) {
  const url = powerAutomateNotificationUrl.value()
  if (!url) throw new Error('notification-service-not-configured')
  const template = await loadTemplate(templateId)
  const { subject, message, messageHtml } = renderTemplate(template, values)
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: recipient, subject, message, messageHtml, type: templateId }) })
  if (!response.ok) throw new Error(`notification-service-${response.status}`)
}

async function deliverVacationMail({ requestId, deliveryId, recipientId, recipient, templateId, values }) {
  if (!emailPattern.test(recipient || '')) return
  const deliveryRef = db.doc(`vacationRequests/${requestId}/mailDeliveries/${deliveryId}`)
  let claimed = false
  await db.runTransaction(async (transaction) => {
    const delivery = await transaction.get(deliveryRef)
    const data = delivery.data()
    if (data?.status === 'sent') return
    if (data?.status === 'sending' && data.lockedAt?.toMillis?.() > Date.now() - 10 * 60 * 1000) return
    claimed = true
    transaction.set(deliveryRef, { templateId, recipientUserId: recipientId, status: 'sending', attempts: (data?.attempts || 0) + 1, lockedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  })
  if (!claimed) return
  try {
    await sendWebhook(recipient, templateId, values)
    await deliveryRef.set({ status: 'sent', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete() }, { merge: true })
  } catch (error) {
    await deliveryRef.set({ status: 'failed', failedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: 'delivery-failed' }, { merge: true })
    throw error
  }
}

async function activeManagers(departmentId) {
  if (!departmentId) return []
  const users = await db.collection('users').get()
  return users.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((profile) => isActive(profile) && profile.vacationManager === true && (profile.vacationManagerAllDepartments === true || (Array.isArray(profile.vacationManagerDepartments) && profile.vacationManagerDepartments.includes(departmentId))))
}
async function sendSubmissionNotifications(requestId, request) {
  if (!['pending', 'change_requested', 'cancellation_requested'].includes(request.status)) return
  const employeeSnapshot = await db.doc(`users/${request.userId}`).get()
  const employee = employeeSnapshot.exists ? employeeSnapshot.data() : null
  if (!isActive(employee)) return
  const kind = requestKind(request)
  const templateBase = kind === 'request' ? 'vacation_request' : kind === 'change' ? 'vacation_change' : 'vacation_cancellation'
  const departmentId = employee.departmentId || employee.department || ''
  const departmentSnapshot = departmentId ? await db.doc(`departments/${departmentId}`).get() : null
  const department = departmentSnapshot?.exists && departmentSnapshot.data().active !== false ? departmentSnapshot.data() : null
  const values = requestValues(request, employee)
  values.department = cleanText(department?.name, 160) || values.department
  const managers = await activeManagers(departmentId)
  await Promise.all([
    deliverVacationMail({ requestId, deliveryId: `${templateBase}_confirmation_${request.userId}`, recipientId: request.userId, recipient: employee.email, templateId: `${templateBase}_confirmation`, values }),
    ...managers.map((manager) => deliverVacationMail({ requestId, deliveryId: `${templateBase}_manager_${manager.id}`, recipientId: manager.id, recipient: manager.email, templateId: `${templateBase}_manager`, values })),
  ])
}
async function sendDecisionNotification(requestId, request) {
  if (!['approved', 'rejected'].includes(request.status)) return
  const employeeSnapshot = await db.doc(`users/${request.userId}`).get()
  const employee = employeeSnapshot.exists ? employeeSnapshot.data() : null
  if (!isActive(employee)) return
  await deliverVacationMail({ requestId, deliveryId: `vacation_${request.status}_${request.userId}`, recipientId: request.userId, recipient: employee.email, templateId: `vacation_${request.status}`, values: decisionValues(request, employee) })
}

export const notifyVacationRequestCreated = onDocumentCreated({ region, document: 'vacationRequests/{requestId}', secrets: [powerAutomateNotificationUrl], retry: true }, async (event) => {
  await sendSubmissionNotifications(event.params.requestId, event.data.data())
})

export const notifyVacationRequestDecision = onDocumentUpdated({ region, document: 'vacationRequests/{requestId}', secrets: [powerAutomateNotificationUrl], retry: true }, async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()
  if (before.status === after.status) return
  await sendDecisionNotification(event.params.requestId, after)
})

async function assertActiveSuperadmin(request) { return requireRole(await requireActiveProfile(request), ['superadmin'], 'Diese Aktion ist nur für Superadmins erlaubt.') }
async function assertActiveAdmin(request) { return requireRole(await requireActiveProfile(request), ['admin', 'superadmin'], 'Diese Aktion ist nur für Admins erlaubt.') }

export const listSystemMailTemplates = onCall({ region }, async (request) => {
  await assertActiveSuperadmin(request)
  const snapshots = await Promise.all(Object.keys(templateDefinitions).map((id) => db.doc(`systemMailTemplates/${id}`).get()))
  return { templates: snapshots.map((snapshot) => templateData(snapshot.id, snapshot.exists ? snapshot.data() : null)) }
})

export const updateSystemMailTemplate = onCall({ region }, async (request) => {
  await assertActiveSuperadmin(request)
  const { id, subject, message } = request.data || {}
  if (typeof id !== 'string' || !Object.hasOwn(templateDefinitions, id)) throw new HttpsError('invalid-argument', 'Unbekannte Systemmail-Vorlage.')
  if (!validTemplate(id, { subject, message })) throw new HttpsError('invalid-argument', 'Betreff oder Nachricht enthalten unzulässige Platzhalter oder sind leer.')
  const definition = templateDefinitions[id]
  await db.doc(`systemMailTemplates/${id}`).set({ id, displayName: definition.displayName, subject: cleanText(subject, 240), message: cleanText(message, 12000), allowedPlaceholders: definition.allowedPlaceholders, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid })
  return { template: templateData(id, { subject, message, updatedBy: request.auth.uid }) }
})

export const sendSystemTestMail = onCall({ region, secrets: [powerAutomateNotificationUrl] }, async (request) => {
  const profile = await assertActiveAdmin(request)
  const authUser = await getAuth().getUser(request.auth.uid)
  const recipient = emailPattern.test(profile.email || '') ? profile.email.trim() : authUser.email
  if (!emailPattern.test(recipient || '')) throw new HttpsError('failed-precondition', 'Für das aktive Benutzerprofil ist keine gültige E-Mail-Adresse vorhanden.')
  try {
    await sendWebhook(recipient, 'system_test', {})
  } catch {
    throw new HttpsError('unavailable', 'Die Testmail konnte nicht versendet werden.')
  }
  return { sent: true }
})
