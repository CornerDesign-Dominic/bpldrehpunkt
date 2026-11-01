import { useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '../../auth/useAuth.js'
import { getDycosImportRuntime } from '../../lib/dycosImportRuntime.js'

export function useDycosImport(kind) {
  const { user } = useAuth(), uid = user?.uid || ''
  const runtime = getDycosImportRuntime(uid, kind)
  const state = useSyncExternalStore(runtime.subscribe, runtime.snapshot)
  useEffect(() => { runtime.enter() }, [runtime])
  useEffect(() => {
    const acknowledge = () => { if (document.visibilityState === 'visible') runtime.acknowledge() }
    acknowledge(); document.addEventListener('visibilitychange', acknowledge)
    return () => document.removeEventListener('visibilitychange', acknowledge)
  }, [runtime, state.job])
  return { ...state, runtime, uid }
}
