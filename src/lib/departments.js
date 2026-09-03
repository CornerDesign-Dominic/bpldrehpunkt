import { collection, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'

export const DEPARTMENTS_COLLECTION = 'departments'

export async function listDepartments() {
  const snapshot = await getDocs(collection(db, DEPARTMENTS_COLLECTION))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((left, right) => left.name.localeCompare(right.name, 'de'))
}

export function migrateLegacyDepartments() {
  return httpsCallable(functions, 'migrateLegacyDepartments')().then((result) => result.data)
}

export function createDepartment(name) {
  return httpsCallable(functions, 'createDepartment')({ name }).then((result) => result.data)
}

export function updateDepartment(id, values) {
  return httpsCallable(functions, 'updateDepartment')({ id, ...values }).then((result) => result.data)
}
