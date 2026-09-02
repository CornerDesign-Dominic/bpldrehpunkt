import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase.js'

export function createManagedUser(values) {
  return httpsCallable(functions, 'createManagedUser')(values).then((result) => result.data)
}

export function updateManagedUser(uid, values) {
  return httpsCallable(functions, 'updateManagedUser')({ uid, ...values }).then((result) => result.data)
}
