import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { mailboxCall } from '../lib/mailboxes.js'
import { createMailboxActionStore, mailboxActionKey } from '../lib/mailboxActionStore.js'

let owner = '', currentStore = createMailboxActionStore(mailboxCall)
export function resetMailboxActionOwner(uid = '') {
  if (owner === uid) return
  currentStore.dispose()
  currentStore = createMailboxActionStore(mailboxCall)
  owner = uid
}
function ownerStore(uid) {
  resetMailboxActionOwner(uid)
  return currentStore
}

export function useMailboxAction(identity, kind) {
  const { user } = useAuth()
  const uid = user?.uid || ''
  const store = ownerStore(uid)
  const { connectionId, messageId } = identity
  const stableIdentity = useMemo(() => ({ connectionId, messageId }), [connectionId, messageId])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    if (!uid || !connectionId || !messageId) return
    return store.watch({ ...stableIdentity, kind })
  }, [store, uid, connectionId, messageId, stableIdentity, kind])
  const start = useCallback(data => store.start(stableIdentity, kind, data), [store, stableIdentity, kind])
  const discard = useCallback(() => store.discard(stableIdentity, kind), [store, stableIdentity, kind])
  const complete = useCallback(proof => store.complete(stableIdentity, kind, proof), [store, stableIdentity, kind])
  const refresh = useCallback(() => store.refreshAction(stableIdentity, kind), [store, stableIdentity, kind])
  const action = snapshot[mailboxActionKey(stableIdentity, kind)] || store.getAction(stableIdentity, kind)
  const state = action.state === 'discarded' ? 'idle' : action.state
  const error = useMemo(() => action.error ? { ...action.error, message: action.error.message, code: action.error.code?.startsWith('functions/') ? action.error.code : `functions/${action.error.code || 'unknown'}` } : null, [action.error])
  const loadingResult = ['review', 'completed'].includes(state) && !action.result && !error
  return { ...action, error, state, loadingResult, busy: state === 'running' || Boolean(action.pending) || loadingResult, start, discard, complete, refresh }
}

export function useMailboxActionList(connectionId, messageIds) {
  const { user } = useAuth()
  const uid = user?.uid || ''
  const store = ownerStore(uid)
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const signature = JSON.stringify(messageIds)
  useEffect(() => {
    if (!uid || !connectionId) return
    const stop = store.watch({ connectionId, messageIds: JSON.parse(signature) })
    const onFocus = () => { void store.refresh(connectionId) }
    window.addEventListener('focus', onFocus)
    return () => { stop(); window.removeEventListener('focus', onFocus) }
  }, [store, uid, connectionId, signature])
  return snapshot
}
