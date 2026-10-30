import { doc, getDoc, getDocs, orderBy, query, collection, limit, startAfter } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions, waitForAppCheckToken } from './firebase.js'

export const TRANSPORT_ORDERS_COLLECTION = 'transportOrders'

function mapSnapshot(snapshot) { return { id: snapshot.id, ...snapshot.data() } }

export async function listTransportOrders() {
  const snapshots = await getDocs(query(collection(db, TRANSPORT_ORDERS_COLLECTION), orderBy('importMeta.lastImportedAt', 'desc')))
  return snapshots.docs.map(mapSnapshot)
}

export async function listTransportOrdersPage({ trackingStatus, attention = 'all', iconFilters, search, relation, loadingFrom, loadingUntil, sort, cursor = null, pageSize }) {
  await waitForAppCheckToken()
  const result = await httpsCallable(functions, 'listTransportOrdersPage')({ trackingStatus, attention, iconFilters, search, relation, loadingFrom, loadingUntil, sort, cursor, pageSize })
  return result.data
}

export async function listTransportOrderRelations() {
  await waitForAppCheckToken()
  const result = await httpsCallable(functions, 'listTransportOrderRelations')()
  return Array.isArray(result.data?.relations) ? result.data.relations : []
}

export async function saveOwnTransportOrderListPreferences(preferences, expectedUserId) {
  await waitForAppCheckToken()
  if (!expectedUserId || auth.currentUser?.uid !== expectedUserId) throw new Error('Die Benutzersitzung hat sich geändert.')
  const result = await httpsCallable(functions, 'updateOwnTransportOrderListPreferences')({ preferences })
  return result.data?.preferences || null
}

export async function getTransportOrder(transportOrderId) {
  const snapshot = await getDoc(doc(db, TRANSPORT_ORDERS_COLLECTION, transportOrderId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function getTransportOrderRoute(transportOrderId) {
  const snapshot = await getDoc(doc(db, 'transportOrderRoutes', transportOrderId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function calculateTransportOrderRoute(orderId, countryOverrides = undefined) {
  const result = await httpsCallable(functions, 'calculateTransportOrderRoute', { timeout: 70000 })({ orderId, ...(countryOverrides ? { countryOverrides } : {}) })
  return result.data?.route || null
}

export async function getTomTomUsageSummary(month) {
  await waitForAppCheckToken()
  const result = await httpsCallable(functions, 'getTomTomUsageSummary')({ month })
  return result.data
}

export async function previewTransportOrderImport(rows) {
  const result = await httpsCallable(functions, 'previewTransportOrderImport')({
    rows: rows.map((row) => ({
      externalNumber: row.externalNumber,
      customer: { debtorNumber: row.imported.customer.debtorNumber },
      carrier: { originalName: row.imported.carrier.originalName },
    })),
  })
  return result.data
}

export async function importTransportOrderRows({ fileName, rows, rowErrors, carrierResolutions }) {
  const result = await httpsCallable(functions, 'importTransportOrders')({ fileName, rows, rowErrors, carrierResolutions })
  return result.data
}

export async function fetchDycosTransportOrder({ taNummer, requestId, expectedSourceId }) {
  await waitForAppCheckToken()
  const result = await httpsCallable(functions, 'fetchDycosTransportOrder', { timeout: 180000 })({ taNummer, requestId, ...(expectedSourceId != null ? { expectedSourceId } : {}) })
  return result.data
}

export async function searchDycosTransportOrders(data) {
  await waitForAppCheckToken()
  return (await httpsCallable(functions, 'searchDycosTransportOrders', { timeout: 180000 })(data)).data
}

export async function listTransportOrderImportRuns(runId = '') {
  await waitForAppCheckToken()
  const result = await httpsCallable(functions, 'listTransportOrderImportRuns')({ runId })
  return result.data
}

export async function listTransportOrderHistoryPage(orderId, cursor = null) {
  const constraints = [orderBy('recordedAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(50)]
  const snapshot = await getDocs(query(collection(db, TRANSPORT_ORDERS_COLLECTION, orderId, 'history'), ...constraints))
  return { entries: snapshot.docs.map(mapSnapshot), cursor: snapshot.docs.at(-1) || null, hasMore: snapshot.size === 50 }
}
