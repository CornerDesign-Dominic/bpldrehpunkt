import { collection, getDoc, getDocs, doc, query, where } from 'firebase/firestore'
import { db } from './firebase.js'

export const PUBLIC_HOLIDAYS_COLLECTION = 'publicHolidays'
export const HOLIDAY_SYNC_STATUS_COLLECTION = 'holidaySyncStatus'

function snapshotData(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

// The browser only consumes the maintained Firestore projection. Nager.Date
// is deliberately never called from client-side code.
export async function listPublicHolidays(countryCode = 'DE') {
  const snapshot = await getDocs(query(collection(db, PUBLIC_HOLIDAYS_COLLECTION), where('countryCode', '==', countryCode)))
  return snapshot.docs.map(snapshotData)
}

export async function getHolidaySyncStatus(countryCode = 'DE') {
  const snapshot = await getDoc(doc(db, HOLIDAY_SYNC_STATUS_COLLECTION, countryCode))
  return snapshot.exists() ? snapshotData(snapshot) : null
}
