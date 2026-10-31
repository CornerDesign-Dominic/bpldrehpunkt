import { httpsCallable } from 'firebase/functions'
import { auth, functions, waitForAppCheckToken } from './firebase.js'
import { reportTechnicalFailure } from './diagnostics.js'
import { reviveCallableFirestoreValues } from './firestoreCallableValues.js'
import { createPalletMutationRetrier } from './palletMutationRetry.js'

async function invoke(name, data, stage) {
  try { await waitForAppCheckToken(); return reviveCallableFirestoreValues((await httpsCallable(functions, name, { timeout: 120000 })(data)).data) }
  catch (error) { void reportTechnicalFailure({ module: 'pallets', stage, error }); throw error }
}
export function listPalletAccountSummaries() { return invoke('listPalletAccountSummaries', {}, 'load') }
export function listTransportOrderPalletMovements(orderId) { return invoke('listTransportOrderPalletMovements', { orderId }, 'load') }
const retryMutation = createPalletMutationRetrier({
  send: (payload) => invoke('savePalletRecord', payload, 'save'),
  userId: () => auth.currentUser?.uid || '',
  randomId: () => crypto.randomUUID(),
  fingerprint: async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
  storage: () => globalThis.sessionStorage,
})
export function mutatePalletRecord(kind, action, id, values, expectedRevision) {
  return retryMutation({ kind, action, id, ...(Number.isInteger(expectedRevision) ? { expectedRevision } : {}), ...(values ? { values } : {}) })
}
export function rebuildPalletSummaries(restart = false) { return invoke('rebuildPalletSummaries', { restart }, 'rebuild') }
