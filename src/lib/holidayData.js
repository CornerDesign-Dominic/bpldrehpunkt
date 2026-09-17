import { collection, getDoc, getDocs, doc, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase.js'

export const PUBLIC_HOLIDAYS_COLLECTION = 'publicHolidays'
export const HOLIDAY_SYNC_STATUS_COLLECTION = 'holidaySyncStatus'
export const HOLIDAY_SYNC_LOG_COLLECTION = 'holidaySyncLogs'
export const SCHOOL_HOLIDAYS_COLLECTION = 'schoolHolidays'
export const SCHOOL_HOLIDAY_SYNC_STATUS_COLLECTION = 'schoolHolidaySyncStatus'
export const SCHOOL_HOLIDAY_SYNC_LOG_COLLECTION = 'schoolHolidaySyncLogs'

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

export async function listHolidaySyncLogs(countryCode = 'DE') {
  const snapshot = await getDocs(query(collection(db, HOLIDAY_SYNC_LOG_COLLECTION), where('countryCode', '==', countryCode), orderBy('loggedAt', 'desc'), limit(10)))
  return snapshot.docs.map(snapshotData)
}

export async function listSchoolHolidays(countryCode = 'DE', subdivisionCode = 'DE-NW') {
  const snapshot = await getDocs(query(collection(db, SCHOOL_HOLIDAYS_COLLECTION), where('countryCode', '==', countryCode), where('subdivisionCode', '==', subdivisionCode)))
  return snapshot.docs.map(snapshotData)
}

export async function getSchoolHolidaySyncStatus(countryCode = 'DE') {
  const snapshot = await getDoc(doc(db, SCHOOL_HOLIDAY_SYNC_STATUS_COLLECTION, countryCode))
  return snapshot.exists() ? snapshotData(snapshot) : null
}

export async function listSchoolHolidaySyncLogs(countryCode = 'DE') {
  const snapshot = await getDocs(query(collection(db, SCHOOL_HOLIDAY_SYNC_LOG_COLLECTION), where('countryCode', '==', countryCode), orderBy('loggedAt', 'desc'), limit(10)))
  return snapshot.docs.map(snapshotData)
}
