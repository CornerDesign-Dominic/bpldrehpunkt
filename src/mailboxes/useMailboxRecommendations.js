import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { mailboxCall } from '../lib/mailboxes.js'

export function useMailboxRecommendations(connectionId, messageIds, reload) {
  const ids = messageIds.join('\n'), key = `${connectionId}|${ids}`
  const [state, setState] = useState({ key: '', items: {}, decisions: {}, decisionStates: {}, enabled: false })
  const [loadErrorKey, setLoadErrorKey] = useState('')
  const [signal, setSignal] = useState({ connectionId: '', revision: null })
  useEffect(() => {
    if (!connectionId) return
    let initialized = false, previous = null
    return onSnapshot(doc(db, 'mailboxRecommendationSignals', connectionId), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return
      const revision = snapshot.data()?.revision || null
      if (!initialized) { initialized = true; previous = revision; return }
      if (revision === previous) return
      previous = revision
      setSignal({ connectionId, revision })
    }, () => { /* No polling fallback: missing hints are explicitly acceptable. */ })
  }, [connectionId])
  useEffect(() => {
    if (!connectionId) return
    let active = true
    async function load() {
      try {
        const messages = ids ? ids.split('\n') : [], items = {}, decisions = {}, decisionStates = {}
        let enabled = false
        for (let offset = 0; offset < Math.max(messages.length, 1); offset += 100) {
          const result = await mailboxCall('listMailboxRecommendations', { connectionId, messageIds: messages.slice(offset, offset + 100) })
          Object.assign(items, result.recommendations); Object.assign(decisions, result.decisions || {}); Object.assign(decisionStates, result.decisionStates || {}); enabled = result.enabled === true
        }
        if (active) { setState({ key, items, decisions, decisionStates, enabled }); setLoadErrorKey('') }
      } catch { if (active) setLoadErrorKey(key) /* Manual actions remain available. */ }
    }
    void load()
    window.addEventListener('drehpunkt:mail-recommendations-changed', load)
    return () => { active = false; window.removeEventListener('drehpunkt:mail-recommendations-changed', load) }
  }, [connectionId, ids, key, reload, signal.connectionId, signal.revision])
  return { ...(state.key === key ? { recommendations: state.items, decisions: state.decisions, decisionStates: state.decisionStates, enabled: state.enabled } : { recommendations: {}, decisions: {}, decisionStates: {}, enabled: false }), loadError: loadErrorKey === key, revision: signal.connectionId === connectionId ? signal.revision : null }
}
