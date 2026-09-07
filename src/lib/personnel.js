import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase.js'

export function listPersonnelEmployees() {
  return httpsCallable(functions, 'listPersonnelEmployees')().then((result) => result.data?.employees || [])
}

export function getPersonnelEmployee(userId) {
  return httpsCallable(functions, 'getPersonnelEmployee')({ userId }).then((result) => result.data?.employee || null)
}

export function updatePersonnelEmployee(userId, values) {
  return httpsCallable(functions, 'updatePersonnelEmployee')({ userId, ...values }).then((result) => result.data)
}

export function listPersonnelVacations(userId) {
  return httpsCallable(functions, 'listPersonnelVacations')(userId ? { userId } : {}).then((result) => result.data?.vacations || [])
}

export function updatePersonnelVacationMeta(vacationId, values) {
  return httpsCallable(functions, 'updatePersonnelVacationMeta')({ vacationId, ...values }).then((result) => result.data)
}
