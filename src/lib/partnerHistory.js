import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase.js'
import { mergedPartnerHistoryEntry } from './partnerReferencePresentation.js'
import { getPartnerCluster } from './partnerClusterQueries.js'

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
  const cluster = await getPartnerCluster(partnerId)
  const snapshots = await Promise.all(cluster.members.map((partner) => getDocs(query(historyRef(partner.id), orderBy('createdAt', 'desc')))))
  return snapshots.flatMap((snapshot, index) => snapshot.docs.map((item) => ({ id: `${cluster.members[index].id}/${item.id}`, originPartnerId: cluster.members[index].id, ...item.data() })))
    .sort((left, right) => (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0))
}

export async function listMergedPartnerSources(partnerId) {
  const history = await listPartnerHistory(partnerId)
  const separated = new Set(history.filter((entry) => entry.category === 'merge' && entry.action === 'separated').map((entry) => entry.mergeId))
  const merges = history.filter((entry) => entry.category === 'merge' && entry.action === 'merged' && entry.sourcePartnerId && !separated.has(entry.mergeId))
  return Promise.all(merges.map(async (entry) => {
    const snapshot = await getDoc(doc(db, 'businessPartners', entry.sourcePartnerId))
    return mergedPartnerHistoryEntry(entry, snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null)
  }))
}
