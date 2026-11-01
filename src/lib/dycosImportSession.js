export const importStorageKey = (uid, kind) => `drehpunkt:order-import:${uid}:${kind}`
export const importFinished = job => Boolean(job?.items?.length) && job.items.every(item => ['new', 'updated', 'unchanged'].includes(item.status))
export const importManifest = job => ({ action: 'start', runId: job.runId, kind: job.kind, items: job.items.map(({ taNummer, requestId, expectedSourceId }) => ({ taNummer, requestId, ...(expectedSourceId != null ? { expectedSourceId } : {}) })) })
export function createImportJob(items, uid, kind) {
  return { version: 2, uid, kind, runId: crypto.randomUUID(), createdAt: Date.now(), lastStartedAt: 0, items: items.map(item => ({ ...item, requestId: crypto.randomUUID(), status: 'pending' })) }
}
export function restoreImportJob(serialized, uid, kind) {
  if (!serialized) return null
  const job = JSON.parse(serialized)
  if (job.version !== 2 || job.uid !== uid || job.kind !== kind || !/^[a-zA-Z0-9_-]{16,80}$/.test(job.runId) || !Array.isArray(job.items) || !job.items.length || job.items.length > (kind === 'single' ? 1 : 5000)
    || job.items.some(item => !/^(0|[1-9]\d{0,9})$/.test(item.taNummer) || Number(item.taNummer) > 2147483647 || !/^[a-zA-Z0-9_-]{16,80}$/.test(item.requestId) || !['pending', 'running', 'failed', 'new', 'updated', 'unchanged'].includes(item.status)
      || kind === 'bulk' && (!Number.isInteger(item.expectedSourceId) || item.expectedSourceId < 0 || item.expectedSourceId > 2147483647))) throw new Error('Der gespeicherte Importfortschritt ist ungültig.')
  if (importFinished(job) && job.acknowledged) return null
  return { ...job, lastStartedAt: Number.isFinite(job.lastStartedAt) ? Math.min(Date.now(), job.lastStartedAt) : 0, items: job.items.map(item => ({ ...item, status: item.status === 'running' ? 'pending' : item.status })) }
}
export function resumeImportJob(detail, uid) {
  if (!detail.resume?.items) throw new Error('Dieser Vorgang kann nicht fortgesetzt werden.')
  const statuses = { Neu: 'new', Aktualisiert: 'updated', Unverändert: 'unchanged' }
  const rows = new Map(detail.rows.map(row => [row.id, row]))
  return { version: 2, uid, kind: detail.resume.kind, runId: detail.resume.runId, createdAt: Date.now(), lastStartedAt: 0,
    items: detail.resume.items.map(item => ({ ...item, status: statuses[rows.get(item.requestId)?.status] || 'pending', ...(rows.get(item.requestId)?.orderId ? { orderId: rows.get(item.requestId).orderId } : {}) })) }
}
export async function withImportTabLock(uid, action, locks = navigator.locks) {
  if (!locks?.request) throw Object.assign(new Error('Dieser Browser unterstützt die sichere Importausführung nicht. Bitte einen aktuellen Browser verwenden.'), { code: 'import-lock-unavailable' })
  return locks.request(`drehpunkt:order-import:${uid}`, { ifAvailable: true }, async lock => {
    if (!lock) throw Object.assign(new Error('In einem anderen Tab läuft bereits ein Import. Bitte diesen Tab verwenden.'), { code: 'import-tab-busy' })
    return action()
  })
}
