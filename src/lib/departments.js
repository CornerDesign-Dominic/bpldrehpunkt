import { collection, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'

export const DEPARTMENTS_COLLECTION = 'departments'

export async function listDepartments() {
  const snapshot = await getDocs(collection(db, DEPARTMENTS_COLLECTION))
  return snapshot.docs
    .map((item) => {
      const data = item.data()
      return { id: item.id, ...data, name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Unbenannte Abteilung', active: data.active !== false }
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name), 'de'))
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
