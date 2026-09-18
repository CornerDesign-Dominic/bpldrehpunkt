import { collection, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'

export const LEGAL_DISPUTES_COLLECTION = 'legalDisputes'
export const LEGAL_DISPUTE_FINANCIAL_DIRECTIONS = [
  { value: 'received', label: 'Wir erhalten' },
  { value: 'paid', label: 'Wir bezahlen' },
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

export function legalDisputeStatusLabel(status) {
  return status === 'completed' ? 'Abgeschlossen' : 'Offen'
}

export function createEmptyLegalDispute() {
  return {
    title: '',
    caseType: '',
    counterparty: '',
    nextDeadline: '',
  }
}

export async function createLegalDispute(values, actor) {
  const title = trim(values.title)
  if (!title) throw new Error('Bitte einen Betreff für den Fall eingeben.')

  const year = String(new Date().getFullYear())
  const counterRef = doc(db, 'legalDisputeCaseCounters', year)
  const actorName = getUserDisplayName(actor.profile, actor.user)
  const optionalText = (value) => trim(value) || null
  const optionalDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(trim(value)) ? trim(value) : null
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
      title,
      description: null,
      caseType: optionalText(values.caseType),
      participant: null,
      counterparty: optionalText(values.counterparty),
      opposingCounsel: null,
      responsibleUserId: null,
      responsibleUserName: null,
      lawFirm: null,
      ownCounsel: null,
      lawyerReference: null,
      lawyerHandoverDate: null,
      lawyerPhone: null,
      lawyerEmail: null,
      court: null,
      courtReference: null,
      judgeOrChamber: null,
      nextDeadline: optionalDate(values.nextDeadline),
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
  return (await getDocs(query(collection(db, LEGAL_DISPUTES_COLLECTION), orderBy('updatedAt', 'desc')))).docs.map(mapSnapshot)
}

export async function listLegalDisputeUpdates(legalDisputeId) {
  return (await getDocs(query(collection(db, LEGAL_DISPUTES_COLLECTION, legalDisputeId, 'updates'), orderBy('createdAt', 'desc')))).docs.map(mapSnapshot)
}

export function createEmptyLegalDisputeFinancialEntry() {
  return { date: new Date().toISOString().slice(0, 10), direction: 'received', payeeType: '', netAmount: '', vatAmount: '' }
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
  if (changes.status && changes.status !== legalDispute.status) next.completedAt = nextStatus === 'completed' ? serverTimestamp() : null
  const caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, legalDispute.id)
  const batch = writeBatch(db)
  batch.update(caseRef, { ...next, ...updateMetadata(actor) })
  if (systemText) batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', systemText, actor))
  await batch.commit()
}
