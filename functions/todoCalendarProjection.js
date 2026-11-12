import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'
import { todoAudienceMember, todoReminderRecipientIds } from './shared/todoCollaboration.js'

const text = (value) => typeof value === 'string' ? value.trim() : ''
const hasAccess = (profile) => profile?.active === true && (profile.role === 'superadmin' || ['view', 'edit'].includes(profile.permissions?.todos))
const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

export function todoProjectionCalendars(uid, profile) {
  const personal = { id: `personal-${uid}`, name: 'Mein Kalender', color: '#c99a3d', kind: 'personal', ownerUserId: uid, accessLevel: 'view', todoCalendar: true, systemCalendar: true }
  const department = text(profile?.department)
  return [personal, ...(department ? [{ id: `todo-department:${department}`, name: department, color: '#55758d', kind: 'department', accessLevel: 'view', todoCalendar: true, systemCalendar: true }] : [])]
}

export function validateTodoCalendarQuery(data, profile) {
  if (!hasAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für To-do-Kalender.')
  if (!data || Object.keys(data).some((key) => !['from', 'until', 'upcomingFrom'].includes(key)) || ![data.from, data.until, data.upcomingFrom].every(validDate)
    || data.from > data.until || new Date(`${data.until}T00:00:00Z`) - new Date(`${data.from}T00:00:00Z`) > 370 * 86400000) {
    throw new HttpsError('invalid-argument', 'Ungültiger Kalenderzeitraum.')
  }
  return { from: data.from, until: data.until, upcomingFrom: data.upcomingFrom }
}

function sourceDates(todo, deadlines) {
  const due = validDate(todo.dueDate)
  const reminder = validDate(todo.reminderDate)
  const main = []
  if (due) main.push({ id: 'due', date: todo.dueDate, type: 'due', time: reminder && todo.reminderDate === todo.dueDate ? todo.reminderTime : '', reminderEnabled: reminder && todo.reminderDate === todo.dueDate, selection: todo, note: '' })
  if (reminder && (!due || todo.reminderDate !== todo.dueDate)) main.push({ id: 'reminder', date: todo.reminderDate, type: 'reminder', time: todo.reminderTime, reminderEnabled: true, selection: todo, note: '' })
  return [...main, ...deadlines.filter((item) => validDate(item.date)).map((item) => ({ ...item, id: `deadline:${item.id}`, selection: item }))]
}

export function projectTodoCalendarEntries(todo, deadlines, uid, profile, calendars = todoProjectionCalendars(uid, profile)) {
  // Neither a creator fallback nor administrator status places a task on a
  // personal calendar. Placement follows the current actual audience only.
  if (!hasAccess(profile) || !['open', 'in_progress', 'completed'].includes(todo.status) || !todoAudienceMember(todo, uid, profile)) return []
  const department = todo.audienceType === 'department'
  const calendar = department ? calendars.find((item) => item.id === `todo-department:${text(todo.audienceId)}`) : calendars.find((item) => item.id === `personal-${uid}`)
  if (!calendar) return []
  const directory = [{ ...profile, id: uid }]
  return sourceDates(todo, deadlines).filter((source) => department || todoReminderRecipientIds(todo, source.selection, directory).includes(uid)).map((source) => {
    const time = validTime(source.time) ? source.time : ''
    const label = source.type === 'due' ? 'Fällig' : source.type === 'reminder' ? 'Erinnerung' : source.type === 'appointment' ? 'Termin' : 'Frist'
    return {
      id: `todo:${todo.id}:${source.id}`, calendarId: calendar.id, calendarName: calendar.name, calendarColor: calendar.color,
      title: `${text(todo.title) || 'To-do'} · ${label}`.slice(0, 240), description: text(source.note),
      startDate: source.date, endDate: source.date, allDay: !time, startTime: time, endTime: time,
      reminderEnabled: todo.status !== 'completed' && source.reminderEnabled === true, hasReminder: source.type !== 'due' || source.reminderEnabled === true,
      completed: todo.status === 'completed',
      todoDeadline: true, systemCalendar: true, targetPath: `/todos/${encodeURIComponent(todo.id)}`,
    }
  })
}

export async function loadTodoCalendarProjection(db, uid, profile, range) {
  const calendars = todoProjectionCalendars(uid, profile)
  const collection = db.collection('todos')
  // Equality queries use the same audience dimensions as the task list. Never
  // read legacy mirrors or an unbounded directory of other users' tasks.
  const queries = [collection.where('audienceType', '==', 'all'), collection.where('audienceId', '==', uid), collection.where('audienceIds', 'array-contains', uid)]
  const department = text(profile.department)
  if (department) queries.push(collection.where('audienceType', '==', 'department').where('audienceId', '==', department))
  const tasks = new Map((await Promise.all(queries.map((query) => query.get()))).flatMap((snapshot) => snapshot.docs).map((snapshot) => [snapshot.id, { ...snapshot.data(), id: snapshot.id }]))
  const entries = (await Promise.all([...tasks.values()].filter((todo) => ['open', 'in_progress', 'completed'].includes(todo.status) && todoAudienceMember(todo, uid, profile)).map(async (todo) => {
    const deadlines = await db.collection(`todos/${todo.id}/deadlines`).get()
    return projectTodoCalendarEntries(todo, deadlines.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id })), uid, profile, calendars)
  }))).flat()
  const selected = new Map(entries.filter((entry) => entry.startDate >= range.from && entry.startDate <= range.until).map((entry) => [entry.id, entry]))
  // Preserve the next-ten view even when the displayed month is historical.
  for (const calendar of calendars) {
    const upcoming = entries.filter((entry) => entry.calendarId === calendar.id && entry.startDate >= range.upcomingFrom)
      .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.startTime.localeCompare(right.startTime) || left.id.localeCompare(right.id)).slice(0, 10)
    for (const entry of upcoming) selected.set(entry.id, entry)
  }
  return { calendars, entries: [...selected.values()].sort((left, right) => left.startDate.localeCompare(right.startDate) || left.startTime.localeCompare(right.startTime) || left.id.localeCompare(right.id)) }
}

export async function listTodoCalendarProjectionHandler(request) {
  const profile = await requireActiveProfile(request)
  const range = validateTodoCalendarQuery(request.data, profile)
  try { return await loadTodoCalendarProjection(getFirestore(), request.auth.uid, profile, range) }
  catch {
    await recordDiagnostic({ module: 'calendar', stage: 'load', code: 'internal', message: 'To-do-Kalenderdaten konnten nicht geladen werden.', actorId: request.auth.uid })
    throw new HttpsError('unavailable', 'To-do-Kalenderdaten konnten nicht geladen werden.')
  }
}
