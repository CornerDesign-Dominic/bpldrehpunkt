import { createHash } from 'node:crypto'
import { getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'
import { logExternalEffectsSkipped, publicDataSynchronizationAllowed } from './externalEffects.js'

if (!getApps().length) initializeApp()

const db = getFirestore()
const SCHOOL_HOLIDAYS_COLLECTION = 'schoolHolidays'
const SYNC_STATUS_COLLECTION = 'schoolHolidaySyncStatus'
const SYNC_LOG_COLLECTION = 'schoolHolidaySyncLogs'
const OPEN_HOLIDAYS_SOURCE = 'OpenHolidays API'
const OPEN_HOLIDAYS_URL = 'https://openholidaysapi.org/SchoolHolidays'
const GERMAN_SUBDIVISION_CODES = Object.freeze(['DE-BW', 'DE-BY', 'DE-BE', 'DE-BB', 'DE-HB', 'DE-HH', 'DE-HE', 'DE-MV', 'DE-NI', 'DE-NW', 'DE-RP', 'DE-SL', 'DE-SN', 'DE-ST', 'DE-SH', 'DE-TH'])
const SUBDIVISION_SYNC_CONCURRENCY = 4
const REQUEST_TIMEOUT_MS = 20000

function berlinDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function schoolHolidaySyncRanges(today = berlinDateValue()) {
  const year = Number(today.slice(0, 4))
  // OpenHolidays accepts a maximum period of three years. The two ranges
  // cover the configured current year plus the four following years.
  return [
    { validFrom: `${year}-01-01`, validTo: `${year + 2}-12-31` },
    { validFrom: `${year + 3}-01-01`, validTo: `${year + 4}-12-31` },
  ]
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

function dataHash(data) {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex')
}

function recordId(subdivisionCode, startDate, endDate, name) {
  const suffix = createHash('sha256').update(`${subdivisionCode}\u0000${startDate}\u0000${endDate}\u0000${name}`).digest('hex').slice(0, 20)
  return `DE_${subdivisionCode}_${suffix}`
}

function localizedGermanName(value) {
  if (!Array.isArray(value)) return ''
  return cleanText(value.find((item) => cleanText(item?.language).toUpperCase() === 'DE')?.text) || cleanText(value[0]?.text)
}

function normalizeSchoolHoliday(item, subdivisionCode, today) {
  const startDate = cleanText(item?.startDate)
  const endDate = cleanText(item?.endDate)
  const name = localizedGermanName(item?.name)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate || endDate < today || !name) return null
  const normalized = {
    type: 'schoolHoliday',
    countryCode: 'DE',
    subdivisionCode,
    startDate,
    endDate,
    name,
    source: OPEN_HOLIDAYS_SOURCE,
  }
  return { id: recordId(subdivisionCode, startDate, endDate, name), ...normalized, dataHash: dataHash(normalized) }
}

async function fetchSchoolHolidayRange(subdivisionCode, range, today) {
  const url = new URL(OPEN_HOLIDAYS_URL)
  url.search = new URLSearchParams({ countryIsoCode: 'DE', subdivisionCode, languageIsoCode: 'DE', ...range }).toString()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
    if (!response.ok) throw new Error(`OpenHolidays antwortete mit HTTP ${response.status}.`)
    const payload = await response.json()
    if (!Array.isArray(payload)) throw new Error('OpenHolidays lieferte kein Ferien-Array.')
    return payload.map((item) => normalizeSchoolHoliday(item, subdivisionCode, today)).filter(Boolean)
  } finally {
    clearTimeout(timeout)
  }
}

