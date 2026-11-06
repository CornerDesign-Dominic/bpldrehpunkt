// Durable user actions always outrank an automatic recommendation. Discarded
// results stay neutral even though the action can be started again.
export function mailboxActionDisplayState(action, recommended = false) {
  if (action?.kind === 'invoice' && action.state === 'completed' && action.completion?.invoiceReviewed !== true) return 'review'
  if (action) return action.state === 'discarded' ? 'idle' : action.state || 'idle'
  return recommended ? 'recommended' : 'idle'
}
