import { doc, getDoc, getDocs, orderBy, query, collection } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions, waitForAppCheckToken } from './firebase.js'

export const TRANSPORT_ORDERS_COLLECTION = 'transportOrders'

function mapSnapshot(snapshot) { return { id: snapshot.id, ...snapshot.data() } }

export async function listTransportOrders() {
  const snapshots = await getDocs(query(collection(db, TRANSPORT_ORDERS_COLLECTION), orderBy('importMeta.lastImportedAt', 'desc')))
  return snapshots.docs.map(mapSnapshot)
}

export async function listTransportOrdersPage({ trackingStatus, search, sort, cursor = null }) {
  await waitForAppCheckToken()
  const result = await httpsCallable(functions, 'listTransportOrdersPage')({ trackingStatus, search, sort, cursor })
  return result.data
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