async function applySchoolHolidays(subdivisionCode, records, today) {
  const snapshot = await db.collection(SCHOOL_HOLIDAYS_COLLECTION).where('countryCode', '==', 'DE').where('subdivisionCode', '==', subdivisionCode).get()
  const existing = new Map(snapshot.docs.map((document) => [document.id, document.data()]))
  const incoming = new Map(records.map((record) => [record.id, record]))
  const batch = db.batch()
  let createdEntryCount = 0
  let changedEntryCount = 0

  for (const record of records) {
    const previous = existing.get(record.id)
    // A completed holiday period is a historical fact and stays immutable.
    if (previous?.endDate < today || previous?.dataHash === record.dataHash) continue
    batch.set(db.collection(SCHOOL_HOLIDAYS_COLLECTION).doc(record.id), {
      ...record,
      sourceUpdatedAt: FieldValue.serverTimestamp(),
      lastUpdatedAt: FieldValue.serverTimestamp(),
      ...(previous ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true })
    if (previous) changedEntryCount += 1
    else createdEntryCount += 1
  }

  for (const [id, previous] of existing) {
    if (!incoming.has(id) && typeof previous.endDate === 'string' && previous.endDate >= today) {
      batch.delete(db.collection(SCHOOL_HOLIDAYS_COLLECTION).doc(id))
      changedEntryCount += 1
    }
  }
  if (createdEntryCount || changedEntryCount) await batch.commit()
  return { createdEntryCount, changedEntryCount }
}

async function syncSubdivisionSchoolHolidays(subdivisionCode, ranges, today) {
  // Fetch both API windows before changing Firestore. A failed request thus
  // leaves the existing holiday data for this Bundesland untouched.
  const responseSets = await Promise.all(ranges.map((range) => fetchSchoolHolidayRange(subdivisionCode, range, today)))
  const records = [...new Map(responseSets.flat().map((record) => [record.id, record])).values()]
  const changes = await applySchoolHolidays(subdivisionCode, records, today)
  return { subdivisionCode, status: records.length ? 'success' : 'empty', totalEntries: records.length, ...changes }
}

function syncErrorMessage(error) {
  const message = cleanText(error?.message).replace(/^.*?:\s*/, '')
  return (message || 'Die Ferien konnten nicht aktualisiert werden.').slice(0, 300)
}

export async function syncSchoolHolidays() {
  const today = berlinDateValue()
  const ranges = schoolHolidaySyncRanges(today)
  const results = await mapWithConcurrency(GERMAN_SUBDIVISION_CODES, SUBDIVISION_SYNC_CONCURRENCY, async (subdivisionCode) => {
    try {
      return await syncSubdivisionSchoolHolidays(subdivisionCode, ranges, today)
    } catch (error) {
      logger.error(`Feriensynchronisation für ${subdivisionCode} fehlgeschlagen.`, error)
      return { subdivisionCode, status: 'failed', totalEntries: 0, createdEntryCount: 0, changedEntryCount: 0, errorMessage: syncErrorMessage(error) }
    }
  })
  const successful = results.filter((result) => result.status === 'success')
  const empty = results.filter((result) => result.status === 'empty')
  const failed = results.filter((result) => result.status === 'failed')
  const createdEntryCount = successful.reduce((count, result) => count + result.createdEntryCount, 0)
  const changedEntryCount = successful.reduce((count, result) => count + result.changedEntryCount, 0)
  const totalEntries = successful.reduce((count, result) => count + result.totalEntries, 0)
  await db.collection(SYNC_STATUS_COLLECTION).doc('DE').set({
    countryCode: 'DE',
    source: OPEN_HOLIDAYS_SOURCE,
    sourceUrl: `${OPEN_HOLIDAYS_URL}?countryIsoCode=DE&subdivisionCode={subdivisionCode}&languageIsoCode=DE&validFrom={validFrom}&validTo={validTo}`,
    ranges,
    subdivisionCodes: GERMAN_SUBDIVISION_CODES,
    successfulSubdivisionCount: successful.length,
    emptySubdivisionCodes: empty.map((result) => result.subdivisionCode),
    failedSubdivisionCodes: failed.map((result) => result.subdivisionCode),
    updatedEntryCount: createdEntryCount + changedEntryCount,
    totalEntries,
    lastSyncedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  return { ranges, createdEntryCount, changedEntryCount, updatedEntryCount: createdEntryCount + changedEntryCount, totalEntries, successfulSubdivisionCount: successful.length, subdivisionResults: results, failedSubdivisions: failed }
}

function syncActorName(profile, request) {
  const name = [cleanText(profile?.firstName), cleanText(profile?.lastName)].filter(Boolean).join(' ')
  return name || cleanText(profile?.name) || cleanText(request?.auth?.token?.name) || cleanText(request?.auth?.token?.email) || 'Administrator'
}

async function writeSyncLog(entry) {
  await db.collection(SYNC_LOG_COLLECTION).add({ countryCode: 'DE', loggedAt: Timestamp.now(), ...entry })
  const logs = await db.collection(SYNC_LOG_COLLECTION).where('countryCode', '==', 'DE').orderBy('loggedAt', 'desc').get()
  if (logs.size <= 10) return
  const batch = db.batch()
  logs.docs.slice(10).forEach((document) => batch.delete(document.ref))
  await batch.commit()
}

export async function runSchoolHolidaySync({ trigger, actorName = null }) {
  let result
  try {
    result = await syncSchoolHolidays()
  } catch (error) {
    try {
      await writeSyncLog({ trigger, actorName, status: 'failed', createdEntryCount: 0, changedEntryCount: 0, successfulSubdivisionCount: 0, subdivisionResults: [], errorMessage: syncErrorMessage(error) })
    } catch (logError) {
      logger.error('Feriensynchronisationsfehler konnte nicht protokolliert werden.', logError)
    }
    throw error
  }
  try {
    await writeSyncLog({
      trigger,
      actorName,
      status: result.successfulSubdivisionCount ? 'success' : 'failed',
      createdEntryCount: result.createdEntryCount,
      changedEntryCount: result.changedEntryCount,
      successfulSubdivisionCount: result.successfulSubdivisionCount,
      subdivisionResults: result.subdivisionResults,
      failedSubdivisions: result.failedSubdivisions,
      errorMessage: result.successfulSubdivisionCount ? null : 'Keines der Bundesländer konnte aktualisiert werden.',
    })
  } catch (logError) {
    logger.error('Erfolgreiche Feriensynchronisation konnte nicht protokolliert werden.', logError)
  }
  if (!result.successfulSubdivisionCount) throw new Error('Keines der Bundesländer konnte aktualisiert werden.')
  return result
}

export const refreshSchoolHolidayData = onCall({ region: 'europe-west3', enforceAppCheck: true, timeoutSeconds: 540 }, async (request) => {
  const profile = await requireActiveProfile(request)
  requireRole(profile, ['admin', 'superadmin'], 'Nur Administratoren können Ferien aktualisieren.')
  if (!publicDataSynchronizationAllowed()) {
    logExternalEffectsSkipped('manual-school-holiday-data-refresh')
    throw new HttpsError('failed-precondition', 'Die Feriensynchronisierung ist für dieses Firebase-Projekt deaktiviert.')
  }
  try {
    return await runSchoolHolidaySync({ trigger: 'manual', actorName: syncActorName(profile, request) })
  } catch (error) {
    logger.error('Feriensynchronisation fehlgeschlagen.', error)
    throw new HttpsError('unavailable', 'Ferien konnten nicht aktualisiert werden. Vorhandene Daten wurden nicht verändert.')
  }
})
