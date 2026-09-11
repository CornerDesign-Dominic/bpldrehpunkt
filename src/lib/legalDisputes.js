import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'

export const LEGAL_DISPUTES_COLLECTION = 'legalDisputes'

const trim = (value) => (value ?? '').trim()

function mapSnapshot(snapshot) { return { id: snapshot.id, ...snapshot.data() } }

function updatePayload(type, text, actor) {
  return { type, text, createdByUserId: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), createdAt: serverTimestamp() }
}

export function legalDisputeStatusLabel(status) {
  return status === 'completed' ? 'Abgeschlossen' : 'Offen'
}

export function createEmptyLegalDispute() {
  return {
    title: '',
    caseType: '',
    participant: '',
    counterparty: '',
    nextDeadline: '',
  }
}

export async function createLegalDispute(values, actor) {
  const title = trim(values.title)
  if (!title) throw new Error('Bitte einen Betreff für den Fall eingeben.')

  const caseRef = doc(collection(db, LEGAL_DISPUTES_COLLECTION))
  const actorName = getUserDisplayName(actor.profile, actor.user)
  const caseNumber = `G-${new Date().getFullYear()}-${caseRef.id.slice(0, 8).toUpperCase()}`
  const optionalText = (value) => trim(value) || null
  const optionalDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(trim(value)) ? trim(value) : null
  const batch = writeBatch(db)
  batch.set(caseRef, {
    caseNumber,
    status: 'open',
    isClosed: false,
    title,
    description: null,
    caseType: optionalText(values.caseType),
    participant: optionalText(values.participant),
    counterparty: optionalText(values.counterparty),
    opposingCounsel: null,
    responsibleUserId: null,
    responsibleUserName: null,
    lawFirm: null,
    ownCounsel: null,
    lawyerReference: null,
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
  batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', 'Fall angelegt', actor))
  await batch.commit()
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

export async function addLegalDisputeUpdate(legalDispute, text, actor) {
  const cleanText = trim(text)
  if (!cleanText) throw new Error('Bitte einen Update-Text eingeben.')
  if (cleanText.length > 1000) throw new Error('Das Update ist zu lang.')
  const caseRef = doc(db, LEGAL_DISPUTES_COLLECTION, legalDispute.id)
  const batch = writeBatch(db)
  batch.update(caseRef, { updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: getUserDisplayName(actor.profile, actor.user) })
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
  batch.update(caseRef, { ...next, updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: getUserDisplayName(actor.profile, actor.user) })
  if (systemText) batch.set(doc(collection(caseRef, 'updates')), updatePayload('system', systemText, actor))
  await batch.commit()
}
