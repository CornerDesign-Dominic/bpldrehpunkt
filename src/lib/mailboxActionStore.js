export const mailboxActionKinds = ['order', 'tracking', 'terms', 'invoice']
const empty = Object.freeze({ state: 'idle', result: null, error: null })
export const mailboxActionKey = (identity, kind) => JSON.stringify([identity.connectionId, identity.messageId, kind])
const revision = action => action.updatedAtMillis ?? action.updatedAt ?? 0

// One shared owner-scoped store keeps background jobs independent of whichever
// message happens to be mounted. The server owns all durable transitions.
export function createMailboxActionStore(call, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let snapshot = Object.freeze({})
  let disposed = false
  let clock = 0
  const listeners = new Set(), scopes = new Map(), polling = new Map(), requests = new Map(), mutations = new Map(), hydrated = new Map()
  const publish = (key, value) => {
    if (disposed) return
    snapshot = Object.freeze({ ...snapshot, [key]: value })
    listeners.forEach(listener => listener())
  }
  const apply = (action, metadata = false) => {
    if (!action || disposed) return
    const key = mailboxActionKey(action, action.kind), previous = snapshot[key]
    if (previous && previous.jobId === action.jobId && revision(previous) > revision(action) && !previous.local) return
    const same = previous?.jobId === action.jobId && previous?.state === action.state && revision(previous) === revision(action)
    const value = { ...action, result: metadata ? same ? previous?.result || null : null : action.result || null, error: action.error || null }
    if (!metadata) hydrated.set(key, `${action.jobId}:${revision(action)}:${action.state}`)
    if (same && metadata && !previous.local) return
    publish(key, value)
  }
  const targets = connectionId => {
    const ids = new Set(), details = new Map()
    for (const scope of scopes.values()) if (scope.connectionId === connectionId) {
      scope.messageIds.forEach(id => ids.add(id))
      if (scope.kind) details.set(mailboxActionKey(scope, scope.kind), scope)
    }
    return { ids: [...ids], details }
  }
  const hydrate = async (key, scope) => {
    const current = snapshot[key]
    if (!current || !['review', 'completed'].includes(current.state)) return
    const version = `${current.jobId}:${revision(current)}:${current.state}`
    const requestKey = `get:${key}:${version}`
    if (hydrated.get(key) === version || requests.has(requestKey)) return
    const started = clock
    const task = (async () => {
      try {
        const { action } = await call('getMailboxAction', { connectionId: scope.connectionId, messageId: scope.messageId, kind: scope.kind, jobId: current.jobId })
        if ((mutations.get(key) || 0) <= started && snapshot[key]?.jobId === current.jobId) apply(action)
      } catch (error) {
        // Keep the durable color while making a failed result retrieval retryable.
        if (!disposed && snapshot[key]?.jobId === current.jobId) publish(key, { ...snapshot[key], error })
      } finally { requests.delete(requestKey) }
    })()
    requests.set(requestKey, task)
    await task
  }
  const schedule = connectionId => {
    if (disposed) return
    const previous = polling.get(connectionId)
    if (previous) clearTimer(previous)
    const { ids } = targets(connectionId)
    if (!ids.length) { polling.delete(connectionId); return }
    const running = Object.values(snapshot).some(action => action.connectionId === connectionId && action.state === 'running')
    polling.set(connectionId, setTimer(() => { void refresh(connectionId) }, running ? 4000 : 25000))
  }
  async function refresh(connectionId) {
    if (disposed) return
    const requestKey = `list:${connectionId}`
    if (requests.has(requestKey)) return requests.get(requestKey)
    const { ids } = targets(connectionId)
    if (!ids.length) return
    const started = clock
    const task = (async () => {
      try {
        // Bound requests even after paging through a large inbox.
        for (let offset = 0; offset < ids.length; offset += 100) {
          const { actions } = await call('listMailboxActions', { connectionId, messageIds: ids.slice(offset, offset + 100) })
          for (const action of actions || []) {
            const key = mailboxActionKey(action, action.kind)
            if ((mutations.get(key) || 0) <= started) apply(action, true)
          }
        }
        await Promise.all([...targets(connectionId).details].map(([key, scope]) => hydrate(key, scope)))
      } catch {
        // Transient polling failure never erases an already known job/result.
      } finally {
        requests.delete(requestKey)
        const currentIds = targets(connectionId).ids
        if (!disposed && currentIds.some(id => !ids.includes(id))) void refresh(connectionId)
        else schedule(connectionId)
      }
    })()
    requests.set(requestKey, task)
    return task
  }
  async function mutate(identity, kind, operation, data = {}) {
    if (disposed) throw new Error('Mailbox action owner changed')
    const key = mailboxActionKey(identity, kind), current = snapshot[key] || empty
    if (current.pending || operation === 'start' && current.state === 'running') return current
    const version = ++clock
    mutations.set(key, version)
    publish(key, { ...current, ...identity, kind, state: operation === 'start' ? 'running' : current.state, error: null, pending: true, local: true })
    try {
      const { action } = await call(operation === 'start' ? 'startMailboxAction' : 'updateMailboxAction', {
        ...identity, kind, ...(operation === 'start' ? data : { action: operation, jobId: current.jobId, proof: data }),
      })
      if (!disposed && mutations.get(key) === version) apply(action)
      schedule(identity.connectionId)
      return action
    } catch (error) {
      if (!disposed && mutations.get(key) === version) {
        publish(key, { ...current, ...identity, kind, state: operation === 'start' ? 'failed' : current.state, error, local: true })
        void refresh(identity.connectionId)
      }
      throw error
    }
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => snapshot,
    getAction: (identity, kind) => snapshot[mailboxActionKey(identity, kind)] || empty,
    watch(scope) {
      const token = Symbol('mailbox action scope')
      scopes.set(token, { ...scope, messageIds: scope.messageIds || [scope.messageId] })
      void refresh(scope.connectionId).then(() => {
        // A second scope can mount while the first list request is in flight.
        if (scope.kind) return hydrate(mailboxActionKey(scope, scope.kind), scope)
      })
      return () => { scopes.delete(token); schedule(scope.connectionId) }
    },
    refresh,
    refreshAction(identity, kind) {
      hydrated.delete(mailboxActionKey(identity, kind))
      return refresh(identity.connectionId)
    },
    start: (identity, kind, data) => mutate(identity, kind, 'start', data),
    discard: (identity, kind) => mutate(identity, kind, 'discard'),
    complete: (identity, kind, proof) => mutate(identity, kind, 'complete', proof),
    dispose() {
      disposed = true
      polling.forEach(clearTimer)
      polling.clear(); scopes.clear(); listeners.clear()
      snapshot = Object.freeze({})
    },
  }
}
