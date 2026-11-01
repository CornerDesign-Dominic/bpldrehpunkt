import { auth } from './firebase.js'
import { searchDycosTransportOrders } from './transportOrders.js'
import { appendDycosSearchPage } from './dycosBulkImport.js'

const runtimes = new Map()
export function getDycosSearchRuntime(uid) {
  if (runtimes.has(uid)) return runtimes.get(uid)
  const key = `drehpunkt:dycos-search:${uid}`
  let state = { orders: [], selected: [], query: null, cursor: 0, hasMore: false, searched: false, busy: false, error: '' }, stopped = false
  const listeners = new Set(), publish = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
  function persist() { localStorage.setItem(key, JSON.stringify({ ...state, busy: false, error: '' })) }
  const runtime = {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) }, snapshot: () => state,
    enter() {
      if (state.busy) return
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null')
        if (saved && Array.isArray(saved.orders) && saved.orders.length <= 5000 && Array.isArray(saved.selected) && saved.query) publish({ ...saved, busy: false, error: '' })
      } catch { publish({ error: 'Die gespeicherte Suche konnte nicht geladen werden. Bitte erneut suchen.' }) }
    },
    clear() { if (state.busy) return; localStorage.removeItem(key); publish({ orders: [], selected: [], query: null, cursor: 0, hasMore: false, searched: false, error: '' }) },
    select(selected) { try { publish({ selected }); persist() } catch { publish({ error: 'Die Auswahl konnte nicht gespeichert werden. Bitte den Browserspeicher prüfen.' }) } },
    pause() { stopped = true },
    async search(query, { more = false, all = false } = {}) {
      if (state.busy || auth.currentUser?.uid !== uid) return
      stopped = false
      publish({ busy: true, error: '', ...(more ? {} : { orders: [], selected: [], query, cursor: 0, hasMore: false, searched: false }) })
      try {
        persist()
        do {
          const response = await searchDycosTransportOrders({ ...state.query, nachId: state.cursor })
          if (auth.currentUser?.uid !== uid) break
          publish({ orders: appendDycosSearchPage(state.orders, response, state.cursor), cursor: response.nextCursor ?? state.cursor, hasMore: response.hasMore, searched: true })
          persist()
        } while (all && state.hasMore && !stopped)
        if (all && !state.hasMore && !stopped) { publish({ selected: state.orders.map(order => order.sourceId) }); persist() }
      } catch (error) { publish({ error: error?.code === 'functions/failed-precondition' ? 'Die Vorschau ist zu umfangreich. Bitte den Zeitraum verkleinern.' : error?.code === 'functions/permission-denied' ? 'Keine Berechtigung für Sammelimporte.' : error instanceof Error && !error.code ? error.message : 'Die Suche wurde unterbrochen. Bitte erneut versuchen.' }) }
      finally { publish({ busy: false }) }
    },
  }
  runtimes.set(uid, runtime)
  return runtime
}
