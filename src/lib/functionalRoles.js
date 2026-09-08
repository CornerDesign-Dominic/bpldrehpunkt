import { collection, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'

export const FUNCTIONAL_ROLES_COLLECTION = 'functionalRoles'

export async function listFunctionalRoles() {
  const snapshot = await getDocs(collection(db, FUNCTIONAL_ROLES_COLLECTION))
  return snapshot.docs
    .map((item) => {
      const data = item.data()
      return { id: item.id, ...data, name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Unbenannte Fachrolle', active: data.active !== false }
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name), 'de'))
}

export function createFunctionalRole(name) {
  return httpsCallable(functions, 'createFunctionalRole')({ name }).then((result) => result.data)
}

export function updateFunctionalRole(id, values) {
  return httpsCallable(functions, 'updateFunctionalRole')({ id, ...values }).then((result) => result.data)
}
