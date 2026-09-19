import { collection, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'

export const LEGAL_DISPUTES_COLLECTION = 'legalDisputes'
export const LEGAL_DISPUTE_FINANCIAL_DIRECTIONS = [
  { value: 'received', label: 'Wir erhalten' },
  { value: 'paid', label: 'Wir bezahlen' },
]
export const LEGAL_DISPUTE_STATUSES = [
  { value: 'open', label: 'Offen' },
  { value: 'completed', label: 'Abgeschlossen' },
]
export const LEGAL_DISPUTE_SCHEDULE_TYPES = [
  { value: 'deadline', label: 'Frist' },
  { value: 'appointment', label: 'Termin' },
]
export const LEGAL_DISPUTE_PAYMENT_RECIPIENTS = [
  { value: 'court', label: 'Gericht' },
  { value: 'lawyer', label: 'Anwalt' },
  { value: 'bailiff', label: 'Gerichtsvollzieher' },
  { value: 'counterparty', label: 'Gegenseite' },
  { value: 'other', label: 'Sonstiges' },
]

const trim = (value) => (value ?? '').trim()

function mapSnapshot(snapshot) { return { id: snapshot.id, ...snapshot.data() } }

function updatePayload(type, text, actor) {
  return { type, text, createdByUserId: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), createdAt: serverTimestamp() }
}

function updateMetadata(actor) {
  return { updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: getUserDisplayName(actor.profile, actor.user) }
}

function financialEntryPayload(values) {
  const date = trim(values.date)
  const direction = values.direction
  const netAmount = Number(values.netAmount)
  const vatAmount = Number(values.vatAmount || 0)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Bitte ein Zahlungsdatum eingeben.')
  if (!LEGAL_DISPUTE_FINANCIAL_DIRECTIONS.some((item) => item.value === direction)) throw new Error('Bitte auswählen, ob wir bezahlen oder einen Betrag erhalten.')
  if (values.netAmount === '' || values.netAmount === null || values.netAmount === undefined || !Number.isFinite(netAmount) || netAmount < 0) throw new Error('Bitte einen Nettobetrag eingeben.')
  if (!Number.isFinite(vatAmount) || vatAmount < 0) throw new Error('Die Umsatzsteuer muss eine positive Zahl sein.')
  const payeeType = values.payeeType
  if (!LEGAL_DISPUTE_PAYMENT_RECIPIENTS.some((item) => item.value === payeeType)) throw new Error('Bitte die Gegenpartei auswählen.')
  return { date, direction, payeeType, netAmount, vatAmount }
}

function financialEntryLabel(entry) {
  const direction = LEGAL_DISPUTE_FINANCIAL_DIRECTIONS.find((item) => item.value === entry.direction)?.label || 'Zahlung'
  const recipient = LEGAL_DISPUTE_PAYMENT_RECIPIENTS.find((item) => item.value === entry.payeeType)?.label
  return recipient ? `${direction} · ${recipient}` : direction
}

function legalDisputeDeadlinePayload(values) {
  const type = values.type
  const date = trim(values.date)
  const time = trim(values.time)
  const note = trim(values.note)
  if (!LEGAL_DISPUTE_SCHEDULE_TYPES.some((item) => item.value === type)) throw new Error('Bitte auswählen, ob es sich um eine Frist oder einen Termin handelt.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Bitte ein gültiges Datum erfassen.')
  if (time && !/^\d{2}:\d{2}$/.test(time)) throw new Error('Bitte eine gültige Uhrzeit erfassen.')
  return { type, date, time: time || null, reminderEnabled: values.reminderEnabled === true, note: note || null }
}

function legalDisputeDeadlineLabel(deadline) {
  return `${legalDisputeScheduleTypeLabel(deadline.type)} für ${new Intl.DateTimeFormat('de-DE').format(new Date(`${deadline.date}T12:00:00`))}`
}

export function legalDisputeStatusLabel(status) {
  return LEGAL_DISPUTE_STATUSES.find((item) => item.value === status)?.label || 'Offen'
}

export function legalDisputeScheduleTypeLabel(type) {
  return LEGAL_DISPUTE_SCHEDULE_TYPES.find((item) => item.value === type)?.label || 'Termin / Frist'
}

export function createEmptyLegalDispute() {
  return {
    caseType: '',
    counterparty: '',
    transportReference: '',
  }
}

