// A preview never starts business work until its matching request is confirmed.
export function createMailboxTriageGate(changed = () => {}) {
  let current = null, sequence = 0, disposed = false
  function cancel(id = current?.id) {
    if (!current || current.id !== id || current.running) return
    const pending = current
    current = null
    pending.resolve({ cancelled: true })
    if (!disposed) changed(null)
  }
  return {
    request(kind, execute, metadata = {}) {
      if (disposed) return Promise.resolve({ cancelled: true })
      if (current?.kind === kind) return current.promise
      if (current?.running) return Promise.resolve({ cancelled: true })
      cancel()
      let resolve, reject
      const promise = new Promise((done, fail) => { resolve = done; reject = fail })
      current = { id: ++sequence, kind, execute, metadata, resolve, reject, promise, running: false }
      changed({ id: current.id, kind, metadata, running: false })
      return promise
    },
    async confirm(id) {
      if (disposed || !current || current.id !== id || current.running) return
      const pending = current
      pending.running = true
      changed({ id, kind: pending.kind, metadata: pending.metadata, running: true })
      try { pending.resolve(await pending.execute()) }
      catch (error) { pending.reject(error) }
      finally {
        if (current === pending) current = null
        if (!disposed) changed(null)
      }
    },
    cancel,
    dispose() {
      disposed = true
      if (current && !current.running) cancel()
    },
  }
}
