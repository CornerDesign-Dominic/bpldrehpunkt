import { httpsCallable } from 'firebase/functions'
import { functions, waitForAppCheckToken } from './firebase.js'

export { todoProjectionCalendars, mergeTodoCalendars } from './todoCalendarPresentation.js'

// Source-derived entries are read-only. No calendar documents or independent
// events are created, so assignment changes cannot leave an old calendar copy.
export async function listTodoCalendarProjection(range) {
  await waitForAppCheckToken()
  const result = (await httpsCallable(functions, 'listTodoCalendarProjection')(range)).data
  if (!Array.isArray(result?.calendars) || !Array.isArray(result?.entries)) {
    throw Object.assign(new Error('To-do-Kalenderdaten konnten nicht geladen werden.'), { code: 'diagnostic/invalid-response' })
  }
  return result
}
