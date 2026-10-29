import { useContext } from 'react'
import { MailboxConnectionsContext } from './mailboxConnectionsContext.js'

export function useMailboxConnections() {
  const context = useContext(MailboxConnectionsContext)
  if (!context) throw new Error('MailboxConnectionsProvider fehlt.')
  return context
}
