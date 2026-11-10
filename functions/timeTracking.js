import { createHash, randomUUID } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'
import { berlinTimeDate, calculateTimeDay, canCorrectOwnTime, effectiveTimeVacations, normalizeTimeEvents, TIME_CORRECTION_REASONS, timeDateRange, timeModelForDate, timeModelsOverlap, validTimeDate, vacationTimeDay } from './shared/timeTracking.js'

const options = { region: 'europe-west3', enforceAppCheck: true }
const bad = (message) => { throw new HttpsError('invalid-argument', message) }
const id = (value) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value)
const integer = (value, min = 0, max = 1440) => Number.isSafeInteger(value) && value >= min && value <= max
const records = (snapshot) => snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))
const person = (value) => ({ id: value.id, firstName: value.firstName || '', lastName: value.lastName || '', departmentId: value.departmentId || '' })
function checked(fn) {
  try { return fn() } catch (error) { if (error instanceof HttpsError) throw error; bad(error.message) }
}
export function mayManageTime(profile, target) {
  return profile.active === true && (profile.role === 'superadmin' || (profile.timeManager === true && (profile.timeManagerAllDepartments === true || Boolean(target.departmentId && profile.timeManagerDepartments?.includes(target.departmentId)))))
}
function assertUserAccess(profile, target, ownId, targetId) {
  if (targetId !== ownId && !mayManageTime(profile, target)) throw new HttpsError('permission-denied', 'Keine Zuständigkeit für diese Person.')
}
export function requireOwnTimeAccess(profile, edit = false) {
  if (profile?.active !== true || (profile.role !== 'superadmin' && !(edit ? ['edit'] : ['view', 'edit']).includes(profile.permissions?.timeTracking))) throw new HttpsError('permission-denied', 'Keine Berechtigung für die Zeiterfassung.')
}
export function requireExpectedTimeUser(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.')
  if (typeof request.data?.expectedUserId !== 'string' || request.data.expectedUserId !== request.auth.uid) throw new HttpsError('permission-denied', 'Das angemeldete Konto hat sich geändert. Bitte neu laden; ausstehende Buchungen bleiben beim ursprünglichen Konto.')
}
export function requirePersonnelTimeAccess(profile) {
  if (profile?.active !== true || (profile.role !== 'superadmin' && !['view', 'edit'].includes(profile.permissions?.personnel))) throw new HttpsError('permission-denied', 'Kein Zugriff auf Personal-Zeitkonten.')
}
function assertVacationAccess(profile) {
  if (profile.role !== 'superadmin' && !['view', 'edit'].includes(profile.permissions?.vacation)) throw new HttpsError('permission-denied', 'Kein Zugriff auf Urlaub.')
}
async function targetUser(db, userId) {
  if (!id(userId)) bad('Ungültige Mitarbeiter-ID.')
  const snapshot = await db.doc(`users/${userId}`).get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Mitarbeiter nicht gefunden.')
  return { ...snapshot.data(), id: snapshot.id }
}
function cleanModel(input) {
  if (!input || !id(input.userId) || !validTimeDate(input.validFrom) || (input.validTo && !validTimeDate(input.validTo)) || (input.validTo && input.validTo < input.validFrom)) bad('Gültigen Modellzeitraum angeben.')
  const modelId = input.id || randomUUID()
  if (!id(modelId)) bad('Ungültige Modell-ID.')
  const weekdays = {}
  for (let day = 0; day < 7; day++) {
    const value = input.weekdays?.[String(day)] || { targetMinutes: 0, breaks: [] }
    if (!integer(value.targetMinutes) || !Array.isArray(value.breaks) || value.breaks.length > 20) bad('Ungültige Sollstunden oder Pausenregeln.')
    let previousThreshold = -1
    let previousRequired = 0
    const breaks = [...value.breaks].sort((a, b) => a.afterMinutes - b.afterMinutes).map((rule) => {
      if (!integer(rule.afterMinutes) || !integer(rule.requiredMinutes) || rule.afterMinutes <= previousThreshold || rule.requiredMinutes < previousRequired) bad('Pausengrenzen müssen eindeutig und Pausenzeiten aufsteigend sein.')
      previousThreshold = rule.afterMinutes; previousRequired = rule.requiredMinutes
      return { afterMinutes: rule.afterMinutes, requiredMinutes: rule.requiredMinutes }
    })
    weekdays[String(day)] = { targetMinutes: value.targetMinutes, breaks }
  }
  const country = input.holidayCountryCode || 'DE'
  const subdivision = (input.holidaySubdivisionCode || '').replace(new RegExp(`^${country}-`), '')
  if (!/^[A-Z]{2}$/.test(country) || (subdivision && !/^[A-Z0-9]{1,5}$/.test(subdivision))) bad('Ungültige Feiertagsregion.')
  return { id: modelId, userId: input.userId, validFrom: input.validFrom, validTo: input.validTo || '', weekdays, holidayCountryCode: country, holidaySubdivisionCode: subdivision }
}
export const saveTimeWorkModel = onCall(options, async (request) => {
  const actor = await requireActiveProfile(request)
  requireRole(actor, ['superadmin'])
  const model = cleanModel(request.data?.model)
  const db = getFirestore()
  await targetUser(db, model.userId)
  await db.runTransaction(async (transaction) => {
    const lockRef = db.doc(`timeAccounts/${model.userId}`)
    const modelRef = db.doc(`timeWorkModels/${model.id}`)
    const [lock, existing, all, currentActor] = await Promise.all([transaction.get(lockRef), transaction.get(modelRef), transaction.get(db.collection('timeWorkModels').where('userId', '==', model.userId)), transaction.get(db.doc(`users/${request.auth.uid}`))])
    if (currentActor.data()?.active !== true || currentActor.data()?.role !== 'superadmin') throw new HttpsError('permission-denied', 'Nur aktive Superadmins dürfen Arbeitszeitmodelle pflegen.')
    if (existing.exists && existing.data().userId !== model.userId) throw new HttpsError('permission-denied', 'Modell gehört einer anderen Person.')
    if (records(all).some((other) => other.id !== model.id && timeModelsOverlap(model, other))) throw new HttpsError('failed-precondition', 'Arbeitszeitmodelle dürfen sich nicht überschneiden.')
    const now = FieldValue.serverTimestamp()
    transaction.set(modelRef, { ...model, updatedAt: now, updatedBy: request.auth.uid, ...(!existing.exists ? { createdAt: now } : {}) }, { merge: true })
    transaction.set(lockRef, { modelRevision: (lock.data()?.modelRevision || 0) + 1 }, { merge: true })
    transaction.create(db.collection('timeHistory').doc(), { userId: model.userId, kind: 'model', before: existing.data() || null, after: model, createdBy: request.auth.uid, createdAt: now })
  })
  return { model }
})
export const saveTimeAccount = onCall(options, async (request) => {
  const profile = await requireActiveProfile(request)
  requireRole(profile, ['superadmin'])
  const { userId, startDate, openingBalanceMinutes } = request.data || {}
  if (!id(userId) || !validTimeDate(startDate) || !integer(openingBalanceMinutes, -10000000, 10000000)) bad('Startdatum und Anfangssaldo gültig angeben.')
  const db = getFirestore()
  await targetUser(db, userId)
  const account = { startDate, openingBalanceMinutes }
  await db.runTransaction(async (transaction) => {
    const ref = db.doc(`timeAccounts/${userId}`)
    const [old, currentActor] = await Promise.all([transaction.get(ref), transaction.get(db.doc(`users/${request.auth.uid}`))])
    if (currentActor.data()?.active !== true || currentActor.data()?.role !== 'superadmin') throw new HttpsError('permission-denied', 'Nur aktive Superadmins dürfen Anfangssalden pflegen.')
    transaction.set(ref, { ...account, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true })
    transaction.create(db.collection('timeHistory').doc(), { userId, kind: 'account', before: old.data() || null, after: account, createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp() })
  })
  return { account }
})

