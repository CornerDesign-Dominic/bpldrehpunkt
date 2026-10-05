import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { hasActiveProfile, requireActiveProfile, requireRole } from './access.js'
import { externalEffectsAllowed, externalEffectsEnvironment, logExternalEffectsSkipped } from './externalEffects.js'
import { areAutomaticMailsPaused } from './automaticMailDelivery.js'
import { shipmentTrackingArrivalConfirmationPath, shipmentTrackingArrivalConfirmationTemplateId } from './shared/shipmentTrackingArrivalConfirmation.js'

if (!getApps().length) initializeApp()
const db = getFirestore()
export const systemMailNotificationUrl = defineSecret('POWER_AUTOMATE_NOTIFICATION_URL')
export const shipmentTrackingMailNotificationUrl = defineSecret('POWER_AUTOMATE_TRACKING_NOTIFICATION_URL')
const region = 'europe-west3'
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const systemMailTemplateDefinitions = {
  vacation_request_confirmation: {
    displayName: 'Antrag – Bestätigung',
    subject: 'Urlaub [Antrag] - {{employeeName}}',
    message: 'Dein Urlaubsantrag wurde versendet.\n\nDein Urlaubsantrag:\n\nZeitraum: {{period}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}\nKommentar: {{comment}}\n\nStatus:\nAusstehend',
    allowedPlaceholders: ['employeeName', 'period', 'days', 'vacationType', 'comment'],
  },
  vacation_request_manager: {
    displayName: 'Antrag – Urlaubsmanagement',
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
  vacation_cancellation_withdrawn_confirmation: {
    displayName: 'Stornoantrag – Rückzug',
    subject: 'Urlaub [Storno zurückgezogen] - {{employeeName}}',
    message: 'Dein Stornoantrag wurde zurückgezogen.\n\nDer genehmigte Urlaub bleibt unverändert bestehen.\n\nZeitraum: {{period}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}\n\nStatus Urlaub:\nGenehmigt',
    allowedPlaceholders: ['employeeName', 'period', 'days', 'vacationType'],
  },
  vacation_cancellation_withdrawn_manager: {
    displayName: 'Stornoantrag – Rückzug für Urlaubsmanagement',
    subject: 'Urlaub [Storno zurückgezogen] - {{employeeName}}',
    message: '{{employeeName}} hat den Stornoantrag zurückgezogen.\n\nDer genehmigte Urlaub bleibt unverändert bestehen.\n\nAbteilung: {{department}}\nZeitraum: {{period}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}',
    allowedPlaceholders: ['employeeName', 'department', 'period', 'days', 'vacationType'],
  },
  vacation_approved: {
    displayName: 'Genehmigung',
    subject: 'Urlaub [Genehmigt] - {{employeeName}}',
    message: 'Dein {{requestLabel}} wurde genehmigt.\n\n{{requestLabel}}:\n\n{{period}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}{{managerComment}}\n\nStatus:\nGenehmigt',
    allowedPlaceholders: ['employeeName', 'requestLabel', 'period', 'days', 'vacationType', 'managerComment'],
  },
  vacation_rejected: {
    displayName: 'Ablehnung',
    subject: 'Urlaub [Abgelehnt] - {{employeeName}}',
    message: 'Dein {{requestLabel}} wurde abgelehnt.\n\n{{requestLabel}}:\n\n{{period}}\nUrlaubstage: {{days}}\nUrlaubsart: {{vacationType}}{{managerComment}}\n\nStatus:\nAbgelehnt',
    allowedPlaceholders: ['employeeName', 'requestLabel', 'period', 'days', 'vacationType', 'managerComment'],
  },
  shipment_tracking_license_plate_request: {
    displayName: 'Kennzeichen anfragen',
    subject: 'TA {{transportOrderNumber}} – Kennzeichen / Registration number',
    message: 'Hallo,\n\nkönnt ihr uns bitte kurz das Kennzeichen für TA {{transportOrderNumber}} schicken?\n\nLadestelle / Loading site: {{loadingLocation}}\nTermin / Time slot: {{loadingTime}}\n\nCould you please send us the vehicle registration number for order {{transportOrderNumber}}?\n\nLoading site: {{loadingLocation}}\nTime slot: {{loadingTime}}',
    allowedPlaceholders: ['transportOrderNumber', 'loadingLocation', 'loadingTime'],
  },
  shipment_tracking_arrival_request: {
    displayName: 'LKW-Ankunft anfragen',
    subject: 'TA {{transportOrderNumber}} – ETA Ladestelle / Loading ETA',
    message: 'Hallo,\n\nkönnt ihr uns bitte kurz die voraussichtliche Ankunft an der Ladestelle für TA {{transportOrderNumber}} schicken?\n\nLadestelle / Loading site: {{loadingLocation}}\nTermin / Time slot: {{loadingTime}}\n\nCould you please let us know the expected arrival time at the loading site for order {{transportOrderNumber}}?\n\nLoading site: {{loadingLocation}}\nTime slot: {{loadingTime}}',
    allowedPlaceholders: ['transportOrderNumber', 'loadingLocation', 'loadingTime'],
  },
  shipment_tracking_license_plate_and_arrival_request: {
    displayName: 'Kennzeichen und LKW-Ankunft anfragen',
    subject: 'TA {{transportOrderNumber}} – Kennzeichen + ETA / Registration + ETA',
    message: 'Hallo,\n\nkönnt ihr uns bitte kurz das Kennzeichen und die voraussichtliche Ankunft an der Ladestelle für TA {{transportOrderNumber}} schicken?\n\nLadestelle / Loading site: {{loadingLocation}}\nTermin / Time slot: {{loadingTime}}\n\nCould you please send us the vehicle registration number and the expected arrival time at the loading site for order {{transportOrderNumber}}?\n\nLoading site: {{loadingLocation}}\nTime slot: {{loadingTime}}',
    allowedPlaceholders: ['transportOrderNumber', 'loadingLocation', 'loadingTime'],
  },
  shipment_tracking_general_status_update: {
    displayName: 'Status-Update anfragen',
    subject: 'TA {{transportOrderNumber}} – Kurzes Update / Quick update',
    message: 'Hallo,\n\nkönnt ihr uns bitte kurz ein Update zum aktuellen Stand von TA {{transportOrderNumber}} geben?\n\nLadestelle / Loading site: {{loadingLocation}}\nTermin / Time slot: {{loadingTime}}\n\nCould you please send us a brief update on the current status of order {{transportOrderNumber}}?\n\nLoading site: {{loadingLocation}}\nTime slot: {{loadingTime}}',
    allowedPlaceholders: ['transportOrderNumber', 'loadingLocation', 'loadingTime'],
  },
  shipment_tracking_loading_eta_request: {
    displayName: 'ETA Ladestelle anfragen',
    subject: 'TA {{transportOrderNumber}} – ETA Ladestelle / Loading ETA',
    message: 'Hallo,\n\nkönnt ihr uns bitte kurz die voraussichtliche Ankunft an der Ladestelle für TA {{transportOrderNumber}} schicken?\n\nLadestelle / Loading site: {{loadingLocation}}\nTermin / Time slot: {{loadingTime}}\n\nCould you please let us know the expected arrival time at the loading site for order {{transportOrderNumber}}?\n\nLoading site: {{loadingLocation}}\nTime slot: {{loadingTime}}',
    allowedPlaceholders: ['transportOrderNumber', 'loadingLocation', 'loadingTime'],
  },
  shipment_tracking_loading_arrival_request: {
    displayName: 'LS Ankunft anfragen',
    subject: 'TA {{transportOrderNumber}} – Ankunft Ladestelle / Loading arrival',
    message: 'Hallo,\n\nist das Fahrzeug für TA {{transportOrderNumber}} schon an der Ladestelle angekommen? Falls nicht, wann kommt es voraussichtlich an?\n\nLadestelle / Loading site: {{loadingLocation}}\nTermin / Time slot: {{loadingTime}}\n\nHas the vehicle for order {{transportOrderNumber}} already arrived at the loading site? If not, when do you expect it to arrive?\n\nLoading site: {{loadingLocation}}\nTime slot: {{loadingTime}}',
    allowedPlaceholders: ['transportOrderNumber', 'loadingLocation', 'loadingTime'],
  },
  shipment_tracking_loading_departure_request: {
    displayName: 'LS Abfahrt anfragen',
    subject: 'TA {{transportOrderNumber}} – Abfahrt Ladestelle / Loading departure',
    message: 'Hallo,\n\nist die Beladung für TA {{transportOrderNumber}} abgeschlossen und das Fahrzeug schon von der Ladestelle abgefahren? Bitte schickt uns kurz die Abfahrtszeit.\n\nLadestelle / Loading site: {{loadingLocation}}\n\nHas loading for order {{transportOrderNumber}} been completed and has the vehicle already left the loading site? Please send us the departure time.\n\nLoading site: {{loadingLocation}}',
    allowedPlaceholders: ['transportOrderNumber', 'loadingLocation'],
  },
  shipment_tracking_unloading_eta_request: {
    displayName: 'ETA zur Entladestelle anfragen',
    subject: 'TA {{transportOrderNumber}} – ETA Entladestelle / Unloading ETA',
    message: 'Hallo,\n\nkönnt ihr uns bitte kurz die aktuelle ETA an der Entladestelle für TA {{transportOrderNumber}} schicken? Falls verfügbar, gerne auch Restfahrzeit oder Restkilometer.\n\nEntladestelle / Unloading site: {{unloadingLocation}}\n\nCould you please send us the current ETA at the unloading site for order {{transportOrderNumber}}? If available, the remaining driving time or distance is also helpful.\n\nUnloading site: {{unloadingLocation}}',
    allowedPlaceholders: ['transportOrderNumber', 'unloadingLocation'],
  },
  shipment_tracking_unloading_arrival_request: {
    displayName: 'Tatsächliche Ankunft Entladestelle anfragen',
    subject: 'TA {{transportOrderNumber}} – Ankunft Entladestelle / Unloading arrival',
    message: 'Hallo,\n\nist das Fahrzeug für TA {{transportOrderNumber}} schon an der Entladestelle angekommen? Wenn ja, schickt uns bitte kurz die tatsächliche Ankunftszeit. Wenn nicht, brauchen wir die aktuelle ETA.\n\nEntladestelle / Unloading site: {{unloadingLocation}}\n\nHas the vehicle for order {{transportOrderNumber}} already arrived at the unloading site? If so, please send us the actual arrival time. If not, we need the current ETA.\n\nUnloading site: {{unloadingLocation}}',
    allowedPlaceholders: ['transportOrderNumber', 'unloadingLocation'],
  },
  shipment_tracking_loading_update_request: {
    displayName: 'Update zur Beladung anfragen',
    subject: 'TA {{transportOrderNumber}} – Beladestatus / Loading status',
    message: 'Hallo,\n\nkönnt ihr uns bitte kurz den Beladestatus für TA {{transportOrderNumber}} schicken? Ist das Fahrzeug schon da, läuft die Beladung oder ist sie bereits fertig? Wenn möglich, bitte mit den Zeiten und der geplanten Abfahrt.\n\nLadestelle / Loading site: {{loadingLocation}}\n\nCould you please send us a brief loading status for order {{transportOrderNumber}}? Has the vehicle arrived, is loading in progress, or is it already completed? If possible, please include the times and planned departure.\n\nLoading site: {{loadingLocation}}',
    allowedPlaceholders: ['transportOrderNumber', 'loadingLocation'],
  },
  shipment_tracking_unloading_update_request: {
    displayName: 'Update zur Entladung anfragen',
    subject: 'TA {{transportOrderNumber}} – Entladestatus / Unloading status',
    message: 'Hallo,\n\nkönnt ihr uns bitte kurz den Entladestatus für TA {{transportOrderNumber}} schicken? Ist das Fahrzeug schon da, läuft die Entladung oder ist sie bereits fertig? Wenn möglich, bitte mit den Zeiten.\n\nEntladestelle / Unloading site: {{unloadingLocation}}\n\nCould you please send us a brief unloading status for order {{transportOrderNumber}}? Has the vehicle arrived, is unloading in progress, or is it already completed? If possible, please include the times.\n\nUnloading site: {{unloadingLocation}}',
    allowedPlaceholders: ['transportOrderNumber', 'unloadingLocation'],
  },
  [shipmentTrackingArrivalConfirmationTemplateId]: {
    displayName: 'Kurz vor Beladung bestätigen',
    subject: 'TA {{transportOrderNumber}} – Kurzes Update / Quick update',
    message: 'Hallo,\n\nkönnt ihr uns bitte kurz bestätigen, ob bei TA {{transportOrderNumber}} alles wie geplant läuft? Wichtig wäre vor allem die aktuelle ETA an der Ladestelle.\n\nLadestelle / Loading site: {{loadingLocation}}\nGeplanter Beginn / Planned start: {{loadingTime}}\n\nCould you please confirm whether everything is on schedule for order {{transportOrderNumber}}? The current ETA at the loading site is especially helpful.\n\nLoading site: {{loadingLocation}}\nPlanned start: {{loadingTime}}',
    allowedPlaceholders: ['transportOrderNumber', 'loadingLocation', 'loadingTime'],
  },
  case_deadline_reminder: {
    displayName: 'Fälle – Termin- und Fristerinnerung',
    subject: '{{caseType}} {{caseNumber}} – Erinnerung',
    message: 'Erinnerung zu {{caseType}} {{caseNumber}}.\n\nTermin / Frist: {{dueDateTime}}\nBemerkung: {{note}}\n\nBitte im Drehpunkt prüfen.',
    allowedPlaceholders: ['caseType', 'caseNumber', 'dueDateTime', 'note'],
  },
  todo_deadline_reminder: {
    displayName: 'To-dos – Termin- und Fristerinnerung',
    subject: 'To-do {{todoTitle}} – Erinnerung',
    message: 'Erinnerung zu deinem To-do „{{todoTitle}}“.\n\nTermin / Frist: {{dueDateTime}}\nBemerkung: {{note}}\n\nBitte im Drehpunkt prüfen.',
    allowedPlaceholders: ['todoTitle', 'dueDateTime', 'note'],
  },
  system_test: {
    displayName: 'Testmail',
    subject: 'Drehpunkt Testmail',
    message: 'Die Drehpunkt-Systemmail-Schnittstelle funktioniert.',
    allowedPlaceholders: [],
  },
}

const templateDefinitions = systemMailTemplateDefinitions

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
  if (!saved.exists && id === shipmentTrackingArrivalConfirmationTemplateId) {
    const legacy = await db.doc(shipmentTrackingArrivalConfirmationPath).get()
    return templateData(id, legacy.exists ? legacy.data() : null)
  }
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

async function sendWebhook(recipient, templateId, values, { allowDevelopment = false, templateOverride = null, automatic = true } = {}) {
  if (automatic && await areAutomaticMailsPaused()) {
    logger.info('Automatische Systemmail ist global pausiert.', { templateId })
    return false
  }
  const manualDevelopmentDelivery = allowDevelopment && externalEffectsEnvironment() === 'development'
  if (!externalEffectsAllowed() && !manualDevelopmentDelivery) {
    logExternalEffectsSkipped('system-mail-webhook')
    return false
  }
  // Every external shipment-tracking request, scheduled or sent explicitly
  // by an authorized user, is sent from the dedicated status mailbox.
  const useShipmentTrackingSender = templateId.startsWith('shipment_tracking_')
  const url = (useShipmentTrackingSender ? shipmentTrackingMailNotificationUrl : systemMailNotificationUrl).value()
  if (!url) throw new Error('notification-service-not-configured')
  const template = templateOverride ? { ...templateDefinitions[templateId], ...templateOverride } : await loadTemplate(templateId)
  const { subject, message, messageHtml } = renderTemplate(template, values)
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: recipient, subject, message, messageHtml, type: templateId }) })
  if (!response.ok) throw new Error(`notification-service-${response.status}`)
  return true
}

