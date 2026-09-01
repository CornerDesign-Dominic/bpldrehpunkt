import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase.js'

export const PARTNER_HISTORY_CATEGORIES = [
  { value: 'all', label: 'Alle' },
  { value: 'contact', label: 'Kontakt' },
  { value: 'masterData', label: 'Stammdaten' },
  { value: 'creditLimit', label: 'Kreditlimit' },
  { value: 'rating', label: 'Bewertung' },
  { value: 'crm', label: 'CRM' },
  { value: 'contactPerson', label: 'Ansprechpartner' },
  { value: 'paymentData', label: 'Zahlungsdaten' },
]

const historyRef = (partnerId) => collection(db, 'businessPartners', partnerId, 'history')

export function getHistoryActor(authState) {
  const user = authState?.user
  const profile = authState?.profile
  return {
    id: user?.uid ?? null,
    name: profile?.name?.trim() || user?.displayName?.trim() || user?.email?.trim() || null,
  }
}

export function createHistoryPayload({ category, action, summary, metadata = {}, actor }) {
  return {
    category,
    action,
    summary,
    createdAt: serverTimestamp(),
    createdByUserId: actor?.id ?? null,
    createdByName: actor?.name ?? null,
    metadata,
  }
}

export async function addPartnerHistoryEntry(partnerId, entry, actor) {
  await addDoc(historyRef(partnerId), createHistoryPayload({ ...entry, actor }))
}

export async function listPartnerHistory(partnerId) {
  const snapshot = await getDocs(query(historyRef(partnerId), orderBy('createdAt', 'desc')))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}
