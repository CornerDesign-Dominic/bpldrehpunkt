import { collection, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'

export const FUNCTIONAL_ROLES_COLLECTION = 'functionalRoles'

async function callFunctionalRoleFunction(name, data) {
  try {
    const result = await httpsCallable(functions, name)(data)
    return result.data
  } catch (error) {
    // A missing or temporarily unavailable callable endpoint is surfaced by
    // the Firebase SDK as the unhelpful "internal" error, often after the
    // browser has reported its missing CORS response headers.
    if (error?.code === 'functions/internal') {
      throw new Error('Der Fachrollen-Service ist derzeit nicht erreichbar. Bitte laden Sie die Seite neu. Besteht der Fehler weiter, wenden Sie sich an die Administration.', { cause: error })
    }
    throw error
  }
}

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
  return callFunctionalRoleFunction('createFunctionalRole', { name })
}

export function updateFunctionalRole(id, values) {
  return callFunctionalRoleFunction('updateFunctionalRole', { id, ...values })
}
