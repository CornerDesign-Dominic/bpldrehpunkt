import { createHash } from 'node:crypto'
import { isManagedRecommendationMailbox } from './mailboxRecommendationPolicy.js'

export function managedActionScope(connection) {
  return isManagedRecommendationMailbox(connection) && connection.canonicalMailboxId && connection.tenantId
    ? createHash('sha256').update(`managed|${connection.tenantId}|${connection.canonicalMailboxId}`).digest('hex') : null
}

// Callers have already checked their active, owned mailbox connection and module rights.
// The persisted action, not any client-supplied mailbox or owner ID, grants result access.
export async function sharedActionResult({ db, context, value, kind, resultId, transaction }) {
  const scope = managedActionScope(context.connection)
  if (!scope || !value?.actionSlotPath || !value.actionJobId) return null
  if (!new RegExp(`^mailboxActionScopes/${scope}/actions/[a-f0-9]{64}$`).test(value.actionSlotPath)) return null
  const ref = db.doc(value.actionSlotPath)
  const action = (await (transaction ? transaction.get(ref) : ref.get())).data()
  const field = kind === 'terms' ? 'historyId' : 'previewId'
  return action?.kind === kind && action.sharedScopeId === scope && action.jobId === value.actionJobId
    && ['review', 'completed'].includes(action.state) && action.result?.[field] === resultId ? action : null
}
