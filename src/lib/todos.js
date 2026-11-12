import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { calendarDaysUntil, reminderDeadlineTime } from './caseDeadline.js'
import { getUserDisplayName } from './userProfiles.js'
import { todoReminderFields, validateReminderForm } from './reminderForm.js'
import { invalidateReminderStatuses } from './reminders.js'
import { berlinToday } from '../../shared/reminderTime.js'
import { reportCaseFailure } from './caseDiagnostics.js'
import { canCollaborateTodo, canManageTodoAudience, canReadTodoForUser, normalizeTodoReminderRecipients, todoAudienceMember, todoEligibleParticipants } from '../../shared/todoCollaboration.js'

export const TODOS_COLLECTION = 'todos'
export const TODO_STATUS = { open: 'Offen', in_progress: 'In Bearbeitung', completed: 'Erledigt', withdrawn: 'Zurückgezogen' }
export const TODO_PRIORITY = { low: 'Gering', medium: 'Mittel', high: 'Hoch' }
export const TODO_SCHEDULE_TYPES = [
  { value: 'deadline', label: 'Frist' },
  { value: 'appointment', label: 'Termin' },
]
const todosRef = collection(db, TODOS_COLLECTION)
const activePoolStatuses = ['open', 'in_progress', 'completed']
const trim = (value) => (value ?? '').trim()
const timestampValue = (value) => value?.toMillis?.() ?? 0
const mapSnapshot = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })

// Rules validate this display snapshot against the authoritative user profile.
// Authentication email may differ during profile migrations; prefer the same
// persisted fallback used by the rules rather than an arbitrary client label.
function actorName(actor) { return getUserDisplayName(actor.profile, { email: actor.profile?.email }) }
function updateCollection(todoId) { return collection(db, TODOS_COLLECTION, todoId, 'updates') }
function deadlineCollection(todoId) { return collection(db, TODOS_COLLECTION, todoId, 'deadlines') }
function systemUpdate(text, actor) { return { text: text.length > 1000 ? `${text.slice(0, 999)}…` : text, type: 'system', createdByUserId: actor.user.uid, createdByName: actorName(actor), createdAt: serverTimestamp() } }
function todoAccessError(message) { return Object.assign(new Error(message), { code: 'permission-denied' }) }
function todoConflict(message) { return Object.assign(new Error(message), { code: 'todo/stale-edit' }) }
function sameStoredValue(left, right) {
  if (left == null || right == null) return left == null && right == null
  if (typeof left.toMillis === 'function' || typeof right.toMillis === 'function') {
    if (typeof left.toMillis !== 'function' || typeof right.toMillis !== 'function') return false
    return typeof left.isEqual === 'function' ? left.isEqual(right) : left.toMillis() === right.toMillis()
  }
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameStoredValue(value, right[index]))
  if (typeof left === 'object' && typeof right === 'object') {
    const keys = Object.keys(left)
    return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameStoredValue(left[key], right[key]))
  }
  return left === right
}
function assertCurrentSnapshot(expected, current, fields, label) {
  if (fields.some((field) => !sameStoredValue(expected[field], current[field]))) throw todoConflict(`${label} wurde inzwischen geändert. Bitte erneut öffnen und die aktuellen Angaben prüfen.`)
}
async function freshTodoActor(transaction, actor) {
  const snapshot = await transaction.get(doc(db, 'users', actor.user.uid))
  if (!snapshot.exists() || snapshot.data().active !== true) throw todoAccessError('Der Benutzer ist nicht mehr aktiv.')
  return { ...actor, profile: snapshot.data() }
}
function assertTodoEditable(todo, actor) {
  if (!canCollaborateTodo(todo, actor)) throw todoAccessError('Keine Berechtigung, dieses To-do zu bearbeiten.')
  if (!activeTodo(todo)) throw todoConflict(todo.status === 'completed' ? 'Das To-do wurde inzwischen erledigt. Bitte erneut öffnen, bevor du es bearbeitest.' : 'Das To-do wurde inzwischen zurückgezogen und kann nicht mehr bearbeitet werden.')
}
async function runTodoStatusTransaction(todoRef, actor, expectedStatuses, action) {
  try { await runTransaction(db, action) }
  catch (error) {
    // A competing state transition can make the commit ACL fail before the
    // SDK retries the transaction. Distinguish that race from revoked access.
    if (['permission-denied', 'aborted'].includes(error?.code)) {
      try {
        const [snapshot, profile] = await Promise.all([getDocFromServer(todoRef), getDocFromServer(doc(db, 'users', actor.user.uid))])
        if (snapshot.exists() && profile.exists() && canCollaborateTodo(snapshot.data(), { ...actor, profile: profile.data() })
          && !expectedStatuses.includes(snapshot.data().status)) throw todoConflict('Der Status des To-dos wurde inzwischen geändert. Bitte die aktuellen Angaben prüfen.')
      } catch (currentError) { if (currentError?.code === 'todo/stale-edit') throw currentError }
    }
    throw error
  }
}
function uniqueIds(ids) { return [...new Set((ids || []).filter(Boolean))] }
function optionalId(value) { return trim(value) || null }
function optionalName(value) { return trim(value) || null }
function transportOrderLinks(value) {
  const links = Array.isArray(value) ? value : []
  return [...new Map(links.map((link) => [trim(link?.id), { id: trim(link?.id), number: trim(link?.number) }]).filter(([id]) => Boolean(id))).values()].slice(0, 20)
}
function storedTransportOrderLinks(todo) {
  const links = transportOrderLinks(todo?.transportOrderLinks)
  return links.length || !todo?.transportOrderId ? links : transportOrderLinks([{ id: todo.transportOrderId, number: todo.transportOrderNumber || todo.reference || todo.transportOrderId }])
}
function priorityValue(value) { return ['low', 'medium', 'high'].includes(value) ? value : 'medium' }
function localDayNumber(value = new Date()) { return Math.floor(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000) }
function dateDayNumber(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!match) return null
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? Math.floor(Date.UTC(year, month - 1, day) / 86400000) : null
}
function priorityRank(todo) { return { high: 0, medium: 1, low: 2 }[todoPriority(todo)] }
function activeTodo(todo) { return ['open', 'in_progress'].includes(todo.status) }
function dueDistance(todo, now) { const dueDay = dateDayNumber(todo.dueDate); return dueDay === null ? Number.MAX_SAFE_INTEGER : dueDay - localDayNumber(now) }
function terminalRank(todo) { return todo.status === 'completed' ? 0 : 1 }
function terminalTimestamp(todo) { return timestampValue(todo.completedAt || todo.withdrawnAt || todo.updatedAt) }

