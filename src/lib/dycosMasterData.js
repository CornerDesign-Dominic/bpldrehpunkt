import { httpsCallable } from 'firebase/functions'
import { functions, waitForAppCheckToken } from './firebase.js'

export async function fetchDycosMasterData(data) {
  await waitForAppCheckToken()
  return (await httpsCallable(functions, 'fetchDycosMasterData', { timeout: 190000 })(data)).data
}

export async function refreshDycosMasterData(data) {
  await waitForAppCheckToken()
  return (await httpsCallable(functions, 'refreshDycosMasterData', { timeout: 190000 })(data)).data
}

export async function resolveDycosPartnerConflicts(data) {
  await waitForAppCheckToken()
  return (await httpsCallable(functions, 'resolveDycosPartnerConflicts')(data)).data
}

export { dycosMasterDataError } from './dycosMasterDataFeedback.js'
