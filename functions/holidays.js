import { createHash } from 'node:crypto'
import { getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { requireActiveProfile, requireRole } from './access.js'

if (!getApps().length) initializeApp()

const db = getFirestore()
const HOLIDAY_COLLECTION = 'publicHolidays'
const SYNC_STATUS_COLLECTION = 'holidaySyncStatus'
const NAGER_SOURCE = 'Nager.Date Community API v4'
const NAGER_URL = 'https://nagerholidays.com/api/v4/Holidays'
const COUNTRY_CODE = 'DE'

function berlinDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function syncYears(today) {
  const year = Number(today.slice(0, 4))
  return Array.from({ length: 5 }, (_, index) => year + index)
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanSubdivisionCodes(countryCode, values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => cleanText(value).toUpperCase()).filter(Boolean).map((value) => countryCode === 'DE' && value.startsWith('DE-') ? value.slice(3) : value))].sort()
}

function publicType(types) {
  return (Array.isArray(types) ? types : []).some((type) => cleanText(type).toLowerCase() === 'public')
}

function recordId(countryCode, date, name) {
  const suffix = createHash('sha256').update(`${date}\u0000${name}`).digest('hex').slice(0, 20)
  return `${countryCode}_${date}_${suffix}`
}

function dataHash(data) {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex')
}

function normalizeHoliday(item, countryCode, year, today) {
  const date = cleanText(item?.date)
  const name = cleanText(item?.localName) || cleanText(item?.name)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || Number(date.slice(0, 4)) !== year || date < today || !publicType(item?.holidayTypes || item?.types)) return null
  const normalized = {
    date,
    name,
    countryCode,
    year,
    nationalHoliday: item?.nationalHoliday === true,
    subdivisionCodes: cleanSubdivisionCodes(countryCode, item?.subdivisionCodes),
    holidayType: 'Public',
    source: NAGER_SOURCE,
  }
  return { id: recordId(countryCode, date, name), ...normalized, dataHash: dataHash(normalized) }
}

async function fetchNagerHolidays(countryCode, year, today) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${NAGER_URL}/${countryCode}/${year}`, { headers: { Accept: 'application/json' }, signal: controller.signal })
    if (!response.ok) throw new Error(`Nager.Date antwortete mit HTTP ${response.status}.`)
    const payload = await response.json()
    if (!Array.isArray(payload)) throw new Error('Nager.Date lieferte kein Feiertags-Array.')
    return payload.map((item) => normalizeHoliday(item, countryCode, year, today)).filter(Boolean)
  } finally {
    clearTimeout(timeout)
  }
}

async function applyYear(countryCode, year, records, today) {
  const existingSnapshot = await db.collection(HOLIDAY_COLLECTION).where('countryCode', '==', countryCode).where('year', '==', year).get()
  const existing = new Map(existingSnapshot.docs.map((document) => [document.id, document.data()]))
  const incoming = new Map(records.map((record) => [record.id, record]))
  const batch = db.batch()
  let writes = 0

  for (const record of records) {
    const previous = existing.get(record.id)
    if (previous?.dataHash === record.dataHash) continue
    batch.set(db.collection(HOLIDAY_COLLECTION).doc(record.id), {
      ...record,
      lastUpdatedAt: FieldValue.serverTimestamp(),
      ...(previous ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true })
    writes += 1
  }

  for (const [id, previous] of existing) {
    // Missing future entries may have been corrected upstream. Historic rows
    // are deliberately immutable, including when the upstream source changes.
    if (!incoming.has(id) && typeof previous.date === 'string' && previous.date >= today) {
      batch.delete(db.collection(HOLIDAY_COLLECTION).doc(id))
      writes += 1
    }
  }

  if (writes) await batch.commit()
  return writes
}

export async function syncGermanPublicHolidays() {
  const today = berlinDateValue()
  const years = syncYears(today)
  // Fetch every requested year before mutating Firestore. A partial API
  // failure therefore cannot leave the previously maintained data altered.
  const recordsByYear = await Promise.all(years.map(async (year) => [year, await fetchNagerHolidays(COUNTRY_CODE, year, today)]))
  let updatedEntryCount = 0
  let totalEntries = 0
  for (const [year, records] of recordsByYear) {
    totalEntries += records.length
    updatedEntryCount += await applyYear(COUNTRY_CODE, year, records, today)
  }
  await db.collection(SYNC_STATUS_COLLECTION).doc(COUNTRY_CODE).set({
    countryCode: COUNTRY_CODE,
    source: NAGER_SOURCE,
    sourceUrl: `${NAGER_URL}/${COUNTRY_CODE}/{year}`,
    years,
    lastSyncedAt: FieldValue.serverTimestamp(),
    updatedEntryCount,
    totalEntries,
  }, { merge: true })
  return { countryCode: COUNTRY_CODE, years, updatedEntryCount, totalEntries }
}

export const refreshHolidayData = onCall({ region: 'europe-west3', enforceAppCheck: true, timeoutSeconds: 180 }, async (request) => {
  const profile = await requireActiveProfile(request)
  requireRole(profile, ['admin', 'superadmin'], 'Nur Administratoren können Feiertage aktualisieren.')
  try {
    return await syncGermanPublicHolidays()
  } catch (error) {
    logger.error('Feiertagssynchronisation fehlgeschlagen.', error)
    throw new HttpsError('unavailable', 'Feiertage konnten nicht aktualisiert werden. Vorhandene Daten wurden nicht verändert.')
  }
})

export const scheduledHolidayDataRefresh = onSchedule({ region: 'europe-west3', schedule: '15 3 1 * *', timeZone: 'Europe/Berlin' }, async () => {
  try {
    const result = await syncGermanPublicHolidays()
    logger.info('Feiertagssynchronisation abgeschlossen.', result)
  } catch (error) {
    logger.error('Geplante Feiertagssynchronisation fehlgeschlagen.', error)
  }
})
