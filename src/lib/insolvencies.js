import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'

export const INSOLVENCIES_COLLECTION = 'insolvencies'

const trim = (value) => typeof value === 'string' ? value.trim() : ''
const optionalText = (value) => trim(value) || null
const optionalDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(trim(value)) ? trim(value) : null

function mapSnapshot(snapshot) { return { id: snapshot.id, ...snapshot.data() } }

function updateMetadata(actor) {
  return { updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: getUserDisplayName(actor.profile, actor.user) }
}

function insolvencyMetadata(insolvency, actor) {
  return { description: insolvency.description ?? null, knownDate: insolvency.knownDate ?? null, ...updateMetadata(actor) }
}

function amount(value, label) {
  const parsed = Number(value)
  if (value === '' || value === null || value === undefined || !Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} muss als positiver Betrag oder 0,00 € erfasst werden.`)
  return parsed
}

function updatePayload(text, actor) {
  return { type: 'system', text, createdByUserId: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), createdAt: serverTimestamp() }
}

function claimPayload(values) {
  const invoiceNumber = trim(values.invoiceNumber)
  const netAmount = amount(values.netAmount, 'Netto')
  const vatAmount = amount(values.vatAmount, 'USt.')
  if (!invoiceNumber) throw new Error('Bitte eine Rechnungsnummer erfassen.')
  if (invoiceNumber.length > 240) throw new Error('Die Rechnungsnummer ist zu lang.')
  return { invoiceNumber, netAmount, vatAmount, grossAmount: netAmount + vatAmount, filedInInsolvencyTable: values.filedInInsolvencyTable === true }
}

function quotaPaymentPayload(values) {
  const paymentDate = trim(values.paymentDate)
  const netAmount = amount(values.netAmount, 'Netto')
  const vatAmount = amount(values.vatAmount, 'USt.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new Error('Bitte ein gültiges Datum erfassen.')
  return { paymentDate, netAmount, vatAmount, grossAmount: netAmount + vatAmount }
}

function formatDate(value) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`))
}

function insolvencyDeadlinePayload(values) {
  const date = trim(values.date)
  const note = optionalText(values.note)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Bitte ein gültiges Datum erfassen.')
  if (note && note.length > 4000) throw new Error('Die Bemerkung darf maximal 4.000 Zeichen enthalten.')
  return { date, reminderEnabled: values.reminderEnabled === true, note }
}

function insolvencyDeadlineLabel(value) {
  return formatDate(value)
}

export function createEmptyInsolvency() {
  return { partnerId: '', insolvencyDate: '', knownDate: '', courtReference: '', courtVenue: '' }
}

export async function listInsolvencies() {
  return (await getDocs(query(collection(db, INSOLVENCIES_COLLECTION), orderBy('updatedAt', 'desc')))).docs.map(mapSnapshot)
}

