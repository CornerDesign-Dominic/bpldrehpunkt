// Coalesce the status requests of visible cards into bounded calls. Business
// sources remain authoritative; this cache never writes schedules or receipts.
export function createReminderStatusLoader({ send, now = Date.now, schedule = queueMicrotask, ttlMs = 15000, batchSize = 50, getScope = () => null, requireScope = false }) {
  const cache = new Map(), pending = new Map(), generations = new Map(), queue = []
  let scheduled = false, activeScope = getScope(), scopeVersion = 0
  const outstanding = new Set()
  const sessionChanged = () => Object.assign(new Error('Die Benutzersitzung hat sich geändert.'), { code: 'functions/aborted' })
  function resetSession() {
    activeScope = getScope(); scopeVersion += 1
    cache.clear(); pending.clear(); generations.clear(); queue.splice(0)
    for (const entry of outstanding) entry.reject(sessionChanged())
    outstanding.clear()
  }
  function synchronizeScope() {
    if (getScope() !== activeScope) resetSession()
  }
  const generation = (path) => generations.get(path) || 0
  function invalidate(paths) {
    synchronizeScope()
    const targets = paths ? new Set(paths) : new Set([...cache.keys(), ...pending.keys(), ...generations.keys()])
    for (const path of targets) { cache.delete(path); generations.set(path, generation(path) + 1) }
  }
  async function flush() {
    synchronizeScope()
    scheduled = false
    const entries = queue.splice(0)
    for (let start = 0; start < entries.length; start += batchSize) {
      synchronizeScope()
      const batch = entries.slice(start, start + batchSize).filter((entry) => entry.scopeVersion === scopeVersion)
      if (!batch.length) continue
      const paths = [...new Set(batch.map((entry) => entry.path))]
      try {
        const result = await send(paths)
        synchronizeScope()
        if (!Array.isArray(result?.statuses)) throw Object.assign(new Error('Erinnerungsstatus ist unvollständig.'), { code: 'diagnostic/invalid-response' })
        const values = new Map(result.statuses.map((value) => [value?.sourcePath, value]))
        for (const entry of batch) {
          if (entry.scopeVersion !== scopeVersion) { entry.reject(sessionChanged()); continue }
          const value = values.get(entry.path)
          if (!value || typeof value.status !== 'string') {
            entry.reject(Object.assign(new Error('Erinnerungsstatus fehlt.'), { code: 'diagnostic/invalid-response' }))
            continue
          }
          if (generation(entry.path) === entry.generation) cache.set(entry.path, { value, expires: now() + ttlMs })
          entry.resolve(value)
        }
      } catch (error) { synchronizeScope(); for (const entry of batch) entry.reject(entry.scopeVersion === scopeVersion ? error : sessionChanged()) }
      finally { for (const entry of batch) { outstanding.delete(entry); if (pending.get(entry.path)?.promise === entry.promise) pending.delete(entry.path) } }
    }
  }
  function get(path, { refresh = false } = {}) {
    synchronizeScope()
    if (requireScope && !activeScope) return Promise.reject(Object.assign(new Error('Anmeldung erforderlich.'), { code: 'functions/unauthenticated' }))
    if (typeof path !== 'string' || !path.trim()) return Promise.reject(new Error('Quelle der Erinnerung fehlt.'))
    if (refresh) invalidate([path])
    const saved = cache.get(path)
    if (saved && saved.expires > now()) return Promise.resolve(saved.value)
    const running = pending.get(path)
    if (running && running.generation === generation(path)) return running.promise
    const entry = { path, generation: generation(path), scopeVersion }
    entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject })
    pending.set(path, entry); queue.push(entry); outstanding.add(entry)
    if (!scheduled) { scheduled = true; schedule(() => { void flush() }) }
    return entry.promise
  }
  return { get, invalidate, resetSession, async list(paths, options) { return { statuses: await Promise.all([...new Set(paths)].map((path) => get(path, options))) } } }
}
