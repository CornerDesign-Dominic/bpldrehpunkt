/** A read failure after acknowledgement must not turn a successful creation
 * into an apparent write failure and offer the same creation for a second time. */
export async function saveAndRefresh(save, refresh) {
  const result = await save()
  try { await refresh(); return { result, refreshError: null } }
  catch (refreshError) { return { result, refreshError } }
}
