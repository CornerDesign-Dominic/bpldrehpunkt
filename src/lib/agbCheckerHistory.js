import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, startAfter, where } from 'firebase/firestore'
import { db } from './firebase.js'
import { normalizeAgbHistoryName } from '../../shared/agbCheckerHistorySearch.js'

export const AGB_HISTORY_PAGE_SIZE = 20
const historyCollection = collection(db, 'agbCheckerHistory')
const mapEntries = (snapshot) => snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))

export function subscribeAgbCheckerHistory(onPage, onError) {
  const historyQuery = query(historyCollection, orderBy('createdAt', 'desc'), limit(AGB_HISTORY_PAGE_SIZE))
  return onSnapshot(historyQuery, (snapshot) => {
    onPage(mapEntries(snapshot), snapshot.docs.at(-1) || null, snapshot.size === AGB_HISTORY_PAGE_SIZE)
  }, onError)
}

export async function loadMoreAgbCheckerHistory(cursor) {
  if (!cursor) return { entries: [], cursor: null, hasMore: false }
  const snapshot = await getDocs(query(historyCollection, orderBy('createdAt', 'desc'), startAfter(cursor), limit(AGB_HISTORY_PAGE_SIZE)))
  return { entries: mapEntries(snapshot), cursor: snapshot.docs.at(-1) || null, hasMore: snapshot.size === AGB_HISTORY_PAGE_SIZE }
}

export async function searchAgbCheckerHistory(name) {
  const normalized = normalizeAgbHistoryName(name)
  if (!normalized) return []
  const token = normalized.slice(0, Math.min(3, normalized.length))
  const snapshot = await getDocs(query(historyCollection, where('nameSearchTokens', 'array-contains', token)))
  return mapEntries(snapshot)
    .filter((entry) => normalizeAgbHistoryName(entry.customerIdentity?.name || '').includes(normalized))
    .sort((left, right) => (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0))
}

export async function loadAgbCheckerHistoryResult(id) {
  const result = await getDoc(doc(db, 'agbCheckerHistory', id, 'data', 'result'))
  if (!result.exists() || !result.data()?.analysis) throw new Error('Saved review result is missing.')
  return result.data().analysis
}
