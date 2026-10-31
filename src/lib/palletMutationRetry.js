// A content hash keeps booking notes out of storage keys. Only the random
// operation identity is retained in this browser tab, including after reload.
export function stablePalletMutationJson(value) {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
}
export function createPalletMutationRetrier({ send, userId, randomId, fingerprint, storage }) {
  const identities = new Map(), pending = new Map()
  const accessStorage = (operation, ...args) => { try { return storage()?.[operation](...args) } catch { return null } }
  return async (payload) => {
    const key = `drehpunkt:pallet-operation:${await fingerprint(stablePalletMutationJson([userId(), payload]))}`
    if (pending.has(key)) return pending.get(key)
    const stored = accessStorage('getItem', key)
    const operationId = identities.get(key) || (/^[a-zA-Z0-9-]{16,100}$/.test(stored || '') ? stored : randomId())
    identities.set(key, operationId); accessStorage('setItem', key, operationId)
    const operation = Promise.resolve().then(() => send({ ...payload, operationId }))
      .then((result) => { identities.delete(key); accessStorage('removeItem', key); return result })
      .catch((error) => {
        // A confirmed refusal had no effect. An uncertain response retains the
        // identity, so the same input can safely resolve the original operation.
        if (['invalid-argument', 'permission-denied', 'unauthenticated', 'failed-precondition', 'not-found', 'aborted', 'already-exists'].some((code) => error?.code === code || error?.code === `functions/${code}`)) {
          identities.delete(key); accessStorage('removeItem', key)
        }
        throw error
      }).finally(() => pending.delete(key))
    pending.set(key, operation)
    return operation
  }
}
