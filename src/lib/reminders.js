import { httpsCallable } from 'firebase/functions'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, functions, waitForAppCheckToken } from './firebase.js'
import { reportTechnicalFailure } from './diagnostics.js'
import { assertReminderStatuses, assertReminderUsers, assertReminderResponsibility } from './reminderResponses.js'
import { createReminderStatusLoader } from './reminderStatusLoader.js'

const expectedCodes = new Set(['invalid-argument', 'failed-precondition', 'not-found', 'already-exists', 'permission-denied', 'unauthenticated', 'aborted', 'cancelled'])
async function invoke(name, data, stage, validate = (value) => value) {
  try { await waitForAppCheckToken(); return validate((await httpsCallable(functions, name)(data)).data) }
  catch (error) {
    if (!expectedCodes.has(String(error?.code || '').replace(/^functions\//, ''))) void reportTechnicalFailure({ module: 'reminders', stage, error })
    throw error
  }
}
const statusLoader = createReminderStatusLoader({ getScope: () => auth.currentUser?.uid || null, requireScope: true, send: (sourcePaths) => invoke('listReminderStatuses', { sourcePaths }, 'status', (value) => assertReminderStatuses(value, sourcePaths)) })
let statusUserId = auth.currentUser?.uid || null
const unsubscribeStatusAuth = onAuthStateChanged(auth, (user) => {
  const next = user?.uid || null
  if (next !== statusUserId) { statusUserId = next; statusLoader.resetSession() }
})
if (import.meta.hot) import.meta.hot.dispose(unsubscribeStatusAuth)
export function getReminderStatus(sourcePath, options) { return statusLoader.get(sourcePath, options) }
export function getReminderStatuses(sourcePaths, options) { return statusLoader.list(sourcePaths, options) }
export function invalidateReminderStatuses(sourcePaths) { statusLoader.invalidate(sourcePaths) }
export async function listCaseReminderUsers(parentPath) {
  const result = await invoke('listCaseReminderUsers', { parentPath }, 'responsibility', assertReminderUsers)
  return result.users
}
export async function setReminderResponsibility(parentPath, userId, expectedUserId = null) {
  const result = await invoke('setReminderResponsibility', { parentPath, userId: userId || null, expectedUserId: expectedUserId || null }, 'responsibility', assertReminderResponsibility)
  invalidateReminderStatuses()
  return result
}
