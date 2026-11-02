import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'

const calendars = {
  'system-damages': { module: 'damages', collection: 'damageCases' },
  'system-insolvencies': { module: 'insolvencies', collection: 'insolvencies', dates: ['insolvencyDate'] },
  'system-legal-disputes': { module: 'legalDisputes', collection: 'legalDisputes' },
  'system-inkasso': { module: 'inkasso', collection: 'inkassoCases', dates: ['originalDueDate', 'lastReminderDate', 'lawyerHandoverDate', 'paymentOrderDate', 'enforcementOrderDate'] },
}
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const canView = (profile, module) => profile?.role === 'superadmin' || ['view', 'edit'].includes(profile?.permissions?.[module])
const validDate = (value) => {
  if (typeof value !== 'string' || !datePattern.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const parentFields = ['caseNumber', 'title', 'partnerName', 'courtReference', 'debtorName', 'insolvencyDate', 'originalDueDate', 'lastReminderDate', 'lawyerHandoverDate', 'paymentOrderDate', 'enforcementOrderDate']
function parentSource(snapshot) {
  const data = snapshot.data()
  return { id: snapshot.id, ...Object.fromEntries(parentFields.filter((field) => Object.hasOwn(data, field)).map((field) => [field, data[field]])) }
}

export function validateSystemCalendarQuery(data, profile) {
  const { from, until, upcomingFrom } = data || {}
  if (![from, until, upcomingFrom].every(validDate) || from > until || new Date(`${until}T00:00:00Z`) - new Date(`${from}T00:00:00Z`) > 370 * 86400000) throw new HttpsError('invalid-argument', 'Ungültiger Kalenderzeitraum.')
  if (!Array.isArray(data.calendarIds) || data.calendarIds.some((id) => !Object.hasOwn(calendars, id))) throw new HttpsError('invalid-argument', 'Ungültige Kalenderauswahl.')
  const selected = [...new Set(data.calendarIds)].map((id) => calendars[id])
  if (selected.some((item) => !canView(profile, item.module))) throw new HttpsError('permission-denied', 'Keine Berechtigung für diesen Kalender.')
  return { from, until, upcomingFrom, selected }
}

function visibleParent(collection, data) {
  return collection !== 'insolvencies' || (!data.splitArchivedAt && !data.mergedIntoPartnerId)
}
function visibleDeadline(parentPath, data) {
  return typeof data.date === 'string' && datePattern.test(data.date) && (!parentPath.startsWith('insolvencies/') || !data.splitArchivedAt)
}

// Deadline collection-group access stays server-only. Shared names also occur
// under To-dos; only exact, explicitly authorized case paths are returned.
export function calendarDeadlineParent(path, allowedCollections) {
  const parts = path.split('/')
  return parts.length === 4 && parts[2] === 'deadlines' && allowedCollections.has(parts[0]) ? `${parts[0]}/${parts[1]}` : null
}

export async function loadSystemCalendarSources(db, options) {
  const { from, until, upcomingFrom, selected } = options
  const allowed = new Set(selected.map((item) => item.collection))
  const parents = new Map()
  const deadlines = new Map()
  const loadParents = async (snapshots) => {
    const paths = [...new Set(snapshots.map((item) => calendarDeadlineParent(item.ref.path, allowed)).filter(Boolean))].filter((path) => !parents.has(path))
    for (let offset = 0; offset < paths.length; offset += 200) {
      const values = await db.getAll(...paths.slice(offset, offset + 200).map((path) => db.doc(path)))
      values.forEach((item) => parents.set(item.ref.path, item.exists && visibleParent(item.ref.path.split('/')[0], item.data()) ? parentSource(item) : null))
    }
    for (const item of snapshots) {
      const path = calendarDeadlineParent(item.ref.path, allowed)
      if (path && parents.get(path) && visibleDeadline(path, item.data())) {
        const data = item.data()
        deadlines.set(item.ref.path, { id: item.id, parentPath: path, date: data.date, time: data.time || '', type: data.type || '', note: data.note || '', reminderEnabled: data.reminderEnabled === true })
      }
    }
  }
  if (allowed.size) {
    const range = await db.collectionGroup('deadlines').where('date', '>=', from).where('date', '<=', until).get()
    await loadParents(range.docs)
    // Keep the existing "next ten" behavior even when the selected month is
    // historical or the next appointment is outside the buffered month range.
    // Page through future deadlines until the selected sources have ten in
    // total, or end. A calendar with no future deadline must not force a scan
    // of the complete future history when another calendar already has ten.
    let cursor = null
    const futureDates = []
    while (true) {
      let query = db.collectionGroup('deadlines').where('date', '>=', upcomingFrom).orderBy('date').limit(100)
      if (cursor) query = query.startAfter(cursor)
      const page = await query.get()
      await loadParents(page.docs)
      for (const item of page.docs) {
        const path = calendarDeadlineParent(item.ref.path, allowed)
        if (path && parents.get(path) && visibleDeadline(path, item.data())) futureDates.push(item.get('date'))
      }
      const lastDate = page.docs.at(-1)?.get('date')
      // Finish the cutoff day, because time-of-day breaks equal-date ties.
      if (page.size < 100 || (futureDates.length >= 10 && lastDate > futureDates[9])) break
      cursor = page.docs.at(-1)
    }
  }
  await Promise.all(selected.flatMap((source) => (source.dates || []).map(async (field) => {
    const collection = db.collection(source.collection)
    const range = await collection.where(field, '>=', from).where(field, '<=', until).get()
    for (const item of range.docs) if (visibleParent(source.collection, item.data())) parents.set(item.ref.path, parentSource(item))
    let cursor = null
    let count = 0
    while (count < 10) {
      let query = collection.where(field, '>=', upcomingFrom).orderBy(field).limit(10)
      if (cursor) query = query.startAfter(cursor)
      const page = await query.get()
      for (const item of page.docs) if (visibleParent(source.collection, item.data()) && typeof item.get(field) === 'string' && datePattern.test(item.get(field))) { parents.set(item.ref.path, parentSource(item)); count += 1 }
      if (page.size < 10) break
      cursor = page.docs.at(-1)
    }
  })))
  return {
    cases: Object.fromEntries([...allowed].map((collection) => [collection, [...parents.entries()].filter(([path, value]) => value && path.startsWith(`${collection}/`)).map(([, value]) => value)])),
    deadlines: [...deadlines.values()],
  }
}

export async function listSystemCalendarSourcesHandler(request) {
  const profile = await requireActiveProfile(request)
  const options = validateSystemCalendarQuery(request.data, profile)
  try { return await loadSystemCalendarSources(getFirestore(), options) }
  catch (error) {
    await recordDiagnostic({ module: 'calendar', stage: 'load', code: String(error?.code || 'calendar-query-failed'), message: 'Kalenderdaten konnten serverseitig nicht geladen werden.', actorId: request.auth.uid, actorName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || 'Unbekannt' })
    throw new HttpsError('unavailable', 'Kalenderdaten konnten nicht geladen werden. Bitte erneut versuchen.')
  }
}
