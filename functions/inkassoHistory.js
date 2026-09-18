import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentCreatedWithAuthContext, onDocumentDeletedWithAuthContext, onDocumentUpdatedWithAuthContext } from 'firebase-functions/v2/firestore'

const region = 'europe-west3'
const movementLabels = {
  main_claim: 'Hauptforderung',
  payment: 'Zahlung',
  dunning_costs: 'Mahnkosten',
  interest: 'Zinsen',
  legal_fees: 'Rechtsanwaltskosten',
  court_costs: 'Gerichtskosten',
  collection_costs: 'Inkassokosten',
  other_costs: 'Sonstige Kosten',
}

function database() { return getFirestore() }

async function actorFrom(data = {}, event) {
  const userId = event.authId || (typeof data.updatedBy === 'string' ? data.updatedBy : typeof data.createdBy === 'string' ? data.createdBy : typeof data.uploadedByUserId === 'string' ? data.uploadedByUserId : null)
  const profile = userId ? await database().doc(`users/${userId}`).get() : null
  const profileName = [profile?.data()?.firstName, profile?.data()?.lastName].filter(Boolean).join(' ').trim()
  return {
    userId,
    name: profileName || (typeof data.updatedByName === 'string' ? data.updatedByName : typeof data.createdByName === 'string' ? data.createdByName : typeof data.uploadedByName === 'string' ? data.uploadedByName : 'System'),
  }
}

function values(fields, data) {
  return Object.fromEntries(fields.map((field) => [field, data[field] ?? null]))
}

function changed(before, after, fields) {
  return fields.some((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null))
}

async function writeHistory(caseId, id, eventType, text, actor, previousValues = null, nextValues = null) {
  await database().doc(`inkassoCases/${caseId}/history/${id}`).set({
    id,
    caseId,
    eventType,
    text,
    source: 'server',
    createdAt: FieldValue.serverTimestamp(),
    createdByUserId: actor.userId,
    createdByName: actor.name,
    ...(previousValues ? { previousValues } : {}),
    ...(nextValues ? { nextValues } : {}),
  })
}

export const recordInkassoCaseCreated = onDocumentCreatedWithAuthContext({ region, document: 'inkassoCases/{caseId}' }, async (event) => {
  await writeHistory(event.params.caseId, event.id, 'case_created', 'Fall angelegt', await actorFrom(event.data.data(), event))
})

export const recordInkassoCaseUpdated = onDocumentUpdatedWithAuthContext({ region, document: 'inkassoCases/{caseId}' }, async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()
  const actor = await actorFrom(after, event)
  const events = []
  if (before.status !== after.status) events.push(['status_changed', `Status geändert: ${before.status || '—'} → ${after.status || '—'}`, values(['status'], before), values(['status'], after)])
  if (before.responsibleUserId !== after.responsibleUserId) events.push(['responsible_changed', 'Zuständigkeit geändert', values(['responsibleUserId', 'responsibleUserName'], before), values(['responsibleUserId', 'responsibleUserName'], after)])
  if (changed(before, after, ['lawFirm', 'lawyerReference', 'lawFirmContactName', 'lawFirmEmail', 'lawFirmPhone', 'lawyerHandoverDate'])) events.push(['legal_representative_updated', 'Rechtsanwalt / Kanzlei aktualisiert', values(['lawFirm', 'lawyerReference'], before), values(['lawFirm', 'lawyerReference'], after)])
  const informationFields = ['title', 'description', 'debtorName', 'debtorNumber', 'debtorContactName', 'debtorAddress', 'debtorEmail', 'debtorPhone', 'invoiceNumbers', 'invoiceDate', 'originalDueDate', 'lastReminderDate', 'court', 'courtReference', 'paymentOrderDate', 'enforcementOrderDate', 'titleAvailable']
  if (changed(before, after, informationFields)) events.push(['case_information_updated', 'Fallinformationen aktualisiert', null, null])
  await Promise.all(events.map(([eventType, text, previousValues, nextValues], index) => writeHistory(event.params.caseId, `${event.id}-${index}`, eventType, text, actor, previousValues, nextValues)))
})

export const recordInkassoDocumentCreated = onDocumentCreatedWithAuthContext({ region, document: 'inkassoCases/{caseId}/documents/{documentId}' }, async (event) => {
  const document = event.data.data()
  await writeHistory(event.params.caseId, event.id, 'document_created', `Dokument hinzugefügt: ${document.title || document.fileName || 'Unbenanntes Dokument'}`, await actorFrom(document, event))
})

