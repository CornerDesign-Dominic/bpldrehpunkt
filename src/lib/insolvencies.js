import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'

export const INSOLVENCIES_COLLECTION = 'insolvencies'
const INSOLVENCY_MOVEMENT_TRANSACTION_TYPES = ['received', 'paid', 'expected_receivable', 'expected_payable']
const INSOLVENCY_MOVEMENT_COUNTERPARTY_TYPES = ['customer', 'contractor', 'insurance']

const trim = (value) => typeof value === 'string' ? value.trim() : ''
const optionalText = (value) => trim(value) || null
const optionalDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(trim(value)) ? trim(value) : null

function mapSnapshot(snapshot) { return { id: snapshot.id, ...snapshot.data() } }

function updateMetadata(actor) {
  return { updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: getUserDisplayName(actor.profile, actor.user) }
}

function insolvencyMetadata(insolvency, actor) {
  return { description: insolvency.description ?? null, ...updateMetadata(actor) }
}

function movementPayload(values) {
  const date = trim(values.date)
  const transactionType = INSOLVENCY_MOVEMENT_TRANSACTION_TYPES.includes(values.transactionType) ? values.transactionType : ''
  const counterpartyType = INSOLVENCY_MOVEMENT_COUNTERPARTY_TYPES.includes(values.counterpartyType) ? values.counterpartyType : ''
  const amount = Number(values.amount)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !transactionType || !counterpartyType || values.amount === '' || values.amount === null || values.amount === undefined || !Number.isFinite(amount) || amount < 0) throw new Error('Bitte alle Pflichtfelder der Betragsbewegung erfassen.')
  return { date, transactionType, counterpartyType, amount }
}

export function createEmptyInsolvency() {
  return { partnerId: '', insolvencyDate: '', courtReference: '', courtVenue: '' }
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
  await writeBatch(db).update(doc(db, INSOLVENCIES_COLLECTION, insolvency.id), { description, ...updateMetadata(actor) }).commit()
  return true
}

export async function listInsolvencyMovements(partnerId) {
  return (await getDocs(collection(db, INSOLVENCIES_COLLECTION, partnerId, 'movements'))).docs.map(mapSnapshot).sort((left, right) => right.date.localeCompare(left.date) || (right.createdAt?.seconds || 0) - (left.createdAt?.seconds || 0))
}

export async function createInsolvencyMovement(insolvency, values, actor) {
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, insolvency.id)
  const movement = movementPayload(values)
  const batch = writeBatch(db)
  batch.update(insolvencyRef, insolvencyMetadata(insolvency, actor))
  batch.set(doc(collection(insolvencyRef, 'movements')), { ...movement, createdAt: serverTimestamp(), createdBy: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), ...updateMetadata(actor) })
  await batch.commit()
}

export async function updateInsolvencyMovement(insolvency, movement, values, actor) {
  const next = movementPayload(values)
  if (!Object.entries(next).some(([field, value]) => value !== (movement[field] ?? null))) return false
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, insolvency.id)
  const batch = writeBatch(db)
  batch.update(insolvencyRef, insolvencyMetadata(insolvency, actor))
  batch.update(doc(insolvencyRef, 'movements', movement.id), { ...next, ...updateMetadata(actor) })
  await batch.commit()
  return true
}

export async function deleteInsolvencyMovement(insolvency, movement, actor) {
  const insolvencyRef = doc(db, INSOLVENCIES_COLLECTION, insolvency.id)
  const batch = writeBatch(db)
  batch.update(insolvencyRef, insolvencyMetadata(insolvency, actor))
  batch.delete(doc(insolvencyRef, 'movements', movement.id))
  await batch.commit()
}
