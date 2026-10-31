// Keep writes in order and retain failed settings for an explicit retry.
// A newer edit replaces queued intermediate edits, never an in-flight write.
export function createShipmentTrackingPreferenceSaver(save, initialPreferences) {
  let latest = initialPreferences
  let latestKey = JSON.stringify(latest)
  let savedKey = latestKey
  let status = 'saved'
  let active = null
  const listeners = new Set()

  function setStatus(next) {
    if (status === next) return
    status = next
    listeners.forEach((listener) => listener())
  }

  function update(preferences) {
    const key = JSON.stringify(preferences)
    if (key === latestKey) return
    latest = preferences
    latestKey = key
    setStatus(key === savedKey && !active ? 'saved' : 'pending')
  }

  function flush() {
    if (active) return active
    if (latestKey === savedKey) return Promise.resolve(true)
    setStatus('saving')
    active = Promise.resolve().then(async () => {
      while (latestKey !== savedKey) {
        const preferences = latest
        const key = latestKey
        try {
          await save(preferences)
          savedKey = key
        } catch {
          // A failed intermediate edit must not block saving a newer one.
          if (key !== latestKey) continue
          setStatus('error')
          return false
        }
      }
      setStatus('saved')
      return true
    }).finally(() => { active = null })
    return active
  }

  return {
    update,
    flush,
    getPreferences: () => latest,
    getStatus: () => status,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
}
