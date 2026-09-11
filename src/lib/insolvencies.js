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
  }
  if (!Object.entries(next).some(([field, value]) => value !== (insolvency[field] ?? null))) return false
  await writeBatch(db).update(doc(db, INSOLVENCIES_COLLECTION, insolvency.id), { ...next, ...updateMetadata(actor) }).commit()
  return true
}
