import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'

export const QUALITY_COLLECTIONS = {
  goals: 'qualityGoals',
  measures: 'qualityMeasures',
  deviations: 'qualityDeviations',
  audits: 'qualityAudits',
  improvements: 'qualityImprovements',
}

export const QUALITY_GOAL_STATUSES = ['Geplant', 'Aktiv', 'Erreicht', 'Teilweise erreicht', 'Nicht erreicht', 'Abgebrochen']
export const QUALITY_MEASURE_STATUSES = ['Offen', 'In Bearbeitung', 'Erledigt', 'Überfällig']
export const QUALITY_AUDIT_TYPES = ['Internes Audit', 'Externes Audit', 'Lieferantenaudit', 'Prozessaudit']
export const QUALITY_IMPROVEMENT_STATUSES = ['Idee', 'Prüfung', 'Umsetzung', 'Erledigt']

const trim = (value) => (value ?? '').trim()
const numberOrNull = (value) => value === '' || value === null || value === undefined ? null : Number(value)
const dateValue = (value) => value || ''
const timestampValue = (value) => value?.toMillis?.() ?? 0

function mapSnapshot(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

function sortByDate(items, field = 'dueDate') {
  return [...items].sort((left, right) => (
    (left[field] || '9999-12-31').localeCompare(right[field] || '9999-12-31')
    || timestampValue(right.createdAt) - timestampValue(left.createdAt)
  ))
}

async function listCollection(name, dateField) {
  const snapshot = await getDocs(collection(db, name))
  return sortByDate(snapshot.docs.map(mapSnapshot), dateField)
}

function goalPayload(values) {
  const targetDate = dateValue(values.targetDate)
  return {
    title: trim(values.title),
    description: trim(values.description),
    period: trim(values.period),
    responsible: trim(values.responsible),
    startValue: numberOrNull(values.startValue),
    targetValue: numberOrNull(values.targetValue),
    unit: trim(values.unit),
    currentValue: numberOrNull(values.currentValue),
    startDate: dateValue(values.startDate),
    targetDate,
    dueDate: targetDate || null,
    status: values.status,
    note: trim(values.note),
  }
}

export function createEmptyQualityGoal() {
  const year = String(new Date().getFullYear())
  return {
    title: '',
    description: '',
    period: year,
    responsible: '',
    startValue: '',
    targetValue: '',
    unit: '',
    currentValue: '',
    startDate: '',
    targetDate: '',
    status: 'Geplant',
    note: '',
  }
}

export async function listQualityOverview() {
  const [goals, measures, deviations, audits, improvements] = await Promise.all([
    listCollection(QUALITY_COLLECTIONS.goals, 'dueDate'),
    listCollection(QUALITY_COLLECTIONS.measures, 'dueDate'),
    listCollection(QUALITY_COLLECTIONS.deviations, 'date'),
    listCollection(QUALITY_COLLECTIONS.audits, 'dueDate'),
    listCollection(QUALITY_COLLECTIONS.improvements, 'dueDate'),
  ])
  return { goals, measures, deviations, audits, improvements }
}

export async function getQualityGoal(goalId) {
  const snapshot = await getDoc(doc(db, QUALITY_COLLECTIONS.goals, goalId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function createQualityGoal(values) {
  const goalRef = doc(collection(db, QUALITY_COLLECTIONS.goals))
  await setDoc(goalRef, {
    id: goalRef.id,
    ...goalPayload(values),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return goalRef.id
}

export async function updateQualityGoal(goalId, values) {
  await updateDoc(doc(db, QUALITY_COLLECTIONS.goals, goalId), {
    ...goalPayload(values),
    updatedAt: serverTimestamp(),
  })
}

export async function listQualityGoalProgress(goalId) {
  const snapshot = await getDocs(collection(db, QUALITY_COLLECTIONS.goals, goalId, 'progressEntries'))
  return snapshot.docs
    .map(mapSnapshot)
    .sort((left, right) => (
      (right.date || '').localeCompare(left.date || '')
      || timestampValue(right.createdAt) - timestampValue(left.createdAt)
    ))
}

export async function addQualityGoalProgress(goalId, values) {
  const goalRef = doc(db, QUALITY_COLLECTIONS.goals, goalId)
  const progressRef = doc(collection(goalRef, 'progressEntries'))
  const batch = writeBatch(db)
  batch.set(progressRef, {
    id: progressRef.id,
    date: dateValue(values.date),
    value: numberOrNull(values.value),
    note: trim(values.note),
    createdAt: serverTimestamp(),
  })
  batch.update(goalRef, {
    currentValue: numberOrNull(values.value),
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}