export const recordInkassoDocumentUpdated = onDocumentUpdatedWithAuthContext({ region, document: 'inkassoCases/{caseId}/documents/{documentId}' }, async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()
  if (!changed(before, after, ['title', 'description'])) return
  await writeHistory(event.params.caseId, event.id, 'document_updated', `Dokument aktualisiert: ${after.title || after.fileName || 'Unbenanntes Dokument'}`, await actorFrom(after, event))
})

export const recordInkassoDocumentDeleted = onDocumentDeletedWithAuthContext({ region, document: 'inkassoCases/{caseId}/documents/{documentId}' }, async (event) => {
  const document = event.data.data()
  await writeHistory(event.params.caseId, event.id, 'document_deleted', `Dokument gelöscht: ${document.title || document.fileName || 'Unbenanntes Dokument'}`, await actorFrom(document, event))
})

export const recordInkassoInvoiceCreated = onDocumentCreatedWithAuthContext({ region, document: 'inkassoCases/{caseId}/invoices/{invoiceId}' }, async (event) => {
  const invoice = event.data.data()
  await writeHistory(event.params.caseId, event.id, 'invoice_created', `Rechnung hinzugefügt: ${invoice.invoiceNumber}`, await actorFrom(invoice, event), null, values(['invoiceNumber', 'netAmount', 'vatAmount', 'grossAmount'], invoice))
})

export const recordInkassoInvoicePaymentUpdated = onDocumentUpdatedWithAuthContext({ region, document: 'inkassoCases/{caseId}/invoices/{invoiceId}' }, async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()
  if (before.isPaid !== after.isPaid) {
    await writeHistory(event.params.caseId, event.id, after.isPaid ? 'invoice_paid' : 'invoice_payment_reverted', after.isPaid ? `Rechnung als bezahlt markiert: ${after.invoiceNumber}` : `Zahlungsstatus zurückgesetzt: ${after.invoiceNumber}`, await actorFrom(after, event), values(['isPaid'], before), values(['isPaid'], after))
    return
  }
  if (!changed(before, after, ['invoiceNumber', 'netAmount', 'vatAmount', 'grossAmount'])) return
  await writeHistory(event.params.caseId, event.id, 'invoice_updated', `Rechnung aktualisiert: ${after.invoiceNumber}`, await actorFrom(after, event), values(['invoiceNumber', 'netAmount', 'vatAmount', 'grossAmount'], before), values(['invoiceNumber', 'netAmount', 'vatAmount', 'grossAmount'], after))
})

export const recordInkassoDeadlineCreated = onDocumentCreatedWithAuthContext({ region, document: 'inkassoCases/{caseId}/deadlines/{deadlineId}' }, async (event) => {
  const deadline = event.data.data()
  await writeHistory(event.params.caseId, event.id, 'deadline_created', `Termin hinzugefügt: ${deadline.date}`, await actorFrom(deadline, event), null, values(['date', 'reminderEnabled', 'note'], deadline))
})

export const recordInkassoDeadlineUpdated = onDocumentUpdatedWithAuthContext({ region, document: 'inkassoCases/{caseId}/deadlines/{deadlineId}' }, async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()
  if (!changed(before, after, ['date', 'reminderEnabled', 'note'])) return
  await writeHistory(event.params.caseId, event.id, 'deadline_updated', `Termin aktualisiert: ${after.date}`, await actorFrom(after, event), values(['date', 'reminderEnabled', 'note'], before), values(['date', 'reminderEnabled', 'note'], after))
})

function movementText(action, movement) {
  return `${movementLabels[movement.type] || 'Betragsbewegung'} ${action}`
}

export const recordInkassoMovementCreated = onDocumentCreatedWithAuthContext({ region, document: 'inkassoCases/{caseId}/movements/{movementId}' }, async (event) => {
  const movement = event.data.data()
  await writeHistory(event.params.caseId, event.id, 'movement_created', movementText('hinzugefügt', movement), await actorFrom(movement, event), null, values(['date', 'type', 'amount'], movement))
})

export const recordInkassoMovementUpdated = onDocumentUpdatedWithAuthContext({ region, document: 'inkassoCases/{caseId}/movements/{movementId}' }, async (event) => {
  const before = event.data.before.data()
  const after = event.data.after.data()
  await writeHistory(event.params.caseId, event.id, 'movement_updated', movementText('aktualisiert', after), await actorFrom(after, event), values(['date', 'type', 'amount'], before), values(['date', 'type', 'amount'], after))
})

export const recordInkassoMovementDeleted = onDocumentDeletedWithAuthContext({ region, document: 'inkassoCases/{caseId}/movements/{movementId}' }, async (event) => {
  const movement = event.data.data()
  await writeHistory(event.params.caseId, event.id, 'movement_deleted', movementText('gelöscht', movement), await actorFrom(movement, event), values(['date', 'type', 'amount'], movement))
})