function todoFields(values, previous = null) {
  const links = transportOrderLinks(values.transportOrderLinks)
  return {
    title: trim(values.title),
    description: trim(values.description),
    dueDate: values.dueDate || null,
    ...todoReminderFields(values, previous),
    ...normalizeTodoReminderRecipients(values, previous),
    priority: priorityValue(values.priority),
    customerId: optionalId(values.customerId),
    customerName: optionalName(values.customerName),
    carrierId: optionalId(values.carrierId),
    carrierName: optionalName(values.carrierName),
    reference: optionalName(values.reference || links[0]?.number),
    // Die Mehrfachverknüpfung ist das führende Datenmodell. Die beiden
    // Einzelfelder bleiben ausschließlich für alte To-dos lesbar und werden
    // bei jeder neuen Speicherung geleert. Dadurch kann eine Verknüpfung
    // nicht an einer veralteten Einzel-Referenz scheitern.
    transportOrderId: null,
    transportOrderNumber: null,
    transportOrderLinks: links,
    damageCaseId: optionalId(values.damageCaseId),
    insolvencyId: optionalId(values.insolvencyId),
    legalDisputeId: optionalId(values.legalDisputeId),
    inkassoCaseId: optionalId(values.inkassoCaseId),
  }
}

function audienceValues(values, usersById, actor) {
  if (values.audienceType === 'self') return { audienceType: 'person', audienceId: actor.user.uid, audienceIds: null, audienceLabel: actorName(actor) }
  if (values.audienceType === 'all') return { audienceType: 'all', audienceId: null, audienceIds: null, audienceLabel: 'Alle' }
  if (values.audienceType === 'department') {
    const department = trim(values.audienceId)
    return { audienceType: 'department', audienceId: department, audienceIds: null, audienceLabel: `Abteilung: ${department}` }
  }
  const targets = uniqueIds(values.audienceIds).map((id) => usersById.get(id))
  if (!targets.length || targets.some((target) => !target)) throw new Error('Bitte mindestens eine aktive Person auswählen.')
  const names = targets.map((target) => getUserDisplayName(target, target))
  return { audienceType: 'people', audienceId: null, audienceIds: targets.map((target) => target.id), audienceLabel: `Personen: ${names.join(', ')}` }
}

