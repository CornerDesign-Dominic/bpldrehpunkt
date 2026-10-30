import { DYCOS_IMPORT_SPACING_MS } from '../../shared/dycosImportPolicy.js'
import { errorMessage } from './dycosOrderFetchFeedback.js'

const completed = new Set(['new', 'updated', 'unchanged'])
export const bulkImportComplete = job => Boolean(job?.items?.length) && job.items.every(item => completed.has(item.status))
export const bulkImportCounts = job => (job?.items || []).reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {})

export function appendDycosSearchPage(current, response, cursor) {
  if (!response || !Array.isArray(response.orders) || response.orders.length > 15 || typeof response.hasMore !== 'boolean'
    || response.hasMore && (!Number.isInteger(response.nextCursor) || response.nextCursor <= cursor)) throw new Error('Die Suchantwort ist unvollständig. Bitte erneut suchen.')
  const byNumber = new Map(current.map(order => [order.externalNumber, order]))
  for (const order of response.orders) {
    if (!Number.isInteger(order.sourceId) || order.sourceId <= cursor || !/^(0|[1-9]\d{0,9})$/.test(order.externalNumber)) throw new Error('Die Auftragszuordnung der Suchantwort ist ungültig.')
    const previous = byNumber.get(order.externalNumber)
    if (previous && previous.sourceId !== order.sourceId) throw new Error('Eine TA-Nummer ist mehreren Aufträgen zugeordnet. Bitte die Quelldaten prüfen.')
    byNumber.set(order.externalNumber, order)
  }
  if (byNumber.size > 5000) throw new Error('Die Suche umfasst mehr als 5.000 Aufträge. Bitte den Zeitraum oder die Relation eingrenzen.')
  return [...byNumber.values()]
}

export function createDycosBulkJob(orders, uid, uuid = () => crypto.randomUUID()) {
  if (!uid || !orders.length || orders.length > 5000) throw new Error('Bitte mindestens einen Auftrag auswählen.')
  return { version: 1, uid, createdAt: Date.now(), lastStartedAt: 0, items: orders.map(order => ({ taNummer: order.externalNumber, expectedSourceId: order.sourceId, requestId: uuid(), status: 'pending' })) }
}

export function readDycosBulkJob(storage, key, uid) {
  const job = JSON.parse(storage.getItem(key) || 'null')
  if (!job) return null
  if (job.version !== 1 || job.uid !== uid || !Array.isArray(job.items) || !job.items.length || job.items.length > 5000
    || job.items.some(item => !/^(0|[1-9]\d{0,9})$/.test(item.taNummer) || Number(item.taNummer) > 2147483647 || !Number.isInteger(item.expectedSourceId) || item.expectedSourceId < 0 || item.expectedSourceId > 2147483647
      || !/^[a-zA-Z0-9_-]{16,80}$/.test(item.requestId) || !['pending', 'running', 'failed', ...completed].includes(item.status))) throw new Error('Der gespeicherte Importfortschritt ist ungültig.')
  return { ...job, lastStartedAt: Number.isFinite(job.lastStartedAt) ? Math.min(job.lastStartedAt, Date.now()) : 0, items: job.items.map(item => ({ ...item, status: item.status === 'running' ? 'pending' : item.status })) }
}

export async function runDycosBulkImport(initial, { fetchOrder, onChange, shouldStop, onWaiting = () => {}, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let job = structuredClone(initial)
  const persist = () => onChange(structuredClone(job))
  const delay = async until => {
    while (now() < until) { if (shouldStop()) return false; await wait(Math.min(500, until - now())) }
    return !shouldStop()
  }
  for (const item of job.items) {
    if (item.status !== 'pending' || shouldStop()) continue
    if (!await delay(job.lastStartedAt + DYCOS_IMPORT_SPACING_MS)) break
    let retries = 0
    while (!shouldStop()) {
      item.status = 'running'; delete item.error; job.lastStartedAt = now(); await persist()
      try {
        const result = await fetchOrder({ taNummer: item.taNummer, requestId: item.requestId, expectedSourceId: item.expectedSourceId })
        if (!completed.has(result?.status) || result.externalNumber !== item.taNummer || String(result.sourceId) !== String(item.expectedSourceId)
          || result.requestId !== item.requestId || result.orderId !== `dycos-${item.taNummer}`) throw Object.assign(new Error('Invalid import response'), { code: 'functions/internal' })
        item.status = result.status; item.orderId = result.orderId; item.warningCodes = Array.isArray(result.warningCodes) ? result.warningCodes.slice(0, 50) : []
        await persist(); break
      } catch (error) {
        // The same request identity is retained even after an ambiguous timeout.
        if (completed.has(item.status)) throw error // Persistence failed after a confirmed save: stop before the next request.
        if (error?.code === 'functions/resource-exhausted' && retries++ < 2) {
          item.status = 'pending'; await persist(); onWaiting(true)
          const retryAfter = Number(error.details?.retryAfterMs)
          const proceed = await delay(now() + (Number.isFinite(retryAfter) ? Math.max(1000, Math.min(65000, retryAfter + 500)) : 65000))
          onWaiting(false)
          if (!proceed) break
          continue
        }
        item.status = 'failed'; item.error = errorMessage(error); await persist()
        if (['functions/unauthenticated', 'functions/permission-denied', 'functions/unavailable', 'functions/deadline-exceeded', 'functions/internal'].includes(error?.code)) return job
        break
      }
    }
  }
  return job
}