export async function getInsolvency(partnerId) {
  const snapshot = await getDoc(doc(db, INSOLVENCIES_COLLECTION, partnerId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function listInsolvencyPartners() {
  const result = await httpsCallable(functions, 'listInsolvencyPartners')()
  return Array.isArray(result.data?.partners) ? result.data.partners : []
}

export async function createInsolvency(values, partner, actor) {
  if (!partner?.id || !trim(partner.companyName)) throw new Error('Bitte ein betroffenes Unternehmen auswählen.')
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, partner.id)
  if ((await getDoc(insolvencyRef)).exists()) throw new Error('Für dieses Unternehmen ist bereits ein Insolvenzfall angelegt.')

  const actorName = getUserDisplayName(actor.profile, actor.user)
  const batch = writeBatch(db)
  batch.set(insolvencyRef, {
    partnerId: partner.id,
    partnerName: trim(partner.companyName),
    insolvencyDate: optionalDate(values.insolvencyDate),
    knownDate: optionalDate(values.knownDate),
    courtReference: optionalText(values.courtReference),
    courtVenue: optionalText(values.courtVenue),
    description: null,
    createdAt: serverTimestamp(),
    createdBy: actor.user.uid,
    createdByName: actorName,
    ...updateMetadata(actor),
  })
  batch.update(doc(db, 'businessPartners', partner.id), { status: 'insolvency', ...updateMetadata(actor) })
  await batch.commit()
  return partner.id
}

export async function updateInsolvency(insolvency, values, actor) {
  const next = {
    insolvencyDate: optionalDate(values.insolvencyDate),
    knownDate: optionalDate(values.knownDate),
    courtReference: optionalText(values.courtReference),
    courtVenue: optionalText(values.courtVenue),
    description: optionalText(insolvency.description),
  }
  if (!Object.entries(next).some(([field, value]) => value !== (insolvency[field] ?? null))) return false
  await writeBatch(db).update(doc(db, INSOLVENCIES_COLLECTION, insolvency.id), { ...next, ...updateMetadata(actor) }).commit()
  return true
}

export async function updateInsolvencyDescription(insolvency, value, actor) {
  const description = optionalText(value)
  if (description && description.length > 4000) throw new Error('Die Beschreibung darf maximal 4.000 Zeichen enthalten.')
  if (description === (insolvency.description ?? null)) return false
  await writeBatch(db).update(doc(db, INSOLVENCIES_COLLECTION, insolvency.id), { description, knownDate: insolvency.knownDate ?? null, ...updateMetadata(actor) }).commit()
  return true
}

export function createEmptyInsolvencyClaim() {
  return { invoiceNumber: '', netAmount: '', vatAmount: '', filedInInsolvencyTable: false }
}

export function createEmptyInsolvencyQuotaPayment() {
  return { paymentDate: new Date().toISOString().slice(0, 10), netAmount: '', vatAmount: '' }
}

export function createEmptyInsolvencyDeadline() {
  return { date: new Date().toISOString().slice(0, 10), reminderEnabled: false, note: '' }
}

export function insolvencyDeadlinePresentation(deadline, now = new Date()) {
  if (!deadline?.date) return { kind: 'none', label: 'Keine Frist' }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const date = new Date(`${deadline.date}T12:00:00`)
  const days = Math.round((date - today) / 86400000)
  if (days < 0) return { kind: 'overdue', label: `${Math.abs(days)} ${Math.abs(days) === 1 ? 'Tag' : 'Tage'} überfällig` }
  if (days === 0) return { kind: 'today', label: 'heute' }
  if (days <= 2) return { kind: 'urgent', label: `in ${days} ${days === 1 ? 'Tag' : 'Tagen'}` }
  if (days <= 5) return { kind: 'warning', label: `in ${days} Tagen` }
  return { kind: 'none', label: `in ${days} Tagen` }
}

export async function listInsolvencyClaims(partnerId) {
  return (await getDocs(collection(db, INSOLVENCIES_COLLECTION, partnerId, 'claims'))).docs
    .map(mapSnapshot)
    .sort((left, right) => left.invoiceNumber.localeCompare(right.invoiceNumber, 'de') || (left.createdAt?.seconds || 0) - (right.createdAt?.seconds || 0))
}

export async function listInsolvencyQuotaPayments(partnerId) {
  return (await getDocs(collection(db, INSOLVENCIES_COLLECTION, partnerId, 'quotaPayments'))).docs
    .map(mapSnapshot)
    .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate) || (right.createdAt?.seconds || 0) - (left.createdAt?.seconds || 0))
}

export async function listInsolvencyDeadlines(partnerId) {
  return (await getDocs(collection(db, INSOLVENCIES_COLLECTION, partnerId, 'deadlines'))).docs
    .map(mapSnapshot)
    .sort((left, right) => left.date.localeCompare(right.date) || (left.createdAt?.seconds || 0) - (right.createdAt?.seconds || 0))
}

export async function listInsolvencyUpdates(partnerId) {
  return (await getDocs(query(collection(db, INSOLVENCIES_COLLECTION, partnerId, 'updates'), orderBy('createdAt', 'desc')))).docs.map(mapSnapshot)
}

export async function createInsolvencyClaim(insolvency, values, actor) {
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, insolvency.id)
  const claim = claimPayload(values)
  const batch = writeBatch(db)
  batch.update(insolvencyRef, insolvencyMetadata(insolvency, actor))
  batch.set(doc(collection(insolvencyRef, 'claims')), { ...claim, createdAt: serverTimestamp(), createdBy: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), ...updateMetadata(actor) })
  batch.set(doc(collection(insolvencyRef, 'updates')), updatePayload(`Rechnung ${claim.invoiceNumber} hinzugefügt.`, actor))
  await batch.commit()
}