function sortTodos(todos) { return [...todos].sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt)) }
async function queryTodos(...constraints) { return (await getDocs(query(todosRef, ...constraints))).docs.map(mapSnapshot) }

export function createEmptyTodo() { return { title: '', description: '', dueDate: '', reminderDate: '', reminderTime: '', reminderOccurrence: null, reminderRecipientMode: 'all', reminderRecipientUserIds: [], priority: 'medium', customerId: '', customerName: '', carrierId: '', carrierName: '', reference: '', transportOrderLinks: [], damageCaseId: '', insolvencyId: '', legalDisputeId: '', inkassoCaseId: '', audienceType: 'self', audienceId: '', audienceIds: [] } }
export function isSelfTodo(todo, uid) { return todo.creatorUserId === uid && todo.audienceType === 'person' && todo.audienceId === uid }
export function todoPriority(todo) { return priorityValue(todo.priority) }
export function todoStatus(todo) { return TODO_STATUS[todo.status] ? todo.status : 'open' }

export function todoDuePresentation(todo, now = new Date()) {
  if (!activeTodo(todo)) return { kind: 'none', label: todo.dueDate ? 'Fällig am' : 'Keine Fälligkeit', days: null }
  const days = dueDistance(todo, now)
  if (days === Number.MAX_SAFE_INTEGER) return { kind: 'none', label: 'Keine Fälligkeit', days: null }
  if (days < 0) return { kind: 'overdue', label: `${Math.abs(days)} ${Math.abs(days) === 1 ? 'Tag' : 'Tage'} überfällig`, days }
  if (days === 0) return { kind: 'today', label: 'Heute fällig', days }
  if (days <= 3) return { kind: 'soon', label: `Fällig in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`, days }
  return { kind: 'none', label: 'Fällig später', days }
}

function validScheduleDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') }
function cleanScheduleNote(value) { return trim(value).slice(0, 4000) }
function todoDeadlinePayload(values, previous = null) {
  const type = values?.type === 'appointment' ? 'appointment' : 'deadline'
  const date = trim(values?.date)
  if (!validScheduleDate(date)) throw new Error('Bitte ein gültiges Datum erfassen.')
  const time = reminderDeadlineTime(values)
  const resolved = values?.reminderEnabled ? validateReminderForm({ date, time, occurrence: values?.reminderOccurrence || null }) : null
  return { type, date, time, reminderEnabled: values?.reminderEnabled === true, reminderOccurrence: resolved?.occurrence || null, ...normalizeTodoReminderRecipients(values, previous), note: cleanScheduleNote(values?.note) || null }
}

export function todoScheduleTypeLabel(type) { return TODO_SCHEDULE_TYPES.find((item) => item.value === type)?.label || 'Frist' }

export function createEmptyTodoDeadline() { return { type: 'deadline', date: berlinToday(), time: '', reminderEnabled: false, reminderOccurrence: null, reminderRecipientMode: 'all', reminderRecipientUserIds: [], note: '' } }

export function todoDeadlinePresentation(deadline, now = new Date()) {
  if (!validScheduleDate(deadline?.date)) return { kind: 'none', label: 'Kein Termin', days: null }
  const days = calendarDaysUntil(deadline.date, now)
  if (days < 0) return { kind: 'overdue', label: `${Math.abs(days)} ${Math.abs(days) === 1 ? 'Tag' : 'Tage'} überfällig`, days }
  if (days === 0) return { kind: 'today', label: 'Heute', days }
  if (days <= 3) return { kind: 'urgent', label: `In ${days} ${days === 1 ? 'Tag' : 'Tagen'}`, days }
  if (days <= 7) return { kind: 'warning', label: `In ${days} Tagen`, days }
  return { kind: 'none', label: 'Später', days }
}

function compareStandard(left, right, now) {
  const leftUrgency = todoDuePresentation(left, now); const rightUrgency = todoDuePresentation(right, now)
  const urgencyOrder = { overdue: 0, today: 1, soon: 2, none: 3 }
  const urgencyDifference = urgencyOrder[leftUrgency.kind] - urgencyOrder[rightUrgency.kind]
  if (urgencyDifference) return urgencyDifference
  const priorityDifference = priorityRank(left) - priorityRank(right)
  if (priorityDifference) return priorityDifference
  const dateDifference = dueDistance(left, now) - dueDistance(right, now)
  if (dateDifference) return dateDifference
  return timestampValue(right.updatedAt) - timestampValue(left.updatedAt)
}