/** Shared delivery primitive. Callers decide which controlled template and
 * values are permitted; this function never chooses a recipient or rule. */
export async function sendSystemMailTemplate({ recipient, templateId, values, subject, message, allowDevelopment = false, automatic = true }) {
  if (!emailPattern.test(recipient || '')) throw new HttpsError('invalid-argument', 'Die Empfänger-E-Mail-Adresse ist ungültig.')
  if (!Object.hasOwn(templateDefinitions, templateId)) throw new HttpsError('invalid-argument', 'Die Systemmail-Vorlage ist unbekannt.')
  const hasOverride = subject !== undefined || message !== undefined
  if (hasOverride && !validTemplate(templateId, { subject, message })) throw new HttpsError('invalid-argument', 'Betreff oder Nachricht enthalten unzulässige Platzhalter oder sind leer.')
  return sendWebhook(recipient, templateId, values, { allowDevelopment, automatic, templateOverride: hasOverride ? { subject: cleanText(subject, 240), message: cleanText(message, 12000) } : null })
}

export async function previewSystemMailTemplate({ templateId, values }) {
  if (!Object.hasOwn(templateDefinitions, templateId)) throw new HttpsError('invalid-argument', 'Die Systemmail-Vorlage ist unbekannt.')
  return renderTemplate(await loadTemplate(templateId), values)
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
    const delivered = await sendWebhook(recipient, templateId, values)
    if (!delivered) {
      await deliveryRef.set({ status: 'paused', pausedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: 'automatic-mail-delivery-paused' }, { merge: true })
      return
    }
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
async function sendCancellationWithdrawalNotifications(requestId, request) {
  if (requestKind(request) !== 'cancellation' || request.requestStatus !== 'withdrawn') return
  const employeeSnapshot = await db.doc(`users/${request.userId}`).get()
  const employee = employeeSnapshot.exists ? employeeSnapshot.data() : null
  if (!isActive(employee)) return
  const values = requestValues(request, employee)
  const departmentId = employee.departmentId || employee.department || ''
  const departmentSnapshot = departmentId ? await db.doc(`departments/${departmentId}`).get() : null
  const department = departmentSnapshot?.exists && departmentSnapshot.data().active !== false ? departmentSnapshot.data() : null
  values.department = cleanText(department?.name, 160) || values.department
  const managers = await activeManagers(departmentId)
  await Promise.all([
    deliverVacationMail({ requestId, deliveryId: `vacation_cancellation_withdrawn_confirmation_${request.userId}`, recipientId: request.userId, recipient: employee.email, templateId: 'vacation_cancellation_withdrawn_confirmation', values }),
    ...managers.map((manager) => deliverVacationMail({ requestId, deliveryId: `vacation_cancellation_withdrawn_manager_${manager.id}`, recipientId: manager.id, recipient: manager.email, templateId: 'vacation_cancellation_withdrawn_manager', values })),
  ])
}

export const notifyVacationRequestCreated = onDocumentCreated({ region, document: 'vacationRequests/{requestId}', secrets: [systemMailNotificationUrl], retry: true }, async (event) => {
  if (!externalEffectsAllowed()) {
    logExternalEffectsSkipped('vacation-request-notifications')
    return
  }
  await sendSubmissionNotifications(event.params.requestId, event.data.data())
})

export const notifyVacationRequestDecision = onDocumentUpdated({ region, document: 'vacationRequests/{requestId}', secrets: [systemMailNotificationUrl], retry: true }, async (event) => {
  if (!externalEffectsAllowed()) {
    logExternalEffectsSkipped('vacation-decision-notifications')
    return
  }
  const before = event.data.before.data()
  const after = event.data.after.data()
  if (before.status === after.status && before.requestStatus === after.requestStatus) return
  await sendCancellationWithdrawalNotifications(event.params.requestId, after)
  await sendDecisionNotification(event.params.requestId, after)
})

async function assertActiveSuperadmin(request) { return requireRole(await requireActiveProfile(request), ['superadmin'], 'Diese Aktion ist nur für Superadmins erlaubt.') }
async function assertActiveAdmin(request) { return requireRole(await requireActiveProfile(request), ['admin', 'superadmin'], 'Diese Aktion ist nur für Admins erlaubt.') }

export const listSystemMailTemplates = onCall({ region, enforceAppCheck: true }, async (request) => {
  await assertActiveSuperadmin(request)
  const snapshots = await Promise.all(Object.entries(templateDefinitions).filter(([, definition]) => definition.adminVisible !== false).map(([id]) => db.doc(`systemMailTemplates/${id}`).get()))
  const legacyArrivalTemplate = await db.doc(shipmentTrackingArrivalConfirmationPath).get()
  return { templates: snapshots.map((snapshot) => templateData(snapshot.id, snapshot.exists ? snapshot.data() : snapshot.id === shipmentTrackingArrivalConfirmationTemplateId && legacyArrivalTemplate.exists ? legacyArrivalTemplate.data() : null)) }
})

export const updateSystemMailTemplate = onCall({ region, enforceAppCheck: true }, async (request) => {
  await assertActiveSuperadmin(request)
  const { id, subject, message } = request.data || {}
  if (typeof id !== 'string' || !Object.hasOwn(templateDefinitions, id) || templateDefinitions[id].adminVisible === false) throw new HttpsError('invalid-argument', 'Unbekannte Systemmail-Vorlage.')
  if (!validTemplate(id, { subject, message })) throw new HttpsError('invalid-argument', 'Betreff oder Nachricht enthalten unzulässige Platzhalter oder sind leer.')
  const definition = templateDefinitions[id]
  await db.doc(`systemMailTemplates/${id}`).set({ id, displayName: definition.displayName, subject: cleanText(subject, 240), message: cleanText(message, 12000), allowedPlaceholders: definition.allowedPlaceholders, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid })
  return { template: templateData(id, { subject, message, updatedBy: request.auth.uid }) }
})

export const sendSystemTestMail = onCall({ region, enforceAppCheck: true, secrets: [systemMailNotificationUrl] }, async (request) => {
  const profile = await assertActiveAdmin(request)
  if (!externalEffectsAllowed()) {
    logExternalEffectsSkipped('system-mail-test')
    throw new HttpsError('failed-precondition', 'Der Systemmail-Versand ist außerhalb der Produktionsumgebung deaktiviert.')
  }
  const authUser = await getAuth().getUser(request.auth.uid)
  const recipient = emailPattern.test(profile.email || '') ? profile.email.trim() : authUser.email
  if (!emailPattern.test(recipient || '')) throw new HttpsError('failed-precondition', 'Für das aktive Benutzerprofil ist keine gültige E-Mail-Adresse vorhanden.')
  try {
    await sendWebhook(recipient, 'system_test', {}, { automatic: false })
  } catch {
    throw new HttpsError('unavailable', 'Die Testmail konnte nicht versendet werden.')
  }
  return { sent: true }
})
