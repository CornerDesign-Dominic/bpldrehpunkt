import { httpsCallable } from 'firebase/functions'
import { functions, waitForAppCheckToken } from './firebase.js'

export async function liabilityCall(name, data) {
  await waitForAppCheckToken()
  const result = await httpsCallable(functions, name, { timeout: 180000 })(data)
  return result.data
}