export async function createLegalDispute(values, actor) {
  const transportReference = trim(values.transportReference)
  if (!transportReference) throw new Error('Bitte die Transportauftragsnummer eingeben.')

  const year = String(new Date().getFullYear())
  const counterRef = doc(db, 'legalDisputeCaseCounters', year)
  const actorName = getUserDisplayName(actor.profile, actor.user)
  const optionalText = (value) => trim(value) || null
  let caseRef
  await runTransaction(db, async (transaction) => {
    const counter = await transaction.get(counterRef)
    const sequence = (counter.exists() ? Number(counter.data().nextNumber) || 0 : 0) + 1
    if (sequence > 9999) throw new Error(`Für ${year} können keine weiteren Fallnummern vergeben werden.`)

    const caseNumber = `G-${year}-${String(sequence).padStart(4, '0')}`
    caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, caseNumber)
    transaction.set(counterRef, { year, nextNumber: sequence, updatedAt: serverTimestamp() })
    transaction.set(caseRef, {
      caseNumber,
      caseYear: year,
      caseSequence: sequence,
      status: 'open',
      isClosed: false,
      title: `${caseNumber} – ${transportReference}`,
      description: null,
      caseType: optionalText(values.caseType),
      participant: null,
      counterparty: optionalText(values.counterparty),
      transportReference,
      opposingCounsel: null,
      opposingRepresentation: null,
      opposingReference: null,
      responsibleUserId: null,
      responsibleUserName: null,
      lawFirm: null,
      ownCounsel: null,
      lawyerReference: null,
      lawyerHandoverDate: null,
      lawyerPhone: null,
      lawyerEmail: null,
      court: null,
      courtLocation: null,
      courtReference: null,
      judgeOrChamber: null,
      nextDeadline: null,
      nextDeadlineLabel: null,
      nextHearing: null,
      nextHearingTime: null,
      procedureType: null,
      proceedingStage: null,
      instance: null,
      startedAt: new Date().toISOString().slice(0, 10),
      completedAt: null,
      originalClaim: null,
      counterClaim: null,
      amountInDispute: null,
      paidAmount: null,
      openAmount: null,
      legalFees: null,
      courtCosts: null,
      otherCosts: null,
      createdAt: serverTimestamp(),
      createdBy: actor.user.uid,
      createdByName: actorName,
      updatedAt: serverTimestamp(),
      updatedBy: actor.user.uid,
      updatedByName: actorName,
    })
    transaction.set(doc(collection(caseRef, 'updates')), updatePayload('system', 'Fall angelegt', actor))
  })
  return caseRef.id
}

