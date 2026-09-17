import { createHash } from 'node:crypto'
import { getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { requireActiveProfile, requireRole } from './access.js'
import { getHolidayDisplayNameDe } from './holidayTranslations.js'

if (!getApps().length) initializeApp()

const db = getFirestore()
const HOLIDAY_COLLECTION = 'publicHolidays'
const SYNC_STATUS_COLLECTION = 'holidaySyncStatus'
const SYNC_LOG_COLLECTION = 'holidaySyncLogs'
const NAGER_SOURCE = 'Nager.Date Community API v4'
const NAGER_URL = 'https://nagerholidays.com/api/v4/Holidays'
const PRIMARY_COUNTRY_CODE = 'DE'
const SYNC_COUNTRY_CODES = Object.freeze(['DE', 'NL', 'BE', 'LU', 'FR', 'AT', 'CH', 'IT', 'ES', 'PT', 'PL', 'CZ', 'SK', 'HU', 'DK', 'GB', 'IE', 'SI', 'HR', 'RO'])
const COUNTRY_SYNC_CONCURRENCY = 4
const YEAR_FETCH_CONCURRENCY = 3

function berlinDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function syncYears(today) {
  const year = Number(today.slice(0, 4))
  return Array.from({ length: 5 }, (_, index) => year + index)
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await callback(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
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
  const sourceName = cleanText(item?.name)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !sourceName || Number(date.slice(0, 4)) !== year || date < today || !publicType(item?.holidayTypes || item?.types)) return null
  const translatedName = getHolidayDisplayNameDe(countryCode, sourceName)
  const displayNameDe = translatedName || sourceName
  const normalized = {
    date,
    sourceName,
    displayNameDe,
    countryCode,
    year,
    nationalHoliday: item?.nationalHoliday === true,
    subdivisionCodes: cleanSubdivisionCodes(countryCode, item?.subdivisionCodes),
    scope: item?.nationalHoliday === true ? 'national' : 'regional',
    holidayType: 'Public',
    source: NAGER_SOURCE,
  }
  return { id: recordId(countryCode, date, sourceName), ...normalized, dataHash: dataHash(normalized), translationMissing: !translatedName }
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
  let createdEntryCount = 0
  let changedEntryCount = 0

  for (const record of records) {
    const previous = existing.get(record.id)
    if (previous?.dataHash === record.dataHash) continue
    batch.set(db.collection(HOLIDAY_COLLECTION).doc(record.id), {
      ...record,
      lastUpdatedAt: FieldValue.serverTimestamp(),
      ...(previous ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true })
    if (previous) changedEntryCount += 1
    else createdEntryCount += 1
  }

  for (const [id, previous] of existing) {
    // Missing future entries may have been corrected upstream. Historic rows
    // are deliberately immutable, including when the upstream source changes.
    if (!incoming.has(id) && typeof previous.date === 'string' && previous.date >= today) {
      batch.delete(db.collection(HOLIDAY_COLLECTION).doc(id))
      changedEntryCount += 1
    }
  }

  if (createdEntryCount || changedEntryCount) await batch.commit()
  return { createdEntryCount, changedEntryCount }
}

async function syncCountryPublicHolidays(countryCode, years, today) {
  // Fetch every requested year before mutating Firestore. A partial API
  // failure therefore cannot leave the previously maintained country altered.
  const recordsByYear = await mapWithConcurrency(years, YEAR_FETCH_CONCURRENCY, async (year) => [year, await fetchNagerHolidays(countryCode, year, today)])
  const translationMissing = [...new Map(recordsByYear.flatMap(([, records]) => records.filter((record) => record.translationMissing).map((record) => [`${countryCode}\u0000${record.sourceName}`, { countryCode, sourceName: record.sourceName }]))).values()]
  let createdEntryCount = 0
  let changedEntryCount = 0
  let updatedEntryCount = 0
  let totalEntries = 0
  const yearResults = []
  for (const [year, records] of recordsByYear) {
    totalEntries += records.length
    const changes = await applyYear(countryCode, year, records, today)
    createdEntryCount += changes.createdEntryCount
    changedEntryCount += changes.changedEntryCount
    updatedEntryCount += changes.createdEntryCount + changes.changedEntryCount
    yearResults.push({ year, entryCount: records.length, ...changes })
  }
  return { countryCode, status: totalEntries ? 'success' : 'empty', updatedEntryCount, createdEntryCount, changedEntryCount, totalEntries, yearResults, translationMissing }
}

export async function syncPublicHolidays() {
  const today = berlinDateValue()
  const years = syncYears(today)
  // 20 countries × 5 years equals the explicit API-request limit of 100.
  if (SYNC_COUNTRY_CODES.length * years.length > 100) throw new Error('Die konfigurierte Feiertagssynchronisation überschreitet das Limit von 100 API-Abfragen.')
  const countryResults = await mapWithConcurrency(SYNC_COUNTRY_CODES, COUNTRY_SYNC_CONCURRENCY, async (countryCode) => {
    try {
      return { result: await syncCountryPublicHolidays(countryCode, years, today) }
    } catch (error) {
      logger.error(`Feiertagssynchronisation für ${countryCode} fehlgeschlagen.`, error)
      return { error: { countryCode, status: 'failed', createdEntryCount: 0, changedEntryCount: 0, totalEntries: 0, yearResults: [], errorMessage: syncErrorMessage(error) } }
    }
  })
  const detailedCountryResults = countryResults.flatMap(({ result, error }) => result ? [result] : error ? [error] : [])
  const successfulCountries = detailedCountryResults.filter((result) => result.status === 'success')
  const emptyCountries = detailedCountryResults.filter((result) => result.status === 'empty')
  const failedCountries = detailedCountryResults.filter((result) => result.status === 'failed')
  const createdEntryCount = successfulCountries.reduce((count, result) => count + result.createdEntryCount, 0)
  const changedEntryCount = successfulCountries.reduce((count, result) => count + result.changedEntryCount, 0)
  const updatedEntryCount = createdEntryCount + changedEntryCount
  const totalEntries = successfulCountries.reduce((count, result) => count + result.totalEntries, 0)
  const translationMissing = [...new Map(successfulCountries.flatMap((result) => result.translationMissing).map((item) => [`${item.countryCode}\u0000${item.sourceName}`, item])).values()]
  await db.collection(SYNC_STATUS_COLLECTION).doc(PRIMARY_COUNTRY_CODE).set({
    countryCode: PRIMARY_COUNTRY_CODE,
    source: NAGER_SOURCE,
    sourceUrl: `${NAGER_URL}/{countryCode}/{year}`,
    years,
    countries: SYNC_COUNTRY_CODES,
    successfulCountryCount: successfulCountries.length,
    emptyCountryCodes: emptyCountries.map((item) => item.countryCode),
    failedCountryCodes: failedCountries.map((item) => item.countryCode),
    lastSyncedAt: FieldValue.serverTimestamp(),
    updatedEntryCount,
    totalEntries,
  }, { merge: true })
  return { years, updatedEntryCount, createdEntryCount, changedEntryCount, totalEntries, successfulCountryCount: successfulCountries.length, countryResults: detailedCountryResults, failedCountries, emptyCountries, translationMissing }
}

function syncActorName(profile, request) {
  const name = [cleanText(profile?.firstName), cleanText(profile?.lastName)].filter(Boolean).join(' ')
  return name || cleanText(profile?.name) || cleanText(request?.auth?.token?.name) || cleanText(request?.auth?.token?.email) || 'Administrator'
}

function syncErrorMessage(error) {
  const message = cleanText(error?.message).replace(/^.*?:\s*/, '')
  return (message || 'Die Feiertage konnten nicht aktualisiert werden.').slice(0, 300)
}

async function writeSyncLog(entry) {
  await db.collection(SYNC_LOG_COLLECTION).add({
    countryCode: PRIMARY_COUNTRY_CODE,
    loggedAt: Timestamp.now(),
    ...entry,
  })
  const logs = await db.collection(SYNC_LOG_COLLECTION).where('countryCode', '==', PRIMARY_COUNTRY_CODE).orderBy('loggedAt', 'desc').get()
  if (logs.size <= 10) return
  const batch = db.batch()
  logs.docs.slice(10).forEach((document) => batch.delete(document.ref))
  await batch.commit()
}

async function runHolidaySync({ trigger, actorName = null }) {
  let result
  try {
    result = await syncPublicHolidays()
  } catch (error) {
    try {
      await writeSyncLog({
        trigger,
        actorName,
        status: 'failed',
        createdEntryCount: 0,
        changedEntryCount: 0,
        successfulCountryCount: 0,
        countryResults: [],
        failedCountries: [],
        translationMissing: [],
        errorMessage: syncErrorMessage(error),
      })
    } catch (logError) {
      logger.error('Synchronisationsfehler konnte nicht protokolliert werden.', logError)
    }
    throw error
  }
  try {
    await writeSyncLog({
      trigger,
      actorName,
      status: result.successfulCountryCount ? 'success' : 'failed',
      createdEntryCount: result.createdEntryCount,
      changedEntryCount: result.changedEntryCount,
      successfulCountryCount: result.successfulCountryCount,
      countryResults: result.countryResults,
      failedCountries: result.failedCountries,
      translationMissing: result.translationMissing,
      errorMessage: result.successfulCountryCount ? null : 'Keines der Länder konnte aktualisiert werden.',
    })
  } catch (logError) {
    logger.error('Erfolgreiche Synchronisation konnte nicht protokolliert werden.', logError)
  }
  if (!result.successfulCountryCount) throw new Error('Keines der Länder konnte aktualisiert werden.')
  return result
}

export const refreshHolidayData = onCall({ region: 'europe-west3', enforceAppCheck: true, timeoutSeconds: 540 }, async (request) => {
  const profile = await requireActiveProfile(request)
  requireRole(profile, ['admin', 'superadmin'], 'Nur Administratoren können Feiertage aktualisieren.')
  try {
    return await runHolidaySync({ trigger: 'manual', actorName: syncActorName(profile, request) })
  } catch (error) {
    logger.error('Feiertagssynchronisation fehlgeschlagen.', error)
    throw new HttpsError('unavailable', 'Feiertage konnten nicht aktualisiert werden. Vorhandene Daten wurden nicht verändert.')
  }
})

export const scheduledHolidayDataRefresh = onSchedule({ region: 'europe-west3', schedule: '15 3 1 * *', timeZone: 'Europe/Berlin', timeoutSeconds: 540 }, async () => {
  try {
    const result = await runHolidaySync({ trigger: 'automatic' })
    logger.info('Feiertagssynchronisation abgeschlossen.', result)
  } catch (error) {
    logger.error('Geplante Feiertagssynchronisation fehlgeschlagen.', error)
  }
})
