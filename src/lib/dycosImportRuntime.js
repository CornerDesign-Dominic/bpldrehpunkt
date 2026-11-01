import { auth } from './firebase.js'
import { fetchDycosTransportOrder, manageTransportOrderImport } from './transportOrders.js'
import { runDycosBulkImport } from './dycosBulkImport.js'
import { importFinished, importManifest, importStorageKey, restoreImportJob, withImportTabLock } from './dycosImportSession.js'
import { errorMessage } from './dycosOrderFetchFeedback.js'
import { reportTechnicalFailure } from './diagnostics.js'
import { getDycosSearchRuntime } from './dycosSearchRuntime.js'

const runtimes = new Map()
// The operation belongs to the tab, not a mounted React page. Navigating within
// that tab does not stop it; closing the tab retains request IDs for replay.
export function getDycosImportRuntime(uid, kind) {
  const key = importStorageKey(uid, kind)
  if (runtimes.has(key)) return runtimes.get(key)
  let state = { job: null, busy: false, error: '', waiting: false, blockingRun: null }, stopped = false, entering = false
  const listeners = new Set()
  const publish = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
  const persist = job => { localStorage.setItem(key, JSON.stringify(job)); publish({ job }) }
  const runtime = {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    snapshot: () => state,
    enter() {
      if (state.busy || entering) return
      entering = true
      try { const job = restoreImportJob(localStorage.getItem(key), uid, kind); if (!job) localStorage.removeItem(key); publish({ job, error: '' }) }
      catch { publish({ error: 'Der gespeicherte Importfortschritt konnte nicht geladen werden. Bitte den Vorgang über den Importverlauf öffnen.' }) }
      finally { entering = false }
    },
    acknowledge() { if (importFinished(state.job) && !state.job.acknowledged) { try { persist({ ...state.job, acknowledged: true }) } catch { publish({ error: 'Die Abschlussbestätigung konnte nicht gespeichert werden.' }) } } },
    pause() { stopped = true },
    async discard() {
      if (state.busy) return
      try { if (state.job) await manageTransportOrderImport({ action: 'discard', runId: state.job.runId }); localStorage.removeItem(key); publish({ job: null, error: '' }) }
      catch (error) { publish({ error: errorMessage(error) }) }
    },
    async run(job) {
      if (state.busy || !uid || auth.currentUser?.uid !== uid) return
      publish({ busy: true, error: '', blockingRun: null }); stopped = false
      const prevent = event => { event.preventDefault(); event.returnValue = '' }
      window.addEventListener('beforeunload', prevent)
      try {
        await withImportTabLock(uid, async () => {
          persist(job)
          await manageTransportOrderImport(importManifest(job))
          if (kind === 'bulk') getDycosSearchRuntime(uid).clear()
          const final = await runDycosBulkImport(job, { fetchOrder: fetchDycosTransportOrder, onChange: persist, shouldStop: () => stopped || auth.currentUser?.uid !== uid, onWaiting: waiting => publish({ waiting }) })
          persist(final)
        })
      } catch (error) {
        publish({ error: error?.code === 'functions/failed-precondition' && error?.details?.runId ? 'Es besteht bereits ein offener Import. Bitte diesen zuerst fortsetzen oder beenden.' : error instanceof Error && !String(error.code || '').startsWith('functions/') ? error.message : errorMessage(error), blockingRun: error?.details?.runId ? { id: error.details.runId, kind: error.details.kind } : null })
        if (!String(error?.code || '').startsWith('import-')) void reportTechnicalFailure({ module: 'website', stage: 'transport-orders', error, code: !error?.code ? 'internal' : undefined })
      } finally { window.removeEventListener('beforeunload', prevent); publish({ busy: false, waiting: false }) }
    },
  }
  runtimes.set(key, runtime)
  return runtime
}
