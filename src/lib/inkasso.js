import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'
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
  { value: 'processing_fees', label: 'Bearbeitungsgebühren' },
  { value: 'other_costs', label: 'Sonstige Kosten' },
]
export const INKASSO_FINANCIAL_COST_TYPES = [
  { value: 'dunning_costs', label: 'Mahngebühr' },
  { value: 'interest', label: 'Zinsen' },
  { value: 'collection_costs', label: 'Inkassogebühr' },
  { value: 'processing_fees', label: 'Bearbeitungsgebühr' },
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

function casePayload(values, responsibleUsersById = new Map()) {
  const responsibleUserId = optionalText(values.responsibleUserId)
  const responsibleUser = responsibleUserId ? responsibleUsersById.get(responsibleUserId) : null
  const responsibleUserName = responsibleUserId ? (responsibleUser ? getUserDisplayName(responsibleUser, responsibleUser) : optionalText(values.responsibleUserName)) : null
  const status = INKASSO_CASE_STATUSES.some((item) => item.value === values.status) ? values.status : 'open'
  return {
    title: optionalText(values.title),
    description: optionalText(values.description),
    collectionAgency: optionalText(values.collectionAgency),
    collectionReference: optionalText(values.collectionReference),
    status,
    isClosed: status === 'completed',
    debtorName: optionalText(values.debtorName),
    debtorPartnerId: optionalText(values.debtorPartnerId),
    debtorPartnerRole: optionalText(values.debtorPartnerRole),
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
    claimAmount: optionalAmount(values.claimAmount, 'Der Forderungsbetrag'),
    paidAmount: optionalAmount(values.paidAmount, 'Der bereits gezahlte Betrag'),
  }
}

function updateMetadata(actor) {
  return { updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: getUserDisplayName(actor.profile, actor.user) }
}

function updatePayload(type, text, actor) {
  return { type, text, createdByUserId: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), createdAt: serverTimestamp() }
}

export function inkassoCaseStatusLabel(status) {
  return INKASSO_CASE_STATUSES.find((item) => item.value === status)?.label || '—'
}

export function isClosedInkassoCase(inkassoCase) {
  return inkassoCase.isClosed === true || inkassoCase.status === 'completed'
}

export function createEmptyInkassoCase() {
  return {
    title: '',
    status: 'open',
    debtorName: '',
    debtorPartnerId: '',
    debtorPartnerRole: '',
    invoices: [],
  }
}

export function createEmptyInkassoMovement() {
  return { date: new Date().toISOString().slice(0, 10), type: 'main_claim', amount: '', description: '' }
}

export async function listInkassoCases() {
  const snapshots = await getDocs(query(inkassoCasesRef, orderBy('createdAt', 'desc')))
  const inkassoCases = snapshots.docs.map(mapSnapshot)
  return Promise.all(inkassoCases.map(async (inkassoCase) => ({
    ...inkassoCase,
    nextDeadline: nextInkassoDeadline(await listInkassoCaseDeadlines(inkassoCase.id)),
  })))
}

