import { collection, getDocs, limit, orderBy, query, startAfter } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions, waitForAppCheckToken } from './firebase.js'
import { reportTechnicalFailure } from './diagnostics.js'

export async function listTransportOrderRecordsPage(filters) {
  try {
    await waitForAppCheckToken()
    return (await httpsCallable(functions, 'listTransportOrderRecordsPage')(filters)).data
  } catch (error) {
    void reportTechnicalFailure({ module: 'transport-orders', stage: 'list', error })
    throw error
  }
}

export async function refreshTransportOrderWorkspace(data) {
  try {
    await waitForAppCheckToken()
    return (await httpsCallable(functions, 'refreshTransportOrderWorkspace', { timeout: 540000 })(data)).data
  } catch (error) {
    void reportTechnicalFailure({ module: 'transport-orders', stage: 'refresh', orderId: data.orderId, error })
    throw error
  }
}

async function historyPage(orderId, collectionName, field, cursor) {
  const constraints = [orderBy(field, 'desc')]
  if (cursor) constraints.push(startAfter(cursor))
  const snapshots = await getDocs(query(collection(db, 'transportOrders', orderId, collectionName), ...constraints, limit(51)))
  const docs = snapshots.docs.slice(0, 50)
  return { entries: docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })), hasMore: snapshots.size > 50, cursor: docs.at(-1) || null }
}

export async function getTransportOrderWorkspaceHistory(orderId, { changesCursor, refreshCursor } = {}) {
  try {
    const [changes, refreshes] = await Promise.all([
      historyPage(orderId, 'history', 'recordedAt', changesCursor),
      historyPage(orderId, 'refreshes', 'startedAt', refreshCursor),
    ])
    return { changes: changes.entries, refreshes: refreshes.entries, hasMore: changes.hasMore, refreshHasMore: refreshes.hasMore, changesCursor: changes.cursor, refreshCursor: refreshes.cursor }
  } catch (error) {
    void reportTechnicalFailure({ module: 'transport-orders', stage: 'history', orderId, error })
    throw error
  }
}
