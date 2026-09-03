import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from './firebase.js'

export const VACATION_REQUESTS_COLLECTION = 'vacationRequests'
export const CALENDAR_HOLIDAYS_COLLECTION = 'calendarHolidays'
export const VACATION_BLOCKS_COLLECTION = 'vacationBlocks'

export const VACATION_STATUSES = [
  { value: 'approved', label: 'Genehmigt' },
  { value: 'pending', label: 'Ausstehend' },
  { value: 'rejected', label: 'Abgelehnt' },
  { value: 'change_requested', label: 'Änderungsantrag' },
  { value: 'cancellation_requested', label: 'Stornoantrag' },
]

const requestsRef = collection(db, VACATION_REQUESTS_COLLECTION)
const holidaysRef = collection(db, CALENDAR_HOLIDAYS_COLLECTION)
const vacationBlocksRef = collection(db, VACATION_BLOCKS_COLLECTION)
const trim = (value) => (value ?? '').trim()

export function toDate(value) {
  if (!value) return null
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function dateValue(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function todayValue() {
  return dateValue(new Date())
}

export function businessDays(startDate, endDate) {
  const start = toDate(startDate)
  const end = toDate(endDate)
  if (!start || !end || end < start) return 0

  let days = 0
  const cursor = new Date(start)
  while (cursor <= end) {
    const weekday = cursor.getDay()
    if (weekday !== 0 && weekday !== 6) days += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export function requestOverlaps(request, startDate, endDate) {
  return Boolean(request?.startDate && request?.endDate && request.startDate <= endDate && request.endDate >= startDate)
}

export function getVacationStatus(status) {
  return VACATION_STATUSES.find((item) => item.value === status) ?? VACATION_STATUSES[1]
}

export function formatVacationDate(value) {
  const date = toDate(value)
  return date ? new Intl.DateTimeFormat('de-DE').format(date) : '—'
}

export function formatVacationPeriod(request) {
  return `${formatVacationDate(request.startDate)} – ${formatVacationDate(request.endDate)}`
}

export async function listVacationRequests(userId) {
  const approvedQuery = query(requestsRef, where('status', '==', 'approved'))
  const ownQuery = userId ? query(requestsRef, where('userId', '==', userId)) : requestsRef
  const [approvedSnapshot, ownSnapshot] = await Promise.all([getDocs(approvedQuery), getDocs(ownQuery)])
  return [...new Map([...approvedSnapshot.docs, ...ownSnapshot.docs].map((item) => [item.id, item])).values()]
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.type === 'vacation' || !item.type)
    .sort((left, right) => (right.startDate || '').localeCompare(left.startDate || '') || (right.endDate || '').localeCompare(left.endDate || ''))
}

function calendarEntry(snapshot, fallbackLabel) {
  const data = snapshot.data()
  const startDate = data.startDate || data.date || ''
  const endDate = data.endDate || data.date || startDate
  return { id: snapshot.id, ...data, startDate, endDate, label: trim(data.label || data.name) || fallbackLabel }
}

export async function listVacationCalendarItems() {
  const [holidaySnapshot, blockSnapshot] = await Promise.all([getDocs(holidaysRef).catch(() => null), getDocs(vacationBlocksRef).catch(() => null)])
  return {
    holidays: holidaySnapshot?.docs.map((item) => calendarEntry(item, 'Feiertag')).filter((item) => item.startDate && item.endDate) || [],
    blocks: blockSnapshot?.docs.map((item) => calendarEntry(item, 'Urlaubssperre')).filter((item) => item.startDate && item.endDate) || [],
  }
}

function requestPayload(userId, values, extra = {}) {
  const startDate = values.startDate || ''
  const endDate = values.endDate || ''
  const requestedDays = Number(values.days)
  return {
    userId,
    startDate,
    endDate,
    days: Number.isFinite(requestedDays) && requestedDays >= 0 ? requestedDays : businessDays(startDate, endDate),
    status: extra.status || 'pending',
    type: 'vacation',
    note: trim(values.note),
    ...extra,
  }
}

export async function createVacationRequest(userId, values) {
  const requestRef = doc(requestsRef)
  await setDoc(requestRef, {
    id: requestRef.id,
    ...requestPayload(userId, values),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return requestRef.id
}

export async function createVacationChangeRequest(originalRequest, userId, values) {
  if (!originalRequest?.id || originalRequest.userId !== userId) throw new Error('Ungültiger Änderungsantrag.')
  const requestRef = doc(requestsRef)
  await setDoc(requestRef, {
    id: requestRef.id,
    ...requestPayload(userId, values, {
      status: 'change_requested',
      originalRequestId: originalRequest.id,
      changeRequest: {
        originalStartDate: originalRequest.startDate,
        originalEndDate: originalRequest.endDate,
        originalDays: originalRequest.days ?? businessDays(originalRequest.startDate, originalRequest.endDate),
      },
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return requestRef.id
}

export async function createVacationCancellationRequest(originalRequest, userId, values = {}) {
  if (!originalRequest?.id || originalRequest.userId !== userId) throw new Error('Ungültiger Stornoantrag.')
  const requestRef = doc(requestsRef)
  await setDoc(requestRef, {
    id: requestRef.id,
    ...requestPayload(userId, { startDate: originalRequest.startDate, endDate: originalRequest.endDate, note: values.note }, {
      status: 'cancellation_requested',
      requestKind: 'cancellation',
      originalRequestId: originalRequest.id,
      cancellationRequest: {
        originalStartDate: originalRequest.startDate,
        originalEndDate: originalRequest.endDate,
        originalDays: originalRequest.days ?? businessDays(originalRequest.startDate, originalRequest.endDate),
      },
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return requestRef.id
}
