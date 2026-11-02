// Reply text remains in memory only. Preserve it across SPA navigation and
// keep unload protection active even when the composer is not mounted.
export const unsavedDrafts = new Map()
let guarded = false
let owner = null
function warn(event) {
  if (!unsavedDrafts.size) return
  event.preventDefault()
  event.returnValue = ''
}
export function syncDraftCacheGuard() {
  if (unsavedDrafts.size > 0 && !guarded) { window.addEventListener('beforeunload', warn); guarded = true }
  else if (!unsavedDrafts.size && guarded) { window.removeEventListener('beforeunload', warn); guarded = false }
}
export function resetMailboxDraftOwner(uid) {
  if (owner && owner !== uid) { unsavedDrafts.clear(); syncDraftCacheGuard() }
  owner = uid || null
}
export function clearMailboxDraftCache(uid, connectionId) {
  for (const key of unsavedDrafts.keys()) if (key.startsWith(`${uid}:${connectionId}:`)) unsavedDrafts.delete(key)
  syncDraftCacheGuard()
}
