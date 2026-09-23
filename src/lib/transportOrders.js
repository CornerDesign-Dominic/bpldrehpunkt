import { doc, getDoc, getDocs, orderBy, query, collection } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'

export const TRANSPORT_ORDERS_COLLECTION = 'transportOrders'

function mapSnapshot(snapshot) { return { id: snapshot.id, ...snapshot.data() } }

export async function listTransportOrders() {
  const snapshots = await getDocs(query(collection(db, TRANSPORT_ORDERS_COLLECTION), orderBy('importMeta.lastImportedAt', 'desc')))
  return snapshots.docs.map(mapSnapshot)
}

export async function getTransportOrder(transportOrderId) {
  const snapshot = await getDoc(doc(db, TRANSPORT_ORDERS_COLLECTION, transportOrderId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
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
