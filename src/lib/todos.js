import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

export const TODOS_COLLECTION = 'todos'

// This prepared identity is replaced by Firebase Auth later. No access control is enforced yet.
export const DEMO_CURRENT_USER = {
  id: 'demo-max-mustermann',
  name: 'Max Mustermann',
  departmentIds: ['accounting', 'dispatch-express', 'dispatch-transport', 'all'],
}

export const TODO_USERS = [
  DEMO_CURRENT_USER,
  { id: 'demo-lena-schneider', name: 'Lena Schneider', departmentIds: ['accounting'] },
  { id: 'demo-emre-kaya', name: 'Emre Kaya', departmentIds: ['dispatch-express', 'dispatch-transport'] },
]

export const TODO_DEPARTMENTS = [
  { value: 'accounting', label: 'Buchhaltung' },
  { value: 'dispatch-express', label: 'Dispo Express' },
  { value: 'dispatch-transport', label: 'Dispo Transport' },
  { value: 'all', label: 'Alle' },
]

export const TODO_STATUS = {
  open: 'Offen',
  completed: 'Erledigt',
}

const todosRef = collection(db, TODOS_COLLECTION)
const trim = (value) => (value ?? '').trim()
const timestampValue = (value) => value?.toMillis?.() ?? 0

function mapSnapshot(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

function todoPayload(values) {
  const isPersonal = values.recipientType === 'personal'
  return {
    title: trim(values.title),
    description: trim(values.description),
    creatorUserId: DEMO_CURRENT_USER.id,
    creatorName: DEMO_CURRENT_USER.name,
    recipientType: values.recipientType,
    recipientUserId: isPersonal ? values.recipientUserId : null,
    recipientDepartment: isPersonal ? null : values.recipientDepartment,
    assignedUserId: null,
    assignedUserName: null,
    status: 'open',
    dueDate: values.dueDate || null,
    completedAt: null,
    completedByUserId: null,
    completedByName: null,
  }
}

export function createEmptyTodo() {
  return { title: '', description: '', dueDate: '', recipientType: 'personal', recipientUserId: DEMO_CURRENT_USER.id, recipientDepartment: TODO_DEPARTMENTS[0].value }
}

export function getTodoDepartmentLabel(value) {
  return TODO_DEPARTMENTS.find((item) => item.value === value)?.label || '—'
}

export function getTodoUserLabel(userId) {
  return TODO_USERS.find((user) => user.id === userId)?.name || '—'
}

export function isCurrentUserEligible(todo) {
  if (todo.recipientType === 'personal') return todo.recipientUserId === DEMO_CURRENT_USER.id
  return DEMO_CURRENT_USER.departmentIds.includes(todo.recipientDepartment)
}

export async function listTodos() {
  const snapshot = await getDocs(todosRef)
  return snapshot.docs
    .map(mapSnapshot)
    .sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt))
}

export async function createTodo(values) {
  const todoRef = doc(todosRef)
  await setDoc(todoRef, {
    id: todoRef.id,
    ...todoPayload(values),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return todoRef.id
}

export async function assignTodoToCurrentUser(todoId) {
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(todoRef)
    if (!snapshot.exists()) throw new Error('To-do nicht gefunden')
    const todo = snapshot.data()
    if (todo.assignedUserId && todo.assignedUserId !== DEMO_CURRENT_USER.id) throw new Error('To-do bereits übernommen')
    transaction.update(todoRef, {
      assignedUserId: DEMO_CURRENT_USER.id,
      assignedUserName: DEMO_CURRENT_USER.name,
      updatedAt: serverTimestamp(),
    })
  })
}

export async function releaseTodoFromCurrentUser(todoId) {
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(todoRef)
    if (!snapshot.exists()) throw new Error('To-do nicht gefunden')
    if (snapshot.data().assignedUserId !== DEMO_CURRENT_USER.id) throw new Error('Nur der eigene Bearbeiter kann freigeben')
    transaction.update(todoRef, {
      assignedUserId: null,
      assignedUserName: null,
      updatedAt: serverTimestamp(),
    })
  })
}

export async function completeTodoForCurrentUser(todoId) {
  const todoRef = doc(db, TODOS_COLLECTION, todoId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(todoRef)
    if (!snapshot.exists()) throw new Error('To-do nicht gefunden')
    const todo = snapshot.data()
    if (!isCurrentUserEligible(todo)) throw new Error('To-do nicht für den aktuellen Benutzer freigegeben')
    transaction.update(todoRef, {
      status: 'completed',
      completedAt: serverTimestamp(),
      completedByUserId: DEMO_CURRENT_USER.id,
      completedByName: DEMO_CURRENT_USER.name,
      updatedAt: serverTimestamp(),
    })
  })
}

export async function updateTodo(todoId, fields) {
  await updateDoc(doc(db, TODOS_COLLECTION, todoId), { ...fields, updatedAt: serverTimestamp() })
}
