import { useEffect, useState } from 'react'
import { mailboxCall } from '../lib/mailboxes.js'

export function useMailboxRecommendations(connectionId, messageIds, reload) {
  const ids = messageIds.join('\n')
  const key = `${connectionId}|${ids}`
  const [state, setState] = useState({ key: '', items: {}, enabled: false })
  useEffect(() => {
    let active = true
    let running = false
    async function load() {
      if (running || document.visibilityState !== 'visible') return
      running = true
      try {
        const messages = ids ? ids.split('\n') : []
        const items = {}
        let enabled = false
        for (let offset = 0; offset < Math.max(messages.length, 1); offset += 100) {
          const result = await mailboxCall('listMailboxRecommendations', { connectionId, messageIds: messages.slice(offset, offset + 100) })
          Object.assign(items, result.recommendations)
          enabled = result.enabled === true
        }
        if (active) setState({ key, items, enabled })
      } catch { /* An unavailable recommendation never blocks the mailbox itself. */ }
      finally { running = false }
    }
    void load()
    const timer = setInterval(load, 60000)
    window.addEventListener('focus', load)
    window.addEventListener('drehpunkt:mail-recommendations-changed', load)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', load); window.removeEventListener('drehpunkt:mail-recommendations-changed', load) }
  }, [connectionId, ids, key, reload])
  return state.key === key ? { recommendations: state.items, enabled: state.enabled } : { recommendations: {}, enabled: false }
}