export function sortTodosForGroup(todos, group, now = new Date()) {
  return [...todos].sort((left, right) => {
    const leftActive = activeTodo(left); const rightActive = activeTodo(right)
    if (leftActive !== rightActive) return leftActive ? -1 : 1
    if (!leftActive) {
      const statusDifference = terminalRank(left) - terminalRank(right)
      return statusDifference || terminalTimestamp(right) - terminalTimestamp(left)
    }
    if (group === 'created') {
      const leftUrgency = todoDuePresentation(left, now); const rightUrgency = todoDuePresentation(right, now)
      const urgencyOrder = { overdue: 0, today: 1, soon: 2, none: 3 }
      const urgencyDifference = urgencyOrder[leftUrgency.kind] - urgencyOrder[rightUrgency.kind]
      if (urgencyDifference) return urgencyDifference
      const followUpRank = (todo) => todo.status === 'open' && !todo.assignedUserId ? 0 : todo.status === 'in_progress' ? 1 : 2
      const followUpDifference = followUpRank(left) - followUpRank(right)
      return followUpDifference || compareStandard(left, right, now)
    }
    if (group === 'pool') {
      const availabilityRank = (todo) => todo.status === 'open' && !todo.assignedUserId ? 0 : 1
      const availabilityDifference = availabilityRank(left) - availabilityRank(right)
      if (availabilityDifference) return availabilityDifference
    }
    return compareStandard(left, right, now)
  })
}

export function audienceHasChanged(todo, values, uid) {
  if (values.audienceType === 'self') return !isSelfTodo(todo, uid)
  if (values.audienceType === 'all') return todo.audienceType !== 'all'
  if (values.audienceType === 'department') return todo.audienceType !== 'department' || todo.audienceId !== trim(values.audienceId)
  const currentIds = todo.audienceType === 'people' ? uniqueIds(todo.audienceIds) : todo.audienceType === 'person' ? [todo.audienceId] : []
  const nextIds = uniqueIds(values.audienceIds)
  return currentIds.length !== nextIds.length || currentIds.some((id) => !nextIds.includes(id))
}

export function isAudienceMember(todo, actor) { return todoAudienceMember(todo, actor.user.uid, actor.profile) }

