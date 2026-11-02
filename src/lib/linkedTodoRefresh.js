// A successful creation must never become a failed save merely because the
// following list refresh failed. Retrying that list must not create a second todo.
export function assertLinkedTodoCreationContext(values, caseField, caseId, isCurrent) {
  if (!isCurrent || !caseId || values?.[caseField] !== caseId) {
    throw Object.assign(new Error('Der zugehörige Fall wurde inzwischen gewechselt. Bitte das To-do im aktuellen Fall neu öffnen.'), { code: 'failed-precondition' })
  }
}

export async function createAndRefreshLinkedTodo(create, refresh) {
  const id = await create()
  try {
    await refresh()
    return { id, refreshError: null }
  } catch (refreshError) {
    return { id, refreshError }
  }
}
