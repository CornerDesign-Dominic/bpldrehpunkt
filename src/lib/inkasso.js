import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'

export const INKASSO_CASES_COLLECTION = 'inkassoCases'
export const INKASSO_CASE_STATUSES = [
  { value: 'open', label: 'Offen' },
  { value: 'in_progress', label: 'In Bearbeitung' },
  { value: 'completed', label: 'Abgeschlossen' },
]
export const INKASSO_MOVEMENT_TYPES = [
  { value: 'main_claim', label: 'Hauptforderung' },
  { value: 'payment', label: 'Zahlung' },
  { value: 'dunning_costs', label: 'Mahnkosten' },
  { value: 'interest', label: 'Zinsen' },
  { value: 'legal_fees', label: 'Rechtsanwaltskosten' },
  { value: 'court_costs', label: 'Gerichtskosten' },
  { value: 'collection_costs', label: 'Inkassokosten' },
  { value: 'other_costs', label: 'Sonstige Kosten' },
]

const inkassoCasesRef = collection(db, INKASSO_CASES_COLLECTION)
const trim = (value) => typeof value === 'string' ? value.trim() : ''
const optionalText = (value) => trim(value) || null
const optionalDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(trim(value)) ? trim(value) : null
const optionalAmount = (value, label = 'Der Betrag') => {
  if (value === '' || value === null || value === undefined) return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} muss eine positive Zahl sein.`)
  return amount
}

function mapSnapshot(snapshot) { return { id: snapshot.id, ...snapshot.data() } }

function casePayload(values, responsibleUsersById) {
  const responsibleUserId = optionalText(values.responsibleUserId)
  const responsibleUser = responsibleUserId ? responsibleUsersById.get(responsibleUserId) : null
  const responsibleUserName = responsibleUserId ? (responsibleUser ? getUserDisplayName(responsibleUser, responsibleUser) : optionalText(values.responsibleUserName)) : null
  if (responsibleUserId && !responsibleUserName) throw new Error('Die zuständige Person ist nicht verfügbar.')
  const status = INKASSO_CASE_STATUSES.some((item) => item.value === values.status) ? values.status : 'open'
  return {
    title: optionalText(values.title),
    description: optionalText(values.description),
    status,
    isClosed: status === 'completed',
    debtorName: optionalText(values.debtorName),
    debtorNumber: optionalText(values.debtorNumber),
    debtorContactName: optionalText(values.debtorContactName),
    debtorAddress: optionalText(values.debtorAddress),
    debtorEmail: optionalText(values.debtorEmail),
    debtorPhone: optionalText(values.debtorPhone),
    responsibleUserId,
    responsibleUserName,
    invoiceNumbers: optionalText(values.invoiceNumbers),
    invoiceDate: optionalDate(values.invoiceDate),
    originalDueDate: optionalDate(values.originalDueDate),
    lastReminderDate: optionalDate(values.lastReminderDate),
    lawFirm: optionalText(values.lawFirm),
    lawyerReference: optionalText(values.lawyerReference),
    lawFirmContactName: optionalText(values.lawFirmContactName),
    lawFirmEmail: optionalText(values.lawFirmEmail),
    lawFirmPhone: optionalText(values.lawFirmPhone),
    lawyerHandoverDate: optionalDate(values.lawyerHandoverDate),
    court: optionalText(values.court),
    courtReference: optionalText(values.courtReference),
    paymentOrderDate: optionalDate(values.paymentOrderDate),
    enforcementOrderDate: optionalDate(values.enforcementOrderDate),
    titleAvailable: values.titleAvailable === true,
  }
}

function updateMetadata(actor) {
  return { updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: getUserDisplayName(actor.profile, actor.user) }
}

function updatePayload(type, text, actor) {
  return { type, text, createdByUserId: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), createdAt: serverTimestamp() }
}

function systemMessages(previous, next) {
  const messages = []
  if (previous.status !== next.status) messages.push(`Status geändert: ${inkassoCaseStatusLabel(previous.status)} → ${inkassoCaseStatusLabel(next.status)}`)
  if (previous.description !== next.description) messages.push('Beschreibung aktualisiert')
  if (Object.entries(next).some(([field, value]) => !['description', 'status', 'isClosed'].includes(field) && value !== (previous[field] ?? null))) messages.push('Fallinformationen aktualisiert')
  return messages
}

export function inkassoCaseStatusLabel(status) {
  return INKASSO_CASE_STATUSES.find((item) => item.value === status)?.label || '—'
}

export function isClosedInkassoCase(inkassoCase) {
  return inkassoCase.isClosed === true || inkassoCase.status === 'completed'
}

export function createEmptyInkassoMovement() {
  return { date: new Date().toISOString().slice(0, 10), type: 'main_claim', amount: '', description: '' }
}

export async function listInkassoCases() {
  const snapshots = await getDocs(query(inkassoCasesRef, orderBy('createdAt', 'desc')))
  return snapshots.docs.map(mapSnapshot)
}

export async function getInkassoCase(caseId) {
  const snapshot = await getDoc(doc(db, INKASSO_CASES_COLLECTION, caseId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function updateInkassoCaseFields(inkassoCase, values, actor, responsibleUsersById) {
  const next = casePayload({ ...inkassoCase, ...values }, responsibleUsersById)
  const changedFields = Object.fromEntries(Object.entries(next).filter(([field, value]) => value !== (inkassoCase[field] ?? null)))
  if (!Object.keys(changedFields).length) return false
  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const batch = writeBatch(db)
  const statusCompleted = next.status === 'completed'
  const completedAt = statusCompleted && !inkassoCase.isClosed ? serverTimestamp() : !statusCompleted && inkassoCase.isClosed ? null : inkassoCase.completedAt || null
  batch.update(caseRef, { ...changedFields, completedAt, ...updateMetadata(actor) })
  systemMessages(inkassoCase, next).forEach((text) => batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', text, actor)))
  await batch.commit()
  return true
}

export async function listInkassoCaseUpdates(caseId) {
  return (await getDocs(query(collection(db, INKASSO_CASES_COLLECTION, caseId, 'updates'), orderBy('createdAt', 'desc')))).docs.map(mapSnapshot)
}

export async function addInkassoCaseUpdate(inkassoCase, text, actor) {
  const cleanText = trim(text)
  if (!cleanText) throw new Error('Bitte einen Update-Text eingeben.')
  if (cleanText.length > 1000) throw new Error('Das Update ist zu lang.')
  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('note', cleanText, actor))
  await batch.commit()
}

export async function addInkassoCaseSystemUpdate(inkassoCase, text, actor) {
  const cleanText = trim(text)
  if (!cleanText) throw new Error('Bitte einen Systemeintrag angeben.')
  await writeBatch(db).set(doc(collection(db, INKASSO_CASES_COLLECTION, inkassoCase.id, 'updates')), updatePayload('system', cleanText, actor)).commit()
}

function movementPayload(values) {
  const date = optionalDate(values.date)
  const type = INKASSO_MOVEMENT_TYPES.some((item) => item.value === values.type) ? values.type : ''
  const amount = optionalAmount(values.amount)
  if (!date || !type || amount === null) throw new Error('Bitte Datum, Art und Betrag erfassen.')
  return { date, type, amount, description: optionalText(values.description) }
}

function movementLabel(movement) {
  const label = INKASSO_MOVEMENT_TYPES.find((item) => item.value === movement.type)?.label || 'Betragsbewegung'
  return `${label} · ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(movement.amount)}`
}

export async function listInkassoCaseMovements(caseId) {
  const snapshots = await getDocs(collection(db, INKASSO_CASES_COLLECTION, caseId, 'movements'))
  return snapshots.docs.map(mapSnapshot).sort((left, right) => right.date.localeCompare(left.date) || (right.createdAt?.seconds || 0) - (left.createdAt?.seconds || 0))
}

export async function createInkassoCaseMovement(inkassoCase, values, actor) {
  const movement = movementPayload(values)
  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.set(doc(collection(caseRef, 'movements')), { ...movement, createdAt: serverTimestamp(), createdBy: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), ...updateMetadata(actor) })
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', `Betragsbewegung hinzugefügt: ${movementLabel(movement)}`, actor))
  await batch.commit()
}

export async function updateInkassoCaseMovement(inkassoCase, movement, values, actor) {
  const next = movementPayload(values)
  if (!Object.entries(next).some(([field, value]) => value !== (movement[field] ?? null))) return false
  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.update(doc(caseRef, 'movements', movement.id), { ...next, ...updateMetadata(actor) })
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', `Betragsbewegung aktualisiert: ${movementLabel(next)}`, actor))
  await batch.commit()
  return true
}

export async function deleteInkassoCaseMovement(inkassoCase, movement, actor) {
  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.delete(doc(caseRef, 'movements', movement.id))
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', `Betragsbewegung gelöscht: ${movementLabel(movement)}`, actor))
  await batch.commit()
}
