import { randomUUID } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'

export const QUALITY_KINDS = Object.freeze({ topic: { collection: 'qualityTopics', module: 'kvp' }, meeting: { collection: 'qualityMeetings', module: 'kvp' }, handbook: { collection: 'qualityHandbook', module: 'handbook' } })
export const QUALITY_TOPIC_OPTIONAL_FIELDS = Object.freeze(['cycleStartDate', 'smartSpecific', 'smartMeasurable', 'smartAchievable', 'smartRelevant', 'smartTimeBound', 'actDecision', 'actDate'])
const handbookOptionalFields = ['lastReviewedDate', 'nextReviewDate']
const fields = {
  topic: ['departmentId', 'title', 'status', 'plan', 'do', 'check', 'act', 'goal', 'measure', 'owner', 'startDate', 'dueDate', 'cycle', ...QUALITY_TOPIC_OPTIONAL_FIELDS],
  meeting: ['departmentId', 'title', 'date', 'participants', 'notes', 'topicIds'],
  handbook: ['departmentId', 'title', 'process', 'situation', 'consequences', 'action', 'prevention', ...handbookOptionalFields],
}
const invalid = (message = 'Ungültige Qualitätsdaten.') => { throw new HttpsError('invalid-argument', message) }
const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
function date(value, required = false) {
  if (!value && !required) return
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid('Ungültiges Datum.')
}

export function normalizeQualityInput(data) {
  if (!data || !Object.hasOwn(QUALITY_KINDS, data.kind)) invalid()
  if (Object.keys(data).some((key) => !['kind', 'id', 'expectedRevision', 'values'].includes(key))) invalid()
  const { kind, values, expectedRevision } = data
  const id = data.id ?? randomUUID()
  if (!validId(id) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) invalid()
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some((key) => !fields[kind].includes(key))) invalid()
  const clean = {}
  for (const key of fields[kind]) {
    // Older clients do not know these fields. Omission is distinct from clearing.
    if (((kind === 'topic' && QUALITY_TOPIC_OPTIONAL_FIELDS.includes(key)) || (kind === 'handbook' && handbookOptionalFields.includes(key))) && !Object.hasOwn(values, key)) continue
    const value = values[key]
    if (key === 'cycle') {
      if (!Number.isSafeInteger(value) || value < 1) invalid('Ungültiger PDCA-Durchlauf.')
      clean[key] = value
    } else if (key === 'topicIds') {
      if (!Array.isArray(value) || value.length > 100 || value.some((item) => !validId(item)) || new Set(value).size !== value.length) invalid('Ungültige Themenauswahl.')
      clean[key] = [...value]
    } else {
      const limit = key === 'title' ? 200 : key === 'departmentId' ? 128 : ['owner', 'process'].includes(key) ? 500 : key.endsWith('Date') || key === 'date' ? 10 : key.startsWith('smart') && !['smartSpecific', 'smartMeasurable'].includes(key) ? 2000 : key === 'actDecision' ? 20 : 20000
      if (typeof value !== 'string' || value.length > limit) invalid(`Ungültiger Wert für ${key}.`)
      clean[key] = value.trim()
    }
  }
  if (!validId(clean.departmentId) || !clean.title) invalid('Abteilung und Titel sind erforderlich.')
  if (kind === 'topic') {
    if (!['active', 'completed', 'paused'].includes(clean.status)) invalid('Ungültiger Themenstatus.')
    date(clean.startDate); date(clean.dueDate)
    date(clean.cycleStartDate); date(clean.actDate)
    if (Object.hasOwn(clean, 'actDecision') && !['', 'correct', 'discard', 'establish'].includes(clean.actDecision)) invalid('Ungültige Act-Entscheidung.')
    if (clean.actDate && clean.actDecision === '') invalid('Für das Act-Datum ist eine Entscheidung erforderlich.')
    if (clean.startDate && clean.dueDate && clean.startDate > clean.dueDate) invalid('Das Ende darf nicht vor dem Beginn liegen.')
  }
  if (kind === 'meeting') date(clean.date, true)
  if (kind === 'handbook') {
    if (!clean.process) invalid('Ein Prozessabschnitt ist erforderlich.')
    date(clean.lastReviewedDate); date(clean.nextReviewDate)
    if (clean.lastReviewedDate && clean.nextReviewDate && clean.nextReviewDate < clean.lastReviewedDate) invalid('Die nächste Kontrolle darf nicht vor der letzten Kontrolle liegen.')
  }
  return { kind, id, expectedRevision, values: clean }
}

