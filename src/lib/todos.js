import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'

export const TODOS_COLLECTION = 'todos'
export const TODO_STATUS = {
  open: 'Offen',
  in_progress: 'In Bearbeitung',
  completed: 'Erledigt',
  withdrawn: 'Zurückgezogen',
}

const todosRef = collection(db, TODOS_COLLECTION)
const activePoolStatuses = ['open', 'in_progress', 'completed']
const trim = (value) => (value ?? '').trim()
const timestampValue = (value) => value?.toMillis?.() ?? 0
const mapSnapshot = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })

function actorName(actor) {
  return getUserDisplayName(actor.profile, actor.user)
}

function audienceValues(values, usersById) {
  if (values.audienceType === 'all') return { audienceType: 'all', audienceId: null, audienceLabel: 'Alle' }
  if (values.audienceType === 'department') {
    const department = trim(values.audienceId)
    return { audienceType: 'department', audienceId: department, audienceLabel: department }
  }
  const target = usersById.get(values.audienceId)
  if (!target) throw new Error('Die ausgewählte Person ist nicht mehr aktiv.')
  return { audienceType: 'person', audienceId: target.id, audienceLabel: getUserDisplayName(target, target) }
}

function sortTodos(todos) {
  return [...todos].sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt))
}

async function queryTodos(...constraints) {
  const snapshot = await getDocs(query(todosRef, ...constraints))
  return snapshot.docs.map(mapSnapshot)
}

export function createEmptyTodo() {
  return { title: '', description: '', dueDate: '', audienceType: 'all', audienceId: '' }
}

export function isAudienceMember(todo, actor) {
  if (actor.profile?.role === 'superadmin') return true
  if (todo.audienceType === 'all') return true
  if (todo.audienceType === 'person') return todo.audienceId === actor.user.uid
  return todo.audienceType === 'department' && todo.audienceId === actor.profile?.department?.trim()
}

export async function listTodosForActor(actor) {
  const uid = actor.user.uid
  if (actor.profile?.role === 'superadmin') return sortTodos(await queryTodos())

  const audienceQueries = [
    queryTodos(where('audienceType', '==', 'all'), where('status', 'in', activePoolStatuses)),
    queryTodos(where('audienceType', '==', 'person'), where('audienceId', '==', uid), where('status', 'in', activePoolStatuses)),
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
  await setDoc(todoRef, {
    title: trim(values.title),
    description: trim(values.description),
    dueDate: values.dueDate || null,
    creatorUserId: actor.user.uid,
    creatorName: actorName(actor),
    ...audienceValues(values, usersById),
    assignedUserId: null,
    assignedUserName: null,
    assignedAt: null,
    status: 'open',
    completedAt: null,
    completedByUserId: null,
    completedByName: null,
    withdrawnAt: null,
    withdrawnByUserId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return todoRef.id
}

export async function assignTodoToCurrentUser(todoId, actor) {
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(todoRef)
    if (!snapshot.exists()) throw new Error('To-do nicht gefunden.')
    const todo = snapshot.data()
    if (todo.status !== 'open' || todo.assignedUserId) throw new Error('Dieses To-do wurde inzwischen bereits übernommen.')
    if (!isAudienceMember(todo, actor)) throw new Error('Dieses To-do ist nicht für Sie freigegeben.')
    transaction.update(todoRef, {
      assignedUserId: actor.user.uid,
      assignedUserName: actorName(actor),
      assignedAt: serverTimestamp(),
      status: 'in_progress',
      updatedAt: serverTimestamp(),
    })
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
  })
}

export async function completeTodoForCurrentUser(todoId, actor) {
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(todoRef)
    if (!snapshot.exists()) throw new Error('To-do nicht gefunden.')
    const todo = snapshot.data()
    if (todo.status !== 'in_progress' || todo.assignedUserId !== actor.user.uid) throw new Error('Nur der aktuelle Bearbeiter kann erledigen.')
    transaction.update(todoRef, {
      status: 'completed',
      completedAt: serverTimestamp(),
      completedByUserId: actor.user.uid,
      completedByName: actorName(actor),
      updatedAt: serverTimestamp(),
    })
  })
}

export async function updateTodoByCreator(todoId, values, usersById, resetAssignment) {
  const audience = audienceValues(values, usersById)
  const fields = {
    title: trim(values.title),
    description: trim(values.description),
    dueDate: values.dueDate || null,
    ...audience,
    updatedAt: serverTimestamp(),
  }
  if (resetAssignment) Object.assign(fields, { assignedUserId: null, assignedUserName: null, assignedAt: null, status: 'open' })
  await updateDoc(doc(db, TODOS_COLLECTION, todoId), fields)
}

export async function withdrawTodo(todoId, actor) {
  await updateDoc(doc(db, TODOS_COLLECTION, todoId), {
    status: 'withdrawn',
    withdrawnAt: serverTimestamp(),
    withdrawnByUserId: actor.user.uid,
    assignedUserId: null,
    assignedUserName: null,
    assignedAt: null,
    updatedAt: serverTimestamp(),
  })
}
