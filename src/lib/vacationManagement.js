import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase.js'

export function listManagedVacationRequests() {
  return httpsCallable(functions, 'listManagedVacationRequests')().then((result) => result.data.requests || [])
}

export function listManagedVacationData() {
  return httpsCallable(functions, 'listManagedVacationRequests')().then((result) => ({ requests: result.data.requests || [], employees: result.data.employees || [], holidays: result.data.holidays || [], blocks: result.data.blocks || [] }))
}

export function processVacationRequest(requestId, decision) {
  return httpsCallable(functions, 'processVacationRequest')({ requestId, decision }).then((result) => result.data)
}
