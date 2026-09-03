import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'

export const TODOS_COLLECTION = 'todos'
export const TODO_STATUS = { open: 'Offen', in_progress: 'In Bearbeitung', completed: 'Erledigt', withdrawn: 'Zurückgezogen' }
const todosRef = collection(db, TODOS_COLLECTION)
const activePoolStatuses = ['open', 'in_progress', 'completed']
const trim = (value) => (value ?? '').trim()
const timestampValue = (value) => value?.toMillis?.() ?? 0
const mapSnapshot = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })

function actorName(actor) { return getUserDisplayName(actor.profile, actor.user) }
function updateCollection(todoId) { return collection(db, TODOS_COLLECTION, todoId, 'updates') }
function systemUpdate(text, actor) { return { text, type: 'system', createdByUserId: actor.user.uid, createdByName: actorName(actor), createdAt: serverTimestamp() } }
function uniqueIds(ids) { return [...new Set((ids || []).filter(Boolean))] }

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

export function createEmptyTodo() { return { title: '', description: '', dueDate: '', audienceType: 'self', audienceId: '', audienceIds: [] } }
export function isSelfTodo(todo, uid) { return todo.creatorUserId === uid && todo.audienceType === 'person' && todo.audienceId === uid }

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
    title: trim(values.title), description: trim(values.description), dueDate: values.dueDate || null,
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
  await setDoc(doc(updateCollection(todoId)), { text: note, type: 'note', createdByUserId: actor.user.uid, createdByName: actorName(actor), createdAt: serverTimestamp() })
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

export async function updateTodoByCreator(todoId, values, usersById, resetAssignment, actor) {
  const fields = { title: trim(values.title), description: trim(values.description), dueDate: values.dueDate || null, ...audienceValues(values, usersById, actor), updatedAt: serverTimestamp() }
  if (resetAssignment) Object.assign(fields, { assignedUserId: null, assignedUserName: null, assignedAt: null, status: 'open' })
  const batch = writeBatch(db)
  batch.update(doc(db, TODOS_COLLECTION, todoId), fields)
  batch.set(doc(updateCollection(todoId)), systemUpdate(resetAssignment ? `${actorName(actor)} hat die Aufgabe neu zugewiesen.` : `${actorName(actor)} hat die Aufgabe aktualisiert.`, actor))
  await batch.commit()
}

export async function withdrawTodo(todoId, actor) {
  const batch = writeBatch(db)
  batch.update(doc(db, TODOS_COLLECTION, todoId), { status: 'withdrawn', withdrawnAt: serverTimestamp(), withdrawnByUserId: actor.user.uid, assignedUserId: null, assignedUserName: null, assignedAt: null, updatedAt: serverTimestamp() })
  batch.set(doc(updateCollection(todoId)), systemUpdate(`${actorName(actor)} hat die Aufgabe zurückgezogen.`, actor))
  await batch.commit()
}
