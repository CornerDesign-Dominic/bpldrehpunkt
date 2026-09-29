import { collection, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'
import { setTransportOrderCaseLink } from './caseTransportLinks.js'

export const PALLET_CASES_COLLECTION = 'palletCases'
export const PALLET_CASE_STATUSES = Object.freeze([
  { value: 'open', label: 'Offen' },
  { value: 'in_progress', label: 'In Bearbeitung' },
  { value: 'resolved', label: 'Geklärt' },
  { value: 'closed', label: 'Geschlossen' },
])

const casesRef = collection(db, PALLET_CASES_COLLECTION)
const text = (value) => typeof value === 'string' ? value.trim() : ''
const mapSnapshot = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })

export function createEmptyPalletCase(values = {}) {
  return { title: text(values.title), description: text(values.description), status: PALLET_CASE_STATUSES.some((item) => item.value === values.status) ? values.status : 'open' }
}

export function palletCaseStatusLabel(status) {
  return PALLET_CASE_STATUSES.find((item) => item.value === status)?.label || 'Offen'
}

function payload(values) {
  const title = text(values.title)
  if (!title) throw new Error('Bitte eine Kurzbezeichnung für den Palettenfall eingeben.')
  if (title.length > 240) throw new Error('Die Kurzbezeichnung ist zu lang.')
  const description = text(values.description)
  if (description.length > 4000) throw new Error('Die Beschreibung ist zu lang.')
  return { title, description: description || null, status: PALLET_CASE_STATUSES.some((item) => item.value === values.status) ? values.status : 'open' }
}

export async function listPalletCases() {
  const snapshots = await getDocs(query(casesRef, orderBy('updatedAt', 'desc')))
  return snapshots.docs.map(mapSnapshot)
}

export async function getPalletCase(caseId) {
  const snapshot = await getDoc(doc(db, PALLET_CASES_COLLECTION, caseId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function createPalletCase(values, actor, { transportOrderId = '' } = {}) {
  const caseRef = doc(casesRef)
  const year = String(new Date().getFullYear())
  const caseNumber = `P-${year}-${caseRef.id.slice(0, 6).toUpperCase()}`
  const details = payload(values)
  const actorName = getUserDisplayName(actor.profile, actor.user)
  await runTransaction(db, async (transaction) => {
    const order = transportOrderId ? await transaction.get(doc(db, 'transportOrders', transportOrderId)) : null
    if (transportOrderId && !order.exists()) throw new Error('Der Transportauftrag ist nicht mehr verfügbar.')
    transaction.set(caseRef, { ...details, caseNumber, createdAt: serverTimestamp(), createdBy: actor.user.uid, createdByName: actorName, updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: actorName })
    if (transportOrderId) setTransportOrderCaseLink(transaction, { caseType: 'pallet', caseId: caseRef.id, transportOrderId, actor })
  })
  return caseRef.id
}

export async function updatePalletCase(palletCase, values, actor) {
  const details = payload(values)
  await updateDoc(doc(db, PALLET_CASES_COLLECTION, palletCase.id), { ...details, updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: getUserDisplayName(actor.profile, actor.user) })
}