export function requireQualityEdit(profile, kind) {
  const module = QUALITY_KINDS[kind]?.module
  if (!module || profile?.active !== true || (profile.role !== 'superadmin' && profile.permissions?.[module] !== 'edit')) throw new HttpsError('permission-denied', 'Keine Bearbeitungsberechtigung für diesen Qualitätsbereich.')
}

export async function persistQualityRecord(db, input, actor) {
  const { kind, id, expectedRevision, values } = input
  const reference = db.doc(`${QUALITY_KINDS[kind].collection}/${id}`)
  return db.runTransaction(async (transaction) => {
    const [current, department, profileSnapshot] = await Promise.all([
      transaction.get(reference), transaction.get(db.doc(`departments/${values.departmentId}`)), transaction.get(db.doc(`users/${actor.uid}`)),
    ])
    const profile = profileSnapshot.exists ? profileSnapshot.data() : null
    requireQualityEdit(profile, kind)
    if (!department.exists) throw new HttpsError('failed-precondition', 'Die gewählte Abteilung existiert nicht mehr.')
    const previous = current.exists ? current.data() : null
    if (!previous && department.data().active === false) throw new HttpsError('failed-precondition', 'In einer inaktiven Abteilung können keine neuen Einträge angelegt werden.')
    if ((previous?.revision ?? 0) !== expectedRevision) throw new HttpsError('aborted', 'Der Eintrag wurde inzwischen geändert. Bitte neu laden und die Änderungen abgleichen.')
    if (previous && previous.departmentId !== values.departmentId) throw new HttpsError('failed-precondition', 'Die Abteilung eines bestehenden Eintrags kann nicht geändert werden.')
    if (kind === 'topic' && (previous ? ![previous.cycle, previous.cycle + 1].includes(values.cycle) : values.cycle !== 1)) invalid('Ein neuer PDCA-Durchlauf muss direkt auf den bisherigen folgen.')
    if (kind === 'topic' && previous?.status === 'completed' && values.cycle !== previous.cycle) throw new HttpsError('failed-precondition', 'Das Thema muss vor einem neuen Durchlauf wieder geöffnet werden.')
    const optionalValues = kind === 'topic' ? Object.fromEntries(QUALITY_TOPIC_OPTIONAL_FIELDS.flatMap((key) => {
      if (previous && previous.cycle !== values.cycle) return [[key, '']]
      // Keep absence on untouched legacy records so the UI can still recognize
      // and display the existing legacy goal/measurement fields.
      return previous && Object.hasOwn(previous, key) ? [[key, previous[key]]] : []
    })) : kind === 'handbook' ? Object.fromEntries(handbookOptionalFields.filter((key) => previous && Object.hasOwn(previous, key)).map((key) => [key, previous[key]])) : {}
    const mergedValues = { ...optionalValues, ...values }
    if (kind === 'topic' && mergedValues.actDate && !mergedValues.actDecision) invalid('Für das Act-Datum ist eine Entscheidung erforderlich.')
    if (kind === 'handbook' && mergedValues.lastReviewedDate && mergedValues.nextReviewDate && mergedValues.nextReviewDate < mergedValues.lastReviewedDate) invalid('Die nächste Kontrolle darf nicht vor der letzten Kontrolle liegen.')
    if (kind === 'meeting') {
      const topics = await Promise.all(values.topicIds.map((topicId) => transaction.get(db.doc(`qualityTopics/${topicId}`))))
      if (topics.some((topic) => !topic.exists || topic.data().departmentId !== values.departmentId)) throw new HttpsError('failed-precondition', 'Alle besprochenen Themen müssen zur gewählten Abteilung gehören.')
    }
    const revision = expectedRevision + 1
    const now = FieldValue.serverTimestamp()
    const actorName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || profile.email || actor.uid
    const record = { ...mergedValues, revision, createdAt: previous?.createdAt ?? now, createdBy: previous?.createdBy ?? actor.uid, updatedAt: now, updatedBy: actor.uid, updatedByName: actorName }
    transaction.set(reference, record)
    transaction.create(reference.collection('revisions').doc(String(revision)), record)
    return { id, revision }
  })
}

export async function saveQualityRecordHandler(request) {
  const profile = await requireActiveProfile(request)
  const input = normalizeQualityInput(request.data)
  requireQualityEdit(profile, input.kind)
  return persistQualityRecord(getFirestore(), input, { uid: request.auth.uid })
}
