import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase.js'

export const CALENDARS_COLLECTION = 'calendars'
export const CALENDAR_PERMISSIONS_COLLECTION = 'calendarPermissions'
export const CALENDAR_LEVELS = ['none', 'view', 'edit']
export const DEFAULT_CALENDAR_COLOR = '#55758d'

export function personalCalendarId(userId) {
  return `personal-${userId}`
}

export function calendarPermissionId(calendarId, userId) {
  return `${calendarId}_${userId}`
}

function cleanText(value, maxLength = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function cleanColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : DEFAULT_CALENDAR_COLOR
}

function normalizeCalendar(id, data) {
  return {
    id,
    name: cleanText(data?.name, 80) || 'Unbenannter Kalender',
    color: cleanColor(data?.color),
    kind: data?.kind === 'personal' ? 'personal' : 'shared',
    ownerUserId: typeof data?.ownerUserId === 'string' ? data.ownerUserId : null,
    active: data?.active !== false,
    ...data,
  }
}

function normalizeEvent(id, data, calendar) {
  return {
    id,
    calendarId: calendar.id,
    calendarName: calendar.name,
    calendarColor: calendar.color,
    title: cleanText(data?.title, 160) || 'Ohne Titel',
    description: cleanText(data?.description, 4000),
    startDate: typeof data?.startDate === 'string' ? data.startDate : '',
    endDate: typeof data?.endDate === 'string' ? data.endDate : '',
    allDay: data?.allDay !== false,
    startTime: typeof data?.startTime === 'string' ? data.startTime : '',
    endTime: typeof data?.endTime === 'string' ? data.endTime : '',
    createdByUserId: typeof data?.createdByUserId === 'string' ? data.createdByUserId : '',
    ...data,
  }
}

export async function ensurePersonalCalendar(userId) {
  const reference = doc(db, CALENDARS_COLLECTION, personalCalendarId(userId))
  const current = await getDoc(reference)
  if (!current.exists()) {
    await setDoc(reference, {
      name: 'Mein Kalender',
      color: DEFAULT_CALENDAR_COLOR,
      kind: 'personal',
      ownerUserId: userId,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return normalizeCalendar(reference.id, { name: 'Mein Kalender', color: DEFAULT_CALENDAR_COLOR, kind: 'personal', ownerUserId: userId, active: true })
  }
  return normalizeCalendar(current.id, current.data())
}

export async function listCalendars() {
  const snapshot = await getDocs(collection(db, CALENDARS_COLLECTION))
  return snapshot.docs.map((item) => normalizeCalendar(item.id, item.data())).sort((left, right) => left.name.localeCompare(right.name, 'de'))
}

export async function listUserCalendars(userId, isSuperadmin) {
  const personal = await ensurePersonalCalendar(userId)
  if (isSuperadmin) return (await listCalendars()).filter((calendar) => calendar.active !== false).map((calendar) => ({ ...calendar, accessLevel: 'edit' }))

  const permissions = await getDocs(query(collection(db, CALENDAR_PERMISSIONS_COLLECTION), where('userId', '==', userId)))
  const granted = permissions.docs.map((item) => item.data()).filter((item) => ['view', 'edit'].includes(item.level))
  const sharedCalendars = await Promise.all(granted.map(async (permission) => {
    const item = await getDoc(doc(db, CALENDARS_COLLECTION, permission.calendarId))
    return item.exists() ? { ...normalizeCalendar(item.id, item.data()), accessLevel: permission.level } : null
  }))
  return [{ ...personal, accessLevel: 'edit' }, ...sharedCalendars.filter((item) => item && item.id !== personal.id)]
    .filter((item) => item.active !== false)
    .sort((left, right) => (left.kind === 'personal' ? -1 : right.kind === 'personal' ? 1 : left.name.localeCompare(right.name, 'de')))
}

export async function listCalendarPermissions(calendarId) {
  const snapshot = await getDocs(query(collection(db, CALENDAR_PERMISSIONS_COLLECTION), where('calendarId', '==', calendarId)))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data(), level: CALENDAR_LEVELS.includes(item.data().level) ? item.data().level : 'none' }))
}

export async function createCalendar(values) {
  const name = cleanText(values?.name, 80)
  if (!name) throw new Error('Bitte einen Namen für den Kalender angeben.')
  const reference = await addDoc(collection(db, CALENDARS_COLLECTION), {
    name,
    color: cleanColor(values?.color),
    kind: 'shared',
    ownerUserId: null,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return reference.id
}

export async function updateCalendar(calendarId, values) {
  const update = { updatedAt: serverTimestamp() }
  if (values?.name !== undefined) {
    const name = cleanText(values.name, 80)
    if (!name) throw new Error('Bitte einen Namen für den Kalender angeben.')
    update.name = name
  }
  if (values?.color !== undefined) update.color = cleanColor(values.color)
  if (typeof values?.active === 'boolean') update.active = values.active
  await updateDoc(doc(db, CALENDARS_COLLECTION, calendarId), update)
}

export async function setCalendarPermission(calendarId, userId, level) {
  const permissionLevel = CALENDAR_LEVELS.includes(level) ? level : 'none'
  await setDoc(doc(db, CALENDAR_PERMISSIONS_COLLECTION, calendarPermissionId(calendarId, userId)), {
    calendarId,
    userId,
    level: permissionLevel,
    updatedAt: serverTimestamp(),
  })
}

export async function listCalendarEvents(calendars) {
  const eventLists = await Promise.all(calendars.map(async (calendar) => {
    const snapshot = await getDocs(collection(db, CALENDARS_COLLECTION, calendar.id, 'events'))
    return snapshot.docs.map((item) => normalizeEvent(item.id, item.data(), calendar))
  }))
  return eventLists.flat()
}

function eventPayload(values, userId, previous = null) {
  const title = cleanText(values?.title, 160)
  const startDate = typeof values?.startDate === 'string' ? values.startDate : ''
  const endDate = typeof values?.endDate === 'string' ? values.endDate : ''
  if (!title || !startDate || !endDate || endDate < startDate) throw new Error('Bitte Titel und einen gültigen Zeitraum angeben.')
  const allDay = values?.allDay !== false
  return {
    title,
    description: cleanText(values?.description, 4000),
    startDate,
    endDate,
    allDay,
    startTime: allDay ? '' : (typeof values?.startTime === 'string' ? values.startTime : ''),
    endTime: allDay ? '' : (typeof values?.endTime === 'string' ? values.endTime : ''),
    createdByUserId: previous?.createdByUserId || userId,
    createdAt: previous?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

export async function createCalendarEvent(calendarId, values, userId) {
  await addDoc(collection(db, CALENDARS_COLLECTION, calendarId, 'events'), eventPayload(values, userId))
}

export async function updateCalendarEvent(calendarId, eventId, values, previous) {
  await updateDoc(doc(db, CALENDARS_COLLECTION, calendarId, 'events', eventId), eventPayload(values, previous.createdByUserId, previous))
}

export async function deleteCalendarEvent(calendarId, eventId) {
  await deleteDoc(doc(db, CALENDARS_COLLECTION, calendarId, 'events', eventId))
}