export const stampTime = onCall(options, async (request) => {
  requireExpectedTimeUser(request)
  requireOwnTimeAccess(await requireActiveProfile(request), true)
  const db = getFirestore()
  const { eventId, type, at, offline = false } = request.data || {}
  if (!id(eventId) || typeof offline !== 'boolean') bad('Ungültige Stempelbuchung.')
  const now = new Date()
  let date
  try { date = berlinTimeDate(at) } catch { bad('Ungültiger Zeitpunkt.') }
  const [event] = checked(() => normalizeTimeEvents([{ id: eventId, type, at, source: offline ? 'offline' : 'live' }], date, now))
  if (!offline && Math.abs(Date.parse(event.at) - now.getTime()) > 5 * 60000) bad('Live-Buchung liegt zu weit vom aktuellen Zeitpunkt entfernt. Bitte nachtragen.')
  return persistTimeStamp(db, request.auth.uid, event, now)
})
export function persistTimeStamp(db, userId, event, now = new Date()) {
  const date = berlinTimeDate(event.at)
  return db.runTransaction(async (transaction) => {
    const auditKey = createHash('sha256').update(JSON.stringify([userId, event.id])).digest('hex')
    const auditRef = db.doc(`timeHistory/stamp-${auditKey}`)
    const dayRef = db.doc(`timeDays/${userId}_${date}`)
    const [audit, day, actor] = await Promise.all([transaction.get(auditRef), transaction.get(dayRef), transaction.get(db.doc(`users/${userId}`))])
    if (actor.data()?.active !== true) throw new HttpsError('permission-denied', 'Dieses Benutzerkonto ist nicht freigegeben.')
    requireOwnTimeAccess(actor.data(), true)
    if (audit.exists) {
      const original = audit.data()
      if (original.userId !== userId || original.after?.type !== event.type || original.after?.at !== event.at) throw new HttpsError('already-exists', 'Diese Buchungs-ID wurde bereits anders verwendet.')
      return { accepted: true, duplicate: true, date, revision: day.data()?.revision || 0 }
    }
    const events = [...(day.data()?.events || []), { ...event, receivedAt: now.toISOString() }].sort((a, b) => a.at.localeCompare(b.at))
    if (events.length > 100) bad('Zu viele Buchungen an diesem Tag.')
    const result = calculateTimeDay({ date, events, now })
    if (result.issues.some((issue) => issue === 'Buchungsfolge muss geklärt werden.' || issue === 'Ungültige oder zeitgleiche Buchung.')) throw new HttpsError('failed-precondition', 'Buchung widerspricht bestehenden Zeiten. Bitte mit den gespeicherten Zeiten abgleichen; Offlinebuchung bleibt auf dem Gerät.')
    const revision = (day.data()?.revision || 0) + 1
    transaction.set(dayRef, { userId, date, events, revision, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    transaction.create(auditRef, { userId, date, kind: 'stamp', after: event, offline: event.source === 'offline', createdBy: userId, createdAt: FieldValue.serverTimestamp(), deviceAt: event.at })
    return { accepted: true, date, revision }
  })
}
export const correctTimeDay = onCall(options, async (request) => {
  requireExpectedTimeUser(request)
  const profile = await requireActiveProfile(request)
  const db = getFirestore()
  const input = request.data || {}
  const userId = input.userId || request.auth.uid
  const user = await targetUser(db, userId)
  assertUserAccess(profile, user, request.auth.uid, userId)
  const manager = mayManageTime(profile, user)
  if (userId === request.auth.uid && !manager) requireOwnTimeAccess(profile, true)
  const now = new Date()
  if (!validTimeDate(input.date) || input.date > berlinTimeDate(now)) bad('Ungültiger Buchungstag.')
  if (!manager && !canCorrectOwnTime(input.date, now)) throw new HttpsError('permission-denied', 'Nur heute und die vergangenen sieben Kalendertage können selbst korrigiert werden.')
  if (!TIME_CORRECTION_REASONS.includes(input.reason) || (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 1000))) bad('Bitte einen Korrekturgrund auswählen.')
  if (!integer(input.expectedRevision, 0, Number.MAX_SAFE_INTEGER)) bad('Bitte die aktuellen Buchungen neu laden, bevor Sie korrigieren.')
  if (!Array.isArray(input.events)) bad('Ungültige Buchungsliste.')
  const events = checked(() => normalizeTimeEvents(input.events.map((event) => ({ ...event, id: event.id || randomUUID(), source: 'correction' })), input.date, now))
  const calculation = calculateTimeDay({ date: input.date, events, now })
  if (calculation.issues.some((issue) => ['Buchungsfolge muss geklärt werden.', 'Ungültige oder zeitgleiche Buchung.'].includes(issue))) bad('Bitte eine gültige Folge aus Kommen, Pause und Gehen angeben.')
  return persistTimeCorrection(db, { ...input, events, userId }, request.auth.uid, now)
})
export function persistTimeCorrection(db, input, actorId, now = new Date()) {
  const { userId, events } = input
  const auditId = randomUUID()
  return db.runTransaction(async (transaction) => {
    const ref = db.doc(`timeDays/${userId}_${input.date}`)
    const [old, actorSnapshot, userSnapshot] = await Promise.all([transaction.get(ref), transaction.get(db.doc(`users/${actorId}`)), transaction.get(db.doc(`users/${userId}`))])
    const actor = actorSnapshot.data()
    const target = userSnapshot.data()
    if (actor?.active !== true || !target) throw new HttpsError('permission-denied', 'Kein aktiver Zugriff.')
    assertUserAccess(actor, target, actorId, userId)
    if (userId === actorId && !mayManageTime(actor, target)) requireOwnTimeAccess(actor, true)
    if (!mayManageTime(actor, target) && !canCorrectOwnTime(input.date, now)) throw new HttpsError('permission-denied', 'Die Korrekturfrist ist abgelaufen.')
    if ((old.data()?.revision || 0) !== input.expectedRevision) throw new HttpsError('aborted', 'Die Buchungen wurden zwischenzeitlich geändert. Bitte neu laden.')
    const correctedEvents = events.map((event) => {
      const original = old.data()?.events?.find((before) => before.id === event.id && before.type === event.type && before.at === event.at)
      return original || event
    })
    const revision = input.expectedRevision + 1
    transaction.set(ref, { userId, date: input.date, events: correctedEvents, revision, updatedAt: FieldValue.serverTimestamp() })
    transaction.create(db.doc(`timeHistory/${auditId}`), { userId, date: input.date, kind: old.data()?.events?.length ? 'correction' : 'addition', before: old.data()?.events || [], after: correctedEvents, reason: input.reason, note: input.note?.trim() || '', createdBy: actorId, createdAt: FieldValue.serverTimestamp() })
    return { date: input.date, revision }
  })
}

export function isTimeHoliday(date, model, holidays, companyRegion = { countryCode: 'DE', subdivisionCode: 'DE-NW' }) {
  const country = model?.holidayCountryCode || companyRegion.countryCode || 'DE'
  const subdivision = (model?.holidaySubdivisionCode || companyRegion.subdivisionCode || 'DE-NW').replace(new RegExp(`^${country}-`), '')
  return holidays.some((holiday) => {
    if (!validTimeDate(holiday.date || holiday.startDate) || holiday.active === false || (holiday.date || holiday.startDate) > date || (holiday.endDate || holiday.date || holiday.startDate) < date) return false
    if (!holiday.countryCode) return true
    if (holiday.countryCode !== country) return false
    return holiday.nationalHoliday === true || holiday.subdivisionCodes?.some((code) => code.replace(new RegExp(`^${holiday.countryCode}-`), '') === subdivision)
  })
}
export const listTimeWorkspace = onCall(options, async (request) => {
  const profile = await requireActiveProfile(request)
  const ownId = request.auth.uid
  const today = berlinTimeDate()
  const { from = `${today.slice(0, 7)}-01`, to = today, ownOnly = false, managed = false, personnelOnly = false } = request.data || {}
  let userId = request.data?.userId || ownId
  if (typeof ownOnly !== 'boolean' || (ownOnly && userId !== ownId)) throw new HttpsError('permission-denied', 'Die mobile Ansicht zeigt nur eigene Daten.')
  if (typeof personnelOnly !== 'boolean' || (personnelOnly && (ownOnly || managed))) throw new HttpsError('permission-denied', 'Ungültiger Personalzugriff.')
  if (personnelOnly) requirePersonnelTimeAccess(profile)
  if (typeof managed !== 'boolean' || (ownOnly && managed) || (managed && profile.role !== 'superadmin' && profile.timeManager !== true)) throw new HttpsError('permission-denied', 'Kein Zugriff auf das Zeitmanagement.')
  const requested = checked(() => timeDateRange(from, to))
  if (requested.length > 400) bad('Bitte höchstens 400 Tage gleichzeitig anzeigen.')
  const db = getFirestore()
  const employeePromise = !ownOnly && !personnelOnly && (profile.role === 'superadmin' || profile.timeManager === true) ? db.collection('users').get() : null
  if (managed && !request.data?.userId) {
    const scope = records(await employeePromise).filter((entry) => entry.active === true && mayManageTime(profile, entry))
    if (!scope.length) throw new HttpsError('failed-precondition', 'Keine Mitarbeiter in den zugewiesenen Abteilungen vorhanden.')
    userId = scope[0].id
  }
  const user = await targetUser(db, userId)
  if (!personnelOnly) assertUserAccess(profile, user, ownId, userId)
  if (managed && !mayManageTime(profile, user)) throw new HttpsError('permission-denied', 'Keine Zuständigkeit für diese Person.')
  if (!personnelOnly && userId === ownId && (ownOnly || !mayManageTime(profile, user))) requireOwnTimeAccess(profile)
  const [daySnapshot, modelSnapshot, accountSnapshot, vacationSnapshot, legacyHolidays, historySnapshot, employeeSnapshot, holidaySettings] = await Promise.all([
    db.collection('timeDays').where('userId', '==', userId).get(),
    db.collection('timeWorkModels').where('userId', '==', userId).get(),
    db.doc(`timeAccounts/${userId}`).get(),
    db.collection('vacationRequests').where('userId', '==', userId).get(),
    db.collection('calendarHolidays').get(),
    personnelOnly ? null : db.collection('timeHistory').where('userId', '==', userId).where('kind', 'in', ['correction', 'addition']).orderBy('createdAt', 'desc').limit(500).get(), employeePromise, db.doc('appSettings/holidayCalendar').get(),
  ])
  const models = records(modelSnapshot).sort((a, b) => a.validFrom.localeCompare(b.validFrom))
  const countries = [...new Set([holidaySettings.data()?.companyHolidayRegion?.countryCode || 'DE', ...models.map((model) => model.holidayCountryCode || 'DE')])]
  const holidayQueries = []
  for (let offset = 0; offset < countries.length; offset += 30) holidayQueries.push(db.collection('publicHolidays').where('countryCode', 'in', countries.slice(offset, offset + 30)).get())
  const publicHolidays = (await Promise.all(holidayQueries)).flatMap(records)
  const accountData = accountSnapshot.data() || {}
  const account = { startDate: accountData.startDate || models[0]?.validFrom || today, openingBalanceMinutes: accountData.openingBalanceMinutes || 0 }
  const daily = new Map(records(daySnapshot).map((day) => [day.date, day]))
  const vacations = effectiveTimeVacations(records(vacationSnapshot))
  const holidays = [...records(legacyHolidays), ...publicHolidays]
  const allDates = checked(() => timeDateRange(account.startDate < from ? account.startDate : from, to > today ? to : today))
  const results = allDates.map((date) => {
    const day = daily.get(date)
    const model = timeModelForDate(models, date)
    const result = calculateTimeDay({ date, events: day?.events || [], revision: day?.revision || 0, model, holiday: isTimeHoliday(date, model, holidays, holidaySettings.data()?.companyHolidayRegion), ...vacationTimeDay(date, vacations) })
    if (vacations.some((entry) => entry.startDate < entry.endDate && entry.startDate <= date && entry.endDate >= date && entry.days % 1 === 0.5 && !entry.halfDayDate && ['approved', 'manual'].includes(entry.status))) {
      result.calculationIncomplete = true
      result.issues.push('Halben Urlaubstag für diesen Zeitraum zuordnen.')
    }
    return result
  })
  // Incomplete days are provisional: display their known parts, but do not let
  // a forgotten clock-out manufacture an overnight credit or a final debit.
  const accountDays = results.filter((day) => day.date >= account.startDate && day.date <= today)
  const balanceMinutes = account.openingBalanceMinutes + accountDays.filter((day) => !day.incomplete && !day.calculationIncomplete).reduce((sum, day) => sum + day.balanceMinutes, 0)
  const balanceProvisional = accountDays.some((day) => day.incomplete || day.calculationIncomplete)
  if (personnelOnly) return personnelTimeProjection({ user: person(user), account, balanceMinutes, balanceProvisional, days: results.filter((day) => day.date >= from && day.date <= to) })
  const employees = employeeSnapshot ? records(employeeSnapshot).filter((entry) => entry.active === true && ((!managed && entry.id === ownId) || mayManageTime(profile, entry))).map(person) : [person(user)]
  const history = records(historySnapshot).filter((entry) => ['correction', 'addition'].includes(entry.kind)).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 500).map((entry) => ({ ...entry, createdAt: entry.createdAt?.toDate?.().toISOString() || null }))
  const unresolvedDays = results.filter((day) => day.date < today && day.incomplete).slice(-30)
  return { user: person(user), days: results.filter((day) => day.date >= from && day.date <= to), account, balanceMinutes, balanceProvisional, models: !ownOnly && profile.role === 'superadmin' ? models : [], employees, history, unresolvedDays }
})
export function personnelTimeProjection({ user, account, balanceMinutes, balanceProvisional, days }) {
  return { user, account, balanceMinutes, balanceProvisional, days: days.map(({ date, overtimeDebitMinutes, overtimeRequestIds, calculationIncomplete }) => ({ date, overtimeDebitMinutes, overtimeRequestIds, calculationIncomplete })) }
}
export const getOwnMobileVacation = onCall(options, async (request) => {
  const profile = await requireActiveProfile(request)
  assertVacationAccess(profile)
  const db = getFirestore()
  const userId = request.auth.uid
  const [requests, history, hr, adjustments, holidays, blocks, holidaySettings] = await Promise.all([
    db.collection('vacationRequests').where('userId', '==', userId).get(),
    db.collection('vacationHistory').where('userId', '==', userId).get(), db.doc(`employeeHrProfiles/${userId}`).get(),
    db.collection('hrVacationAdjustments').where('userId', '==', userId).get(), db.collection('calendarHolidays').get(), db.collection('vacationBlocks').get(), db.doc('appSettings/holidayCalendar').get(),
  ])
  const companyRegion = holidaySettings.data()?.companyHolidayRegion || { countryCode: 'DE', subdivisionCode: 'DE-NW' }
  const publicHolidays = await db.collection('publicHolidays').where('countryCode', '==', companyRegion.countryCode || 'DE').get()
  const companyHolidays = records(publicHolidays).filter((holiday) => isTimeHoliday(holiday.date, null, [holiday], companyRegion)).map((holiday) => ({ id: `company-holiday-${holiday.id}`, date: holiday.date, startDate: holiday.date, endDate: holiday.date, label: holiday.displayNameDe || holiday.name || holiday.sourceName || 'Feiertag', kind: 'company-holiday' }))
  const values = hr.data() || {}
  const safeProfile = Object.fromEntries(['annualVacationEntitlement', 'vacationTrackingStartYear', 'vacationTrackingOpeningBalance'].map((key) => [key, Number.isFinite(values[key]) ? values[key] : null]))
  const safeAdjustments = adjustments.docs.map((item) => {
    const data = item.data()
    return { isManual: true, status: 'manual', startDate: data.adjustmentDate || '', endDate: data.adjustmentDate || '', days: (data.direction === 'deduct' ? -1 : 1) * (Number(data.days) || 0) }
  })
  return { requests: records(requests), history: records(history), profile: safeProfile, adjustments: safeAdjustments, holidays: [...records(holidays), ...companyHolidays], blocks: records(blocks) }
})