export async function getLegalDispute(legalDisputeId) {
  const snapshot = await getDoc(doc(db, LEGAL_DISPUTES_COLLECTION, legalDisputeId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function listLegalDisputes() {
  const disputes = (await getDocs(query(collection(db, LEGAL_DISPUTES_COLLECTION), orderBy('updatedAt', 'desc')))).docs.map(mapSnapshot)
  return Promise.all(disputes.map(async (legalDispute) => ({ ...legalDispute, nextSchedule: nextLegalDisputeDeadline(await listLegalDisputeDeadlines(legalDispute.id)) })))
}

export async function listLegalDisputeUpdates(legalDisputeId) {
  return (await getDocs(query(collection(db, LEGAL_DISPUTES_COLLECTION, legalDisputeId, 'updates'), orderBy('createdAt', 'desc')))).docs.map(mapSnapshot)
}

export function createEmptyLegalDisputeDeadline() {
  return { type: 'deadline', date: new Date().toISOString().slice(0, 10), time: '', reminderEnabled: false, note: '' }
}

export function legalDisputeDeadlinePresentation(deadline, now = new Date()) {
  if (!deadline?.date) return { kind: 'none', label: 'Kein Termin', days: null }
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const due = new Date(`${deadline.date}T12:00:00`)
  const days = Math.round((due - today) / 86400000)
  if (days < 0) return { kind: 'overdue', label: `${Math.abs(days)} ${Math.abs(days) === 1 ? 'Tag' : 'Tage'} überfällig`, days }
  if (days === 0) return { kind: 'today', label: 'Heute', days }
  if (days <= 3) return { kind: 'urgent', label: `In ${days} ${days === 1 ? 'Tag' : 'Tagen'}`, days }
  if (days <= 7) return { kind: 'warning', label: `In ${days} Tagen`, days }
  return { kind: 'none', label: 'Später', days }
}

export function nextLegalDisputeDeadline(deadlines, now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const datedDeadlines = (deadlines || []).filter((deadline) => /^\d{4}-\d{2}-\d{2}$/.test(deadline?.date || ''))
  const byDate = (left, right) => left.date.localeCompare(right.date) || (left.time || '').localeCompare(right.time || '')
  const overdue = datedDeadlines.filter((deadline) => new Date(`${deadline.date}T12:00:00`) < today).sort(byDate)
  if (overdue.length) return overdue[0]
  return datedDeadlines.filter((deadline) => new Date(`${deadline.date}T12:00:00`) >= today).sort(byDate)[0] || null
}

export async function listLegalDisputeDeadlines(legalDisputeId) {
  const snapshots = await getDocs(collection(db, LEGAL_DISPUTES_COLLECTION, legalDisputeId, 'deadlines'))
  return snapshots.docs.map(mapSnapshot).sort((left, right) => left.date.localeCompare(right.date) || (left.time || '').localeCompare(right.time || '') || (left.createdAt?.seconds || 0) - (right.createdAt?.seconds || 0))
}

export async function createLegalDisputeDeadline(legalDispute, values, actor) {
  const deadline = legalDisputeDeadlinePayload(values)
  const caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, legalDispute.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.set(doc(collection(caseRef, 'deadlines')), { ...deadline, createdAt: serverTimestamp(), createdBy: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), ...updateMetadata(actor) })
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', `${legalDisputeDeadlineLabel(deadline)} hinzugefügt.`, actor))
  await batch.commit()
}

export async function updateLegalDisputeDeadline(legalDispute, deadline, values, actor) {
  const next = legalDisputeDeadlinePayload(values)
  if (!Object.entries(next).some(([field, value]) => value !== (deadline[field] ?? null))) return false
  const caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, legalDispute.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.update(doc(caseRef, 'deadlines', deadline.id), { ...next, ...updateMetadata(actor) })
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', `${legalDisputeDeadlineLabel(next)} aktualisiert.`, actor))
  await batch.commit()
  return true
}

export async function deleteLegalDisputeDeadline(legalDispute, deadline, actor) {
  const caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, legalDispute.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.delete(doc(caseRef, 'deadlines', deadline.id))
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', `${legalDisputeDeadlineLabel(deadline)} gelöscht.`, actor))
  await batch.commit()
}

export function createEmptyLegalDisputeFinancialEntry() {
  return { date: new Date().toISOString().slice(0, 10), direction: 'paid', payeeType: '', netAmount: '', vatAmount: '' }
}

export async function listLegalDisputeFinancialEntries(legalDisputeId) {
  return (await getDocs(query(collection(db, LEGAL_DISPUTES_COLLECTION, legalDisputeId, 'financialEntries'), orderBy('date', 'desc')))).docs.map(mapSnapshot)
}

export async function createLegalDisputeFinancialEntry(legalDispute, values, actor) {
  const entry = financialEntryPayload(values)
  const caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, legalDispute.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.set(doc(collection(caseRef, 'financialEntries')), { ...entry, createdAt: serverTimestamp(), createdBy: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), ...updateMetadata(actor) })
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', `Zahlungsposition hinzugefügt: ${financialEntryLabel(entry)}`, actor))
  await batch.commit()
}

export async function updateLegalDisputeFinancialEntry(legalDispute, entry, values, actor) {
  const next = financialEntryPayload(values)
  if (!Object.entries(next).some(([field, value]) => value !== entry[field])) return false
  const caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, legalDispute.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.update(doc(caseRef, 'financialEntries', entry.id), { ...next, ...updateMetadata(actor) })
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', `Zahlungsposition aktualisiert: ${financialEntryLabel(next)}`, actor))
  await batch.commit()
  return true
}

export async function deleteLegalDisputeFinancialEntry(legalDispute, entry, actor) {
  const caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, legalDispute.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.delete(doc(caseRef, 'financialEntries', entry.id))
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', `Zahlungsposition gelöscht: ${financialEntryLabel(entry)}`, actor))
  await batch.commit()
}

export async function addLegalDisputeUpdate(legalDispute, text, actor) {
  const cleanText = trim(text)
  if (!cleanText) throw new Error('Bitte einen Update-Text eingeben.')
  if (cleanText.length > 1000) throw new Error('Das Update ist zu lang.')
  const caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, legalDispute.id)
  const batch = writeBatch(db)
  batch.update(caseRef, updateMetadata(actor))
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('note', cleanText, actor))
  await batch.commit()
}

export async function addLegalDisputeSystemUpdate(legalDispute, text, actor) {
  const cleanText = trim(text)
  if (!cleanText) throw new Error('Bitte einen Systemeintrag angeben.')
  const caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, legalDispute.id)
  await writeBatch(db).set(doc(collection(caseRef, 'updates')), updatePayload('system', cleanText, actor)).commit()
}

export async function updateLegalDisputeFields(legalDispute, changes, actor, systemText) {
  const nextStatus = changes.status || legalDispute.status
  const next = { ...changes, status: nextStatus, isClosed: nextStatus === 'completed' }
  if (Object.hasOwn(changes, 'transportReference')) {
    const transportReference = trim(changes.transportReference)
    next.transportReference = transportReference || null
    next.title = transportReference ? `${legalDispute.caseNumber} – ${transportReference}` : legalDispute.caseNumber
  }
  if (changes.status && changes.status !== legalDispute.status) next.completedAt = nextStatus === 'completed' ? serverTimestamp() : null
  const caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, legalDispute.id)
  const batch = writeBatch(db)
  batch.update(caseRef, { ...next, ...updateMetadata(actor) })
  if (systemText) batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', systemText, actor))
  await batch.commit()
}
