import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'

export const TODOS_COLLECTION = 'todos'
export const TODO_STATUS = { open: 'Offen', in_progress: 'In Bearbeitung', completed: 'Erledigt', withdrawn: 'Zurückgezogen' }
export const TODO_PRIORITY = { low: 'Gering', medium: 'Mittel', high: 'Hoch' }
const todosRef = collection(db, TODOS_COLLECTION)
const activePoolStatuses = ['open', 'in_progress', 'completed']
const trim = (value) => (value ?? '').trim()
const timestampValue = (value) => value?.toMillis?.() ?? 0
const mapSnapshot = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })

function actorName(actor) { return getUserDisplayName(actor.profile, actor.user) }
function updateCollection(todoId) { return collection(db, TODOS_COLLECTION, todoId, 'updates') }
function systemUpdate(text, actor) { return { text, type: 'system', createdByUserId: actor.user.uid, createdByName: actorName(actor), createdAt: serverTimestamp() } }
function uniqueIds(ids) { return [...new Set((ids || []).filter(Boolean))] }
function optionalId(value) { return trim(value) || null }
function optionalName(value) { return trim(value) || null }
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

function todoFields(values) {
  return {
    title: trim(values.title),
    description: trim(values.description),
    dueDate: values.dueDate || null,
    reminderDate: values.reminderDate || null,
    priority: priorityValue(values.priority),
    customerId: optionalId(values.customerId),
    customerName: optionalName(values.customerName),
    carrierId: optionalId(values.carrierId),
    carrierName: optionalName(values.carrierName),
    reference: optionalName(values.reference),
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

export function createEmptyTodo() { return { title: '', description: '', dueDate: '', reminderDate: '', priority: 'medium', customerId: '', customerName: '', carrierId: '', carrierName: '', reference: '', audienceType: 'self', audienceId: '', audienceIds: [] } }
export function isSelfTodo(todo, uid) { return todo.creatorUserId === uid && todo.audienceType === 'person' && todo.audienceId === uid }
export function todoPriority(todo) { return priorityValue(todo.priority) }

export function todoDuePresentation(todo, now = new Date()) {
  if (!activeTodo(todo)) return { kind: 'none', label: todo.dueDate ? 'Keine aktive Frist' : 'Keine Fälligkeit', days: null }
  const days = dueDistance(todo, now)
  if (days === Number.MAX_SAFE_INTEGER) return { kind: 'none', label: 'Keine Fälligkeit', days: null }
  if (days < 0) return { kind: 'overdue', label: `${Math.abs(days)} ${Math.abs(days) === 1 ? 'Tag' : 'Tage'} überfällig`, days }
  if (days === 0) return { kind: 'today', label: 'Heute fällig', days }
  if (days <= 3) return { kind: 'soon', label: `Fällig in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`, days }
  return { kind: 'none', label: 'Fällig später', days }
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

export function isAudienceMember(todo, actor) {
  if (actor.profile?.role === 'superadmin') return true
  if (todo.audienceType === 'all') return true
  if (todo.audienceType === 'person') return todo.audienceId === actor.user.uid
  if (todo.audienceType === 'people') return (todo.audienceIds || []).includes(actor.user.uid)
  return todo.audienceType === 'department' && todo.audienceId === actor.profile?.department?.trim()
}

export async function getTodoById(todoId) {
  const snapshot = await getDoc(doc(db, TODOS_COLLECTION, todoId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function listTodoUpdates(todoId) {
  return (await getDocs(query(updateCollection(todoId), orderBy('createdAt', 'desc')))).docs.map(mapSnapshot)
}

export async function listTodosForActor(actor) {
  const uid = actor.user.uid
  if (actor.profile?.role === 'superadmin') return sortTodos(await queryTodos())
  const audienceQueries = [
    queryTodos(where('audienceType', '==', 'all'), where('status', 'in', activePoolStatuses)),
    queryTodos(where('audienceType', '==', 'person'), where('audienceId', '==', uid), where('status', 'in', activePoolStatuses)),
    queryTodos(where('audienceType', '==', 'people'), where('audienceIds', 'array-contains', uid), where('status', 'in', activePoolStatuses)),
    queryTodos(where('creatorUserId', '==', uid)),
    queryTodos(where('assignedUserId', '==', uid)),
  ]
  const department = actor.profile?.department?.trim()
  if (department) audienceQueries.push(queryTodos(where('audienceType', '==', 'department'), where('audienceId', '==', department), where('status', 'in', activePoolStatuses)))
  const results = await Promise.all(audienceQueries)
  return sortTodos([...new Map(results.flat().map((todo) => [todo.id, todo])).values()])
}

export async function createTodo(values, actor, usersById) {
  const todoRef = doc(todosRef)
  const isForSelf = values.audienceType === 'self'
  const batch = writeBatch(db)
  batch.set(todoRef, {
    ...todoFields(values),
    creatorUserId: actor.user.uid, creatorName: actorName(actor), ...audienceValues(values, usersById, actor),
    assignedUserId: isForSelf ? actor.user.uid : null, assignedUserName: isForSelf ? actorName(actor) : null, assignedAt: isForSelf ? serverTimestamp() : null,
    status: isForSelf ? 'in_progress' : 'open', completedAt: null, completedByUserId: null, completedByName: null, withdrawnAt: null, withdrawnByUserId: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  batch.set(doc(updateCollection(todoRef.id)), systemUpdate(`${actorName(actor)} hat die Aufgabe erstellt.`, actor))
  await batch.commit()
  return todoRef.id
}

export async function addTodoNote(todoId, text, actor) {
  const note = trim(text)
  if (!note) throw new Error('Bitte einen Hinweis eingeben.')
  const batch = writeBatch(db)
  batch.update(doc(db, TODOS_COLLECTION, todoId), { updatedAt: serverTimestamp() })
  batch.set(doc(updateCollection(todoId)), { text: note, type: 'note', createdByUserId: actor.user.uid, createdByName: actorName(actor), createdAt: serverTimestamp() })
  await batch.commit()
}

export async function assignTodoToCurrentUser(todoId, actor) {
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(todoRef)
    if (!snapshot.exists()) throw new Error('To-do nicht gefunden.')
    const todo = snapshot.data()
    if (todo.status !== 'open' || todo.assignedUserId) throw new Error('Dieses To-do wurde inzwischen bereits angenommen.')
    if (!isAudienceMember(todo, actor)) throw new Error('Dieses To-do ist nicht für Sie freigegeben.')
    transaction.update(todoRef, { assignedUserId: actor.user.uid, assignedUserName: actorName(actor), assignedAt: serverTimestamp(), status: 'in_progress', updatedAt: serverTimestamp() })
    transaction.set(doc(updateCollection(todoId)), systemUpdate(`${actorName(actor)} hat die Aufgabe angenommen.`, actor))
  })
}

export async function releaseTodoFromCurrentUser(todoId, actor) {
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(todoRef)
    if (!snapshot.exists()) throw new Error('To-do nicht gefunden.')
    const todo = snapshot.data()
    if (todo.status !== 'in_progress' || todo.assignedUserId !== actor.user.uid) throw new Error('Nur der aktuelle Bearbeiter kann freigeben.')
    transaction.update(todoRef, { assignedUserId: null, assignedUserName: null, assignedAt: null, status: 'open', updatedAt: serverTimestamp() })
    transaction.set(doc(updateCollection(todoId)), systemUpdate(`${actorName(actor)} hat die Aufgabe freigegeben.`, actor))
  })
}

export async function completeTodoForCurrentUser(todoId, actor) {
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(todoRef)
    if (!snapshot.exists()) throw new Error('To-do nicht gefunden.')
    const todo = snapshot.data()
    if (todo.status !== 'in_progress' || todo.assignedUserId !== actor.user.uid) throw new Error('Nur der aktuelle Bearbeiter kann erledigen.')
    transaction.update(todoRef, { status: 'completed', completedAt: serverTimestamp(), completedByUserId: actor.user.uid, completedByName: actorName(actor), updatedAt: serverTimestamp() })
    transaction.set(doc(updateCollection(todoId)), systemUpdate(`${actorName(actor)} hat die Aufgabe erledigt.`, actor))
  })
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
  if ((todo.reminderDate || null) !== fields.reminderDate) changed('die Erinnerung', formatHistoryDate(todo.reminderDate), formatHistoryDate(fields.reminderDate))
  if ((todo.customerId || null) !== fields.customerId) changed('den Kunden', todo.customerName, fields.customerName, 'kein Kunde', 'kein Kunde')
  if ((todo.carrierId || null) !== fields.carrierId) changed('den Unternehmer', todo.carrierName, fields.carrierName, 'kein Unternehmer', 'kein Unternehmer')
  if ((todo.reference || null) !== fields.reference) changed('die Referenz', todo.reference, fields.reference, 'keine Referenz', 'keine Referenz')
  if (todo.audienceLabel !== fields.audienceLabel) changed('die Zuständigkeit', todo.audienceLabel, fields.audienceLabel)
  if (resetAssignment && todo.assignedUserName) changed('den Bearbeiter', todo.assignedUserName, null, 'nicht übernommen', 'nicht übernommen')
  else if (resetAssignment && todo.audienceLabel === fields.audienceLabel) messages.push('hat die Aufgabe zur erneuten Übernahme freigegeben.')
  return messages
}

export async function updateTodoByCreator(todo, values, usersById, resetAssignment, actor) {
  const fields = { ...todoFields(values), ...audienceValues(values, usersById, actor), updatedAt: serverTimestamp() }
  if (resetAssignment) Object.assign(fields, { assignedUserId: null, assignedUserName: null, assignedAt: null, status: 'open' })
  const batch = writeBatch(db)
  batch.update(doc(db, TODOS_COLLECTION, todo.id), fields)
  const messages = changedFieldMessages(todo, fields, resetAssignment)
  ;(messages.length ? messages : ['hat die Aufgabe aktualisiert.']).forEach((message) => batch.set(doc(updateCollection(todo.id)), systemUpdate(`${actorName(actor)} ${message}`, actor)))
  await batch.commit()
}

export async function withdrawTodo(todoId, actor) {
  const batch = writeBatch(db)
  batch.update(doc(db, TODOS_COLLECTION, todoId), { status: 'withdrawn', withdrawnAt: serverTimestamp(), withdrawnByUserId: actor.user.uid, assignedUserId: null, assignedUserName: null, assignedAt: null, updatedAt: serverTimestamp() })
  batch.set(doc(updateCollection(todoId)), systemUpdate(`${actorName(actor)} hat die Aufgabe zurückgezogen.`, actor))
  await batch.commit()
}