export async function updateInsolvencyClaim(insolvency, claim, values, actor) {
  const next = claimPayload(values)
  if (!Object.entries(next).some(([field, value]) => value !== claim[field])) return false
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, insolvency.id)
  const message = claim.filedInInsolvencyTable !== next.filedInInsolvencyTable
    ? `Rechnung ${next.invoiceNumber} ${next.filedInInsolvencyTable ? 'zur Insolvenztabelle angemeldet' : 'von der Insolvenztabelle abgemeldet'}.`
    : `Rechnung ${next.invoiceNumber} bearbeitet.`
  const batch = writeBatch(db)
  batch.update(insolvencyRef, insolvencyMetadata(insolvency, actor))
  batch.update(doc(insolvencyRef, 'claims', claim.id), { ...next, ...updateMetadata(actor) })
  batch.set(doc(collection(insolvencyRef, 'updates')), updatePayload(message, actor))
  await batch.commit()
  return true
}

export async function deleteInsolvencyClaim(insolvency, claim, actor) {
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, insolvency.id)
  const batch = writeBatch(db)
  batch.update(insolvencyRef, insolvencyMetadata(insolvency, actor))
  batch.delete(doc(insolvencyRef, 'claims', claim.id))
  batch.set(doc(collection(insolvencyRef, 'updates')), updatePayload(`Rechnung ${claim.invoiceNumber} gelöscht.`, actor))
  await batch.commit()
}

export async function createInsolvencyQuotaPayment(insolvency, values, actor) {
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, insolvency.id)
  const payment = quotaPaymentPayload(values)
  const batch = writeBatch(db)
  batch.update(insolvencyRef, insolvencyMetadata(insolvency, actor))
  batch.set(doc(collection(insolvencyRef, 'quotaPayments')), { ...payment, createdAt: serverTimestamp(), createdBy: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), ...updateMetadata(actor) })
  batch.set(doc(collection(insolvencyRef, 'updates')), updatePayload(`Quotenzahlung vom ${formatDate(payment.paymentDate)} hinzugefügt.`, actor))
  await batch.commit()
}

export async function updateInsolvencyQuotaPayment(insolvency, payment, values, actor) {
  const next = quotaPaymentPayload(values)
  if (!Object.entries(next).some(([field, value]) => value !== payment[field])) return false
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, insolvency.id)
  const batch = writeBatch(db)
  batch.update(insolvencyRef, insolvencyMetadata(insolvency, actor))
  batch.update(doc(insolvencyRef, 'quotaPayments', payment.id), { ...next, ...updateMetadata(actor) })
  batch.set(doc(collection(insolvencyRef, 'updates')), updatePayload(`Quotenzahlung vom ${formatDate(next.paymentDate)} bearbeitet.`, actor))
  await batch.commit()
  return true
}

export async function deleteInsolvencyQuotaPayment(insolvency, payment, actor) {
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, insolvency.id)
  const batch = writeBatch(db)
  batch.update(insolvencyRef, insolvencyMetadata(insolvency, actor))
  batch.delete(doc(insolvencyRef, 'quotaPayments', payment.id))
  batch.set(doc(collection(insolvencyRef, 'updates')), updatePayload(`Quotenzahlung vom ${formatDate(payment.paymentDate)} gelöscht.`, actor))
  await batch.commit()
}

export async function createInsolvencyDeadline(insolvency, values, actor) {
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, insolvency.id)
  const deadline = insolvencyDeadlinePayload(values)
  const actorName = getUserDisplayName(actor.profile, actor.user)
  const batch = writeBatch(db)
  batch.update(insolvencyRef, insolvencyMetadata(insolvency, actor))
  batch.set(doc(collection(insolvencyRef, 'deadlines')), { ...deadline, createdAt: serverTimestamp(), createdBy: actor.user.uid, createdByName: actorName, ...updateMetadata(actor) })
  batch.set(doc(collection(insolvencyRef, 'updates')), updatePayload(`Termin für ${insolvencyDeadlineLabel(deadline.date)} hinzugefügt.`, actor))
  await batch.commit()
}

export async function updateInsolvencyDeadline(insolvency, deadline, values, actor) {
  const next = insolvencyDeadlinePayload(values)
  if (!Object.entries(next).some(([field, value]) => value !== (deadline[field] ?? null))) return false
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, insolvency.id)
  const batch = writeBatch(db)
  batch.update(insolvencyRef, insolvencyMetadata(insolvency, actor))
  batch.update(doc(insolvencyRef, 'deadlines', deadline.id), { ...next, ...updateMetadata(actor) })
  batch.set(doc(collection(insolvencyRef, 'updates')), updatePayload(`Termin vom ${insolvencyDeadlineLabel(next.date)} geändert.`, actor))
  await batch.commit()
  return true
}
