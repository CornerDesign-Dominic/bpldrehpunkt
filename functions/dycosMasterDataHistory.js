import { FieldPath, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { hasDycosMasterDataAccess } from './dycosPartnerData.js'

export const masterDataHistoryRef = (db, uid, requestId) => db.collection('dycosMasterDataImportHistories').doc(uid).collection('entries').doc(requestId)

export async function listDycosMasterDataImportsHandler(request, { db = getFirestore(), requireProfile = requireActiveProfile } = {}) {
  const profile = await requireProfile(request)
  if (!hasDycosMasterDataAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für diesen Importverlauf.')
  const cursorId = request.data?.cursor
  if (cursorId != null && (typeof cursorId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(cursorId))) throw new HttpsError('invalid-argument', 'Ungültige Verlaufsseite.')
  const entries = db.collection('dycosMasterDataImportHistories').doc(request.auth.uid).collection('entries')
  let query = entries.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc')
  if (cursorId) {
    const cursor = await entries.doc(cursorId).get()
    if (!cursor.exists) throw new HttpsError('permission-denied', 'Ungültige Verlaufsseite.')
    query = query.startAfter(cursor)
  }
  const snapshots = await query.limit(26).get()
  const page = snapshots.docs.slice(0, 25)
  return { entries: page.map(snapshot => {
    const data = snapshot.data()
    return { id: snapshot.id, typ: data.typ, nummer: data.nummer, createdAt: data.createdAt?.toMillis?.() || null,
      createdByName: data.createdByName || 'Unbekannt', status: data.status === 'running' && data.lastStartedAt?.toMillis?.() < Date.now() - 180_000 ? 'interrupted' : data.status,
      resultStatus: data.resultStatus || '', partnerId: data.partnerId || '', conflicts: data.conflicts || 0, message: data.message || '' }
  }), cursor: page.at(-1)?.id || null, hasMore: snapshots.size > 25 }
}
