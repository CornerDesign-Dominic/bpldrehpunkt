import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { canView } from '../lib/permissions.js'
import { mailboxCall } from '../lib/mailboxes.js'
import { MailboxConnectionsContext } from './mailboxConnectionsContext.js'
import { resetMailboxDraftOwner } from '../lib/mailboxDraftCache.js'
import { resetMailboxActionOwner } from './useMailboxAction.js'

const pendingConnections = new Map()

export default function MailboxConnectionsProvider({ children }) {
  const { user, profile } = useAuth()
  const uid = user?.uid || ''
  const enabled = Boolean(uid && profile?.active === true && canView(profile, 'mailboxes'))
  const [state, setState] = useState({ ownerId: '', items: [], loading: false, error: null })
  const generation = useRef(0)
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const ticket = params.get('connection') === 'pending' ? params.get('ticket') : null

  const refresh = useCallback(async () => {
    if (!enabled) return
    const current = ++generation.current
    setState(previous => ({ ownerId: uid, items: previous.ownerId === uid ? previous.items : [], loading: true, error: null }))
    try {
      const result = await mailboxCall('listMailboxConnections')
      if (!Array.isArray(result?.connections)) throw new Error('Invalid mailbox list')
      if (current === generation.current) setState({ ownerId: uid, items: result.connections, loading: false, error: null })
    } catch (error) {
      if (current === generation.current) setState(previous => ({ ...previous, loading: false, error }))
    }
  }, [enabled, uid])

  useEffect(() => {
    resetMailboxDraftOwner(uid)
    resetMailboxActionOwner(uid)
    const requests = generation
    const timer = setTimeout(() => { void refresh() }, 0)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { clearTimeout(timer); ++requests.current; window.removeEventListener('focus', onFocus) }
  }, [refresh, uid])

  useEffect(() => {
    if (!enabled || !ticket) return
    let active = true
    const proofKey = `drehpunkt.mailboxes.proof.${uid}`
    const key = `${uid}:${ticket}`
    if (!pendingConnections.has(key)) {
      const finish = async () => {
        const proof = sessionStorage.getItem(proofKey)
        if (!proof) throw new Error('Missing connection proof')
        await mailboxCall('finishMailboxConnection', { ticket, proof })
        sessionStorage.removeItem(proofKey)
      }
      if (pendingConnections.size > 20) pendingConnections.delete(pendingConnections.keys().next().value)
      pendingConnections.set(key, finish())
    }
    pendingConnections.get(key).then(() => {
      if (active) { void refresh(); navigate('/profil?connection=success#postfaecher', { replace: true }) }
    }).catch(() => {
      if (active) navigate('/profil?connection=error#postfaecher', { replace: true })
    })
    return () => { active = false }
  }, [enabled, ticket, uid, refresh, navigate])

  const rename = useCallback(async (connectionId, customName) => {
    const result = await mailboxCall('updateMailboxName', { connectionId, customName })
    // Invalidate older list responses so they cannot replace the new name.
    ++generation.current
    setState(previous => previous.ownerId === uid ? { ...previous, loading: false, items: previous.items.map(item => item.id === connectionId ? { ...item, customName: result.customName } : item) } : previous)
  }, [uid])

  const disconnect = useCallback(async connectionId => {
    try { await mailboxCall('disconnectMailbox', { connectionId }) } finally { await refresh() }
  }, [refresh])

  const value = useMemo(() => ({
    connections: enabled && state.ownerId === uid ? state.items : [],
    loading: enabled && (state.ownerId !== uid || state.loading),
    error: enabled && state.ownerId === uid ? state.error : null,
    refresh, rename, disconnect,
  }), [enabled, uid, state, refresh, rename, disconnect])
  return <MailboxConnectionsContext.Provider value={value}>{children}</MailboxConnectionsContext.Provider>
}