export async function getTodoById(todoId) {
  const snapshot = await getDoc(doc(db, TODOS_COLLECTION, todoId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export function subscribeTodo(todoId, onValue, onError) {
  return onSnapshot(doc(db, TODOS_COLLECTION, todoId), (snapshot) => onValue(snapshot.exists() ? mapSnapshot(snapshot) : null), onError)
}

export function subscribeTodoUpdates(todoId, onValue, onError) {
  return onSnapshot(query(updateCollection(todoId), orderBy('createdAt', 'desc')), (snapshot) => onValue(snapshot.docs.map(mapSnapshot)), onError)
}

export function subscribeTodoDeadlines(todoId, onValue, onError) {
  return onSnapshot(query(deadlineCollection(todoId), orderBy('date', 'asc')), (snapshot) => onValue(snapshot.docs.map(mapSnapshot)), onError)
}

export async function listTodoUpdates(todoId) {
  return (await getDocs(query(updateCollection(todoId), orderBy('createdAt', 'desc')))).docs.map(mapSnapshot)
}

export async function listTodoDeadlines(todoId) {
  return (await getDocs(query(deadlineCollection(todoId), orderBy('date', 'asc')))).docs.map(mapSnapshot)
}

export async function createTodoDeadline(todo, values, actor) {
  const deadline = todoDeadlinePayload(values)
  const todoRef = doc(db, TODOS_COLLECTION, todo.id)
  const deadlineRef = doc(deadlineCollection(todo.id))
  await runTransaction(db, async (transaction) => {
    const [snapshot, currentActor] = await Promise.all([transaction.get(todoRef), freshTodoActor(transaction, actor)])
    if (!snapshot.exists()) throw todoConflict('Das To-do wurde inzwischen entfernt.')
    assertTodoEditable(snapshot.data(), currentActor)
    assertCurrentSnapshot(todo, snapshot.data(), ['audienceType', 'audienceId', 'audienceIds'], 'Der Beteiligtenkreis des To-dos')
    transaction.update(todoRef, { updatedAt: serverTimestamp() })
    transaction.set(deadlineRef, {
      ...deadline,
      createdAt: serverTimestamp(), createdBy: actor.user.uid, createdByName: actorName(currentActor),
      updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: actorName(currentActor),
    })
    transaction.set(doc(updateCollection(todo.id)), systemUpdate(`${actorName(currentActor)} hat ${deadline.type === 'appointment' ? 'einen Termin' : 'eine Frist'} für ${formatHistoryDate(deadline.date)} hinzugefügt.`, currentActor))
  })
  invalidateReminderStatuses()
}

export async function updateTodoDeadline(todo, deadline, values, actor) {
  const next = todoDeadlinePayload(values, deadline)
  const todoRef = doc(db, TODOS_COLLECTION, todo.id)
  const deadlineRef = doc(deadlineCollection(todo.id), deadline.id)
  const changed = await runTransaction(db, async (transaction) => {
    const [snapshot, currentDeadline, currentActor] = await Promise.all([transaction.get(todoRef), transaction.get(deadlineRef), freshTodoActor(transaction, actor)])
    if (!snapshot.exists()) throw todoConflict('Das To-do wurde inzwischen entfernt.')
    assertTodoEditable(snapshot.data(), currentActor)
    assertCurrentSnapshot(todo, snapshot.data(), ['audienceType', 'audienceId', 'audienceIds'], 'Der Beteiligtenkreis des To-dos')
    if (!currentDeadline.exists()) throw todoConflict('Der Termin wurde inzwischen entfernt. Bitte die aktuellen Angaben prüfen.')
    assertCurrentSnapshot(deadline, currentDeadline.data(), Object.keys(next), 'Der Termin')
    const unchanged = Object.entries(next).every(([field, value]) => sameStoredValue(value, currentDeadline.data()[field] ?? (Array.isArray(value) ? [] : null)))
    if (unchanged) return false
    transaction.update(todoRef, { updatedAt: serverTimestamp() })
    transaction.update(deadlineRef, { ...next, updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: actorName(currentActor) })
    transaction.set(doc(updateCollection(todo.id)), systemUpdate(`${actorName(currentActor)} hat ${next.type === 'appointment' ? 'den Termin' : 'die Frist'} vom ${formatHistoryDate(next.date)} aktualisiert.`, currentActor))
    return true
  })
  if (changed) invalidateReminderStatuses()
  return changed
}

export async function deleteTodoDeadline(todo, deadline, actor) {
  const todoRef = doc(db, TODOS_COLLECTION, todo.id)
  const deadlineRef = doc(deadlineCollection(todo.id), deadline.id)
  await runTransaction(db, async (transaction) => {
    const [snapshot, currentDeadline, currentActor] = await Promise.all([transaction.get(todoRef), transaction.get(deadlineRef), freshTodoActor(transaction, actor)])
    if (!snapshot.exists()) throw todoConflict('Das To-do wurde inzwischen entfernt.')
    assertTodoEditable(snapshot.data(), currentActor)
    assertCurrentSnapshot(todo, snapshot.data(), ['audienceType', 'audienceId', 'audienceIds'], 'Der Beteiligtenkreis des To-dos')
    if (!currentDeadline.exists()) throw todoConflict('Der Termin wurde inzwischen entfernt. Bitte die aktuellen Angaben prüfen.')
    const fields = ['type', 'date', 'time', 'note', 'reminderEnabled', 'reminderOccurrence', 'reminderRecipientMode', 'reminderRecipientUserIds']
    assertCurrentSnapshot(deadline, currentDeadline.data(), fields, 'Der Termin')
    transaction.update(todoRef, { updatedAt: serverTimestamp() })
    transaction.delete(deadlineRef)
    transaction.set(doc(updateCollection(todo.id)), systemUpdate(`${actorName(currentActor)} hat ${deadline.type === 'appointment' ? 'den Termin' : 'die Frist'} vom ${formatHistoryDate(deadline.date)} gelöscht.`, currentActor))
  })
  invalidateReminderStatuses()
}

export async function listTodosForActor(actor) {
  const uid = actor.user.uid
  if (actor.profile?.role === 'superadmin') return sortTodos(await queryTodos())
  const audienceQueries = [
    queryTodos(where('audienceType', '==', 'all'), where('status', 'in', activePoolStatuses)),
    queryTodos(where('audienceType', '==', 'person'), where('audienceId', '==', uid), where('status', 'in', activePoolStatuses)),
    queryTodos(where('audienceType', '==', 'people'), where('audienceIds', 'array-contains', uid), where('status', 'in', activePoolStatuses)),
    queryTodos(where('creatorUserId', '==', uid)),
  ]
  const department = actor.profile?.department?.trim()
  if (department) audienceQueries.push(queryTodos(where('audienceType', '==', 'department'), where('audienceId', '==', department), where('status', 'in', activePoolStatuses)))
  const results = await Promise.all(audienceQueries)
  return sortTodos([...new Map(results.flat().map((todo) => [todo.id, todo])).values()])
}

export async function createTodo(values, actor, usersById) {
  const todoRef = doc(todosRef)
  const batch = writeBatch(db)
  batch.set(todoRef, {
    ...todoFields(values),
    creatorUserId: actor.user.uid, creatorName: actorName(actor), ...audienceValues(values, usersById, actor),
    assignedUserId: null, assignedUserName: null, assignedAt: null,
    status: 'open', completedAt: null, completedByUserId: null, completedByName: null, withdrawnAt: null, withdrawnByUserId: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  batch.set(doc(updateCollection(todoRef.id)), systemUpdate(`${actorName(actor)} hat die Aufgabe erstellt.`, actor))
  try { await batch.commit() } catch (error) { reportCaseFailure('todos', 'save', error); throw error }
  invalidateReminderStatuses()
  return todoRef.id
}

export async function addTodoNote(todoId, text, actor) {
  const note = trim(text)
  if (!note) throw new Error('Bitte einen Hinweis eingeben.')
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTransaction(db, async (transaction) => {
    const [snapshot, currentActor] = await Promise.all([transaction.get(todoRef), freshTodoActor(transaction, actor)])
    if (!snapshot.exists()) throw todoConflict('Das To-do wurde inzwischen entfernt.')
    if (!canReadTodoForUser(snapshot.data(), actor.user.uid, currentActor.profile)) throw todoAccessError('Keine Berechtigung für diese Notiz.')
    transaction.update(todoRef, { updatedAt: serverTimestamp() })
    transaction.set(doc(updateCollection(todoId)), { text: note, type: 'note', createdByUserId: actor.user.uid, createdByName: actorName(currentActor), createdAt: serverTimestamp() })
  })
  invalidateReminderStatuses()
}

export async function completeTodoForCurrentUser(todoId, actor) {
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTodoStatusTransaction(todoRef, actor, ['open', 'in_progress'], async (transaction) => {
    const [snapshot, currentActor] = await Promise.all([transaction.get(todoRef), freshTodoActor(transaction, actor)])
    if (!snapshot.exists()) throw new Error('To-do nicht gefunden.')
    const todo = snapshot.data()
    assertTodoEditable(todo, currentActor)
    transaction.update(todoRef, { status: 'completed', completedAt: serverTimestamp(), completedByUserId: actor.user.uid, completedByName: actorName(currentActor), updatedAt: serverTimestamp() })
    transaction.set(doc(updateCollection(todoId)), systemUpdate(`${actorName(currentActor)} hat die Aufgabe erledigt.`, currentActor))
  })
  invalidateReminderStatuses()
}

export async function reactivateTodoForCurrentUser(todoId, actor) {
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTodoStatusTransaction(todoRef, actor, ['completed'], async (transaction) => {
    const [snapshot, currentActor] = await Promise.all([transaction.get(todoRef), freshTodoActor(transaction, actor)])
    if (!snapshot.exists()) throw new Error('To-do nicht gefunden.')
    const todo = snapshot.data()
    if (!canCollaborateTodo(todo, currentActor)) throw todoAccessError('Keine Berechtigung, dieses To-do erneut zu öffnen.')
    if (todo.status !== 'completed') throw todoConflict('Das To-do ist nicht mehr erledigt. Bitte die aktuellen Angaben prüfen.')
    transaction.update(todoRef, { status: 'open', completedAt: null, completedByUserId: null, completedByName: null, updatedAt: serverTimestamp() })
    transaction.set(doc(updateCollection(todoId)), systemUpdate(`${actorName(currentActor)} hat die Aufgabe wieder geöffnet.`, currentActor))
  })
  invalidateReminderStatuses()
}

function formatHistoryDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  return match ? `${match[3]}.${match[2]}.${match[1]}` : 'nicht festgelegt'
}

function formatHistoryValue(value, fallback = 'nicht festgelegt') {
  const formatted = trim(value) || fallback
  return `„${formatted}“`
}

function changedFieldMessages(todo, fields, resetAssignment) {
  const messages = []
  const changed = (label, previous, next, previousFallback, nextFallback) => messages.push(`hat ${label} von ${formatHistoryValue(previous, previousFallback)} zu ${formatHistoryValue(next, nextFallback)} geändert.`)
  if (todo.title !== fields.title) changed('den Titel', todo.title, fields.title)
  // Beschreibungstexte bleiben bewusst ohne alten und neuen Inhalt in der Historie.
  if (todo.description !== fields.description) messages.push('hat die Beschreibung geändert.')
  if (todo.priority !== fields.priority) changed('die Wichtigkeit', TODO_PRIORITY[todoPriority(todo)], TODO_PRIORITY[priorityValue(fields.priority)])
  if ((todo.dueDate || null) !== fields.dueDate) changed('die Fälligkeit', formatHistoryDate(todo.dueDate), formatHistoryDate(fields.dueDate))
  if ((todo.reminderDate || null) !== fields.reminderDate || (todo.reminderTime || null) !== fields.reminderTime || (todo.reminderOccurrence || null) !== fields.reminderOccurrence) changed('die Erinnerung', [formatHistoryDate(todo.reminderDate), todo.reminderTime, todo.reminderOccurrence].filter(Boolean).join(' · '), [formatHistoryDate(fields.reminderDate), fields.reminderTime, fields.reminderOccurrence].filter(Boolean).join(' · '))
  if ((todo.customerId || null) !== fields.customerId) changed('den Kunden', todo.customerName, fields.customerName, 'kein Kunde', 'kein Kunde')
  if ((todo.carrierId || null) !== fields.carrierId) changed('den Unternehmer', todo.carrierName, fields.carrierName, 'kein Unternehmer', 'kein Unternehmer')
  const previousLinks = storedTransportOrderLinks(todo)
  const previousTransportOrderIds = previousLinks.map((link) => link.id)
  const nextTransportOrderIds = transportOrderLinks(fields.transportOrderLinks).map((link) => link.id)
  const transportOrderChanged = previousTransportOrderIds.join('|') !== nextTransportOrderIds.join('|')
  const addedTransportOrders = transportOrderLinks(fields.transportOrderLinks).filter((link) => !previousTransportOrderIds.includes(link.id))
  const removedTransportOrders = previousLinks.filter((link) => !nextTransportOrderIds.includes(link.id))
  if (addedTransportOrders.length) messages.push(`hat ${addedTransportOrders.map((link) => `TA ${link.number || link.id}`).join(', ')} verknüpft.`)
  if (removedTransportOrders.length) messages.push(`hat ${removedTransportOrders.map((link) => `TA ${link.number || link.id}`).join(', ')} entfernt.`)
  if ((todo.reference || null) !== fields.reference && !transportOrderChanged) changed('die TA-Nummer', todo.reference, fields.reference, 'keine TA-Nummer', 'keine TA-Nummer')
  if ((todo.damageCaseId || null) !== fields.damageCaseId) messages.push(fields.damageCaseId ? 'hat den Schadenfall verknüpft.' : 'hat die Schadenfall-Verknüpfung entfernt.')
  if ((todo.insolvencyId || null) !== fields.insolvencyId) messages.push(fields.insolvencyId ? 'hat den Insolvenzfall verknüpft.' : 'hat die Insolvenzfall-Verknüpfung entfernt.')
  if ((todo.legalDisputeId || null) !== fields.legalDisputeId) messages.push(fields.legalDisputeId ? 'hat den Gerichtsfall verknüpft.' : 'hat die Gerichtsfall-Verknüpfung entfernt.')
  if ((todo.inkassoCaseId || null) !== fields.inkassoCaseId) messages.push(fields.inkassoCaseId ? 'hat den Inkassofall verknüpft.' : 'hat die Inkassofall-Verknüpfung entfernt.')
  if (todo.audienceLabel !== fields.audienceLabel) changed('die Beteiligten', todo.audienceLabel, fields.audienceLabel)
  if (resetAssignment && todo.assignedUserName) messages.push('hat die bisherige Einzelzuweisung aufgehoben.')
  else if (resetAssignment && todo.audienceLabel === fields.audienceLabel) messages.push('hat die Beteiligten und Kalenderzuordnung aktualisiert.')
  return messages
}

export async function updateTodoByCreator(todo, values, usersById, resetAssignment, actor) {
  const audienceChanged = audienceHasChanged(todo, values, actor.user.uid)
  resetAssignment = audienceChanged
  const todoRef = doc(db, TODOS_COLLECTION, todo.id)
  try {
    // A query cannot be a Web SDK transaction read. Anchor its server result to
    // the parent revision: every deadline mutation also touches updatedAt.
    // This catches children created after the query as well as changed rows.
    const queryParent = audienceChanged ? await getDocFromServer(todoRef) : null
    if (queryParent && !queryParent.exists()) throw todoConflict('Das To-do wurde inzwischen entfernt.')
    const deadlines = audienceChanged ? (await getDocsFromServer(query(deadlineCollection(todo.id), orderBy('date', 'asc')))).docs : []
    await runTransaction(db, async (transaction) => {
      const [snapshot, currentActor, currentDeadlines] = await Promise.all([
        transaction.get(todoRef), freshTodoActor(transaction, actor),
        Promise.all(deadlines.map((deadline) => transaction.get(doc(deadlineCollection(todo.id), deadline.id)))),
      ])
      if (!snapshot.exists()) throw todoConflict('Das To-do wurde inzwischen entfernt.')
      const current = snapshot.data()
      assertTodoEditable(current, currentActor)
      if (queryParent) assertCurrentSnapshot(queryParent.data(), current, ['updatedAt'], 'Der Terminstand des To-dos')
      if (audienceChanged && !canManageTodoAudience(current, currentActor)) throw todoAccessError('Nur der Ersteller darf die Beteiligten ändern.')
      const audience = audienceChanged ? audienceValues(values, usersById, currentActor)
        : { audienceType: todo.audienceType, audienceId: todo.audienceId ?? null, audienceIds: todo.audienceIds ?? null, audienceLabel: todo.audienceLabel }
      const fields = { ...todoFields(values, todo), ...audience }
      assertCurrentSnapshot(todo, current, Object.keys(fields), 'Das To-do')
      const eligible = audienceChanged ? new Set(todoEligibleParticipants({ ...current, ...fields }, [...usersById.values()]).map((user) => user.id)) : null
      if (audienceChanged) {
        Object.assign(fields, { assignedUserId: null, assignedUserName: null, assignedAt: null, status: 'open' })
        fields.reminderRecipientUserIds = fields.reminderRecipientUserIds.filter((id) => eligible.has(id))
      }
      transaction.update(todoRef, { ...fields, updatedAt: serverTimestamp() })
      for (const deadline of currentDeadlines) {
        if (!deadline.exists() || deadline.data().reminderRecipientMode !== 'selected') continue
        const previousIds = deadline.data().reminderRecipientUserIds || []
        const ids = previousIds.filter((id) => eligible.has(id))
        if (ids.length === previousIds.length) continue
        transaction.update(deadline.ref, { reminderRecipientUserIds: ids, updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: actorName(currentActor) })
      }
      const messages = changedFieldMessages(current, fields, resetAssignment)
      ;(messages.length ? messages : ['hat die Aufgabe aktualisiert.']).forEach((message) => transaction.set(doc(updateCollection(todo.id)), systemUpdate(`${actorName(currentActor)} ${message}`, currentActor)))
    })
  } catch (error) { reportCaseFailure('todos', 'save', error); throw error }
  invalidateReminderStatuses()
}

export async function withdrawTodo(todoId, actor) {
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTransaction(db, async (transaction) => {
    const [snapshot, currentActor] = await Promise.all([transaction.get(todoRef), freshTodoActor(transaction, actor)])
    if (!snapshot.exists()) throw todoConflict('Das To-do wurde inzwischen entfernt.')
    assertTodoEditable(snapshot.data(), currentActor)
    if (!canManageTodoAudience(snapshot.data(), currentActor)) throw todoAccessError('Nur der Ersteller darf das To-do zurückziehen.')
    transaction.update(todoRef, { status: 'withdrawn', withdrawnAt: serverTimestamp(), withdrawnByUserId: actor.user.uid, assignedUserId: null, assignedUserName: null, assignedAt: null, updatedAt: serverTimestamp() })
    transaction.set(doc(updateCollection(todoId)), systemUpdate(`${actorName(currentActor)} hat die Aufgabe zurückgezogen.`, currentActor))
  })
  invalidateReminderStatuses()
}