export async function getInkassoCase(caseId) {
  const snapshot = await getDoc(doc(db, INKASSO_CASES_COLLECTION, caseId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function createInkassoCase(values) {
  const invoices = normalizeInkassoInvoices(values.invoices)
  const title = optionalText(values.title)
  if (!title) throw new Error('Bitte eine Fallbezeichnung eingeben.')

  const result = await httpsCallable(functions, 'createInkassoCase')({
    title,
    description: optionalText(values.description),
    collectionAgency: optionalText(values.collectionAgency),
    collectionReference: optionalText(values.collectionReference),
    debtorPartnerId: optionalText(values.debtorPartnerId),
    debtorPartnerRole: optionalText(values.debtorPartnerRole),
    invoices,
  })
  return result.data.caseId
}

export function normalizeInkassoInvoices(rows) {
  if (!Array.isArray(rows)) return []
  const invoices = rows.filter((row) => [row?.invoiceNumber, row?.netAmount, row?.vatAmount].some((value) => trim(String(value ?? ''))))
  if (invoices.length > 50) throw new Error('Es können höchstens 50 Rechnungen gleichzeitig erfasst werden.')
  return invoices.map((row) => {
    const invoiceNumber = trim(row.invoiceNumber)
    const netAmount = optionalAmount(row.netAmount, 'Der Nettobetrag')
    const vatAmount = optionalAmount(row.vatAmount, 'Der USt.-Betrag')
    if (!invoiceNumber || netAmount === null || vatAmount === null) throw new Error('Bitte je Rechnung Nummer, Nettobetrag und USt.-Betrag erfassen.')
    if (invoiceNumber.length > 240) throw new Error('Die Rechnungsnummer ist zu lang.')
    return { invoiceNumber, netAmount, vatAmount, grossAmount: netAmount + vatAmount }
  })
}

export async function listInkassoCaseInvoices(caseId) {
  return (await getDocs(query(collection(db, INKASSO_CASES_COLLECTION, caseId, 'invoices'), orderBy('createdAt', 'asc')))).docs.map(mapSnapshot)
}

function invoicePayload(values) {
  const [invoice] = normalizeInkassoInvoices([values])
  if (!invoice) throw new Error('Bitte Rechnungsnummer, Nettobetrag und USt.-Betrag erfassen.')
  return invoice
}

function invoiceCaseAmounts(inkassoCase) {
  const claimAmount = Number(inkassoCase.claimAmount || 0)
  const paidAmount = Number(inkassoCase.paidAmount || 0)
  if (!Number.isFinite(claimAmount) || !Number.isFinite(paidAmount)) throw new Error('Die Rechnungsbeträge sind ungültig.')
  return { claimAmount, paidAmount }
}

export async function createInkassoCaseInvoice(inkassoCase, values, actor) {
  const invoice = invoicePayload(values)
  const { claimAmount, paidAmount } = invoiceCaseAmounts(inkassoCase)
  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const actorName = getUserDisplayName(actor.profile, actor.user)
  const batch = writeBatch(db)
  batch.update(caseRef, { claimAmount: claimAmount + invoice.grossAmount, paidAmount, ...updateMetadata(actor) })
  batch.set(doc(collection(caseRef, 'invoices')), { ...invoice, isPaid: false, paidAt: null, paidBy: null, paidByName: null, createdAt: serverTimestamp(), createdBy: actor.user.uid, createdByName: actorName })
  await batch.commit()
}

export async function updateInkassoCaseInvoice(inkassoCase, invoice, values, actor) {
  const next = invoicePayload(values)
  if (!Object.entries(next).some(([field, value]) => value !== invoice[field])) return false
  const { claimAmount, paidAmount } = invoiceCaseAmounts(inkassoCase)
  const difference = next.grossAmount - Number(invoice.grossAmount)
  const nextClaimAmount = invoice.isPaid ? claimAmount : claimAmount + difference
  const nextPaidAmount = invoice.isPaid ? paidAmount + difference : paidAmount
  if (nextClaimAmount < 0 || nextPaidAmount < 0) throw new Error('Der Forderungsbetrag kann nicht negativ werden.')

  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, { claimAmount: nextClaimAmount, paidAmount: nextPaidAmount, ...updateMetadata(actor) })
  batch.update(doc(caseRef, 'invoices', invoice.id), next)
  await batch.commit()
  return true
}

export async function updateInkassoInvoicePayment(inkassoCase, invoice, isPaid, actor) {
  if (invoice.isPaid === isPaid) return false
  const grossAmount = Number(invoice.grossAmount)
  const { claimAmount, paidAmount } = invoiceCaseAmounts(inkassoCase)
  if (!Number.isFinite(grossAmount)) throw new Error('Die Rechnungsbeträge sind ungültig.')
  const direction = isPaid ? 1 : -1
  const nextClaimAmount = claimAmount - direction * grossAmount
  const nextPaidAmount = paidAmount + direction * grossAmount
  if (nextClaimAmount < 0 || nextPaidAmount < 0) throw new Error('Der Forderungsbetrag kann nicht negativ werden.')

  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const actorName = getUserDisplayName(actor.profile, actor.user)
  const batch = writeBatch(db)
  batch.update(caseRef, { claimAmount: nextClaimAmount, paidAmount: nextPaidAmount, ...updateMetadata(actor) })
  batch.update(doc(caseRef, 'invoices', invoice.id), {
    isPaid,
    paidAt: isPaid ? serverTimestamp() : null,
    paidBy: isPaid ? actor.user.uid : null,
    paidByName: isPaid ? actorName : null,
  })
  await batch.commit()
  return true
}

function deadlinePayload(values) {
  const date = trim(values.date)
  const note = optionalText(values.note)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Bitte ein gültiges Datum erfassen.')
  if (note && note.length > 4000) throw new Error('Die Bemerkung ist zu lang.')
  return { date, reminderEnabled: values.reminderEnabled === true, note }
}

export function createEmptyInkassoDeadline() {
  return { date: new Date().toISOString().slice(0, 10), reminderEnabled: false, note: '' }
}

export function inkassoDeadlinePresentation(deadline, now = new Date()) {
  if (!deadline?.date) return { kind: 'none', label: 'Keine Frist', days: null }
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const due = new Date(`${deadline.date}T12:00:00`)
  const days = Math.round((due - today) / 86400000)
  if (days < 0) return { kind: 'overdue', label: `${Math.abs(days)} ${Math.abs(days) === 1 ? 'Tag' : 'Tage'} überfällig`, days }
  if (days === 0) return { kind: 'today', label: 'Heute', days }
  if (days <= 2) return { kind: 'urgent', label: `In ${days} ${days === 1 ? 'Tag' : 'Tagen'}`, days }
  if (days <= 5) return { kind: 'warning', label: `In ${days} Tagen`, days }
  return { kind: 'none', label: 'Später', days }
}

export function nextInkassoDeadline(deadlines) {
  return Array.isArray(deadlines) ? deadlines.find((deadline) => deadline?.date) || null : null
}

export async function listInkassoCaseDeadlines(caseId) {
  const snapshots = await getDocs(collection(db, INKASSO_CASES_COLLECTION, caseId, 'deadlines'))
  return snapshots.docs.map(mapSnapshot).sort((left, right) => left.date.localeCompare(right.date) || (left.createdAt?.seconds || 0) - (right.createdAt?.seconds || 0))
}

export async function createInkassoCaseDeadline(inkassoCase, values, actor) {
  const deadline = deadlinePayload(values)
  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.set(doc(collection(caseRef, 'deadlines')), { ...deadline, createdAt: serverTimestamp(), createdBy: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), ...updateMetadata(actor) })
  await batch.commit()
}

export async function updateInkassoCaseDeadline(inkassoCase, deadline, values, actor) {
  const next = deadlinePayload(values)
  if (!Object.entries(next).some(([field, value]) => value !== (deadline[field] ?? null))) return false
  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.update(doc(caseRef, 'deadlines', deadline.id), { ...next, ...updateMetadata(actor) })
  await batch.commit()
  return true
}

export async function deleteInkassoCaseDeadline(inkassoCase, deadline, actor) {
  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.delete(doc(caseRef, 'deadlines', deadline.id))
  await batch.commit()
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
  await batch.commit()
  return true
}

export async function listInkassoCaseUpdates(caseId) {
  return (await getDocs(query(collection(db, INKASSO_CASES_COLLECTION, caseId, 'updates'), orderBy('createdAt', 'desc')))).docs.map(mapSnapshot)
}

export async function listInkassoCaseHistory(caseId) {
  return (await getDocs(query(collection(db, INKASSO_CASES_COLLECTION, caseId, 'history'), orderBy('createdAt', 'desc')))).docs.map(mapSnapshot)
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

function movementPayload(values) {
  const date = optionalDate(values.date)
  const type = INKASSO_MOVEMENT_TYPES.some((item) => item.value === values.type) ? values.type : ''
  const amount = optionalAmount(values.amount)
  if (!date || !type || amount === null) throw new Error('Bitte Datum, Art und Betrag erfassen.')
  return { date, type, amount, description: optionalText(values.description) }
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
  await batch.commit()
}

export async function updateInkassoCaseMovement(inkassoCase, movement, values, actor) {
  const next = movementPayload(values)
  if (!Object.entries(next).some(([field, value]) => value !== (movement[field] ?? null))) return false
  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.update(doc(caseRef, 'movements', movement.id), { ...next, ...updateMetadata(actor) })
  await batch.commit()
  return true
}

export async function deleteInkassoCaseMovement(inkassoCase, movement, actor) {
  const caseRef = doc(db, INKASSO_CASES_COLLECTION, inkassoCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.delete(doc(caseRef, 'movements', movement.id))
  await batch.commit()
}
