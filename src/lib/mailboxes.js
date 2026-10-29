import { httpsCallable } from 'firebase/functions'
import { functions, waitForAppCheckToken } from './firebase.js'
import { reportTechnicalFailure } from './diagnostics.js'

export async function mailboxCall(action, data = {}) {
  try {
    await waitForAppCheckToken()
    return (await httpsCallable(functions, action, action === 'previewMailboxOrder' ? { timeout: 300000 } : action === 'previewMailboxTracking' ? { timeout: 240000 } : action === 'exportMailboxOrder' ? { timeout: 120000 } : {})(data)).data
  } catch (error) {
    if (!['functions/invalid-argument', 'functions/permission-denied', 'functions/failed-precondition'].includes(error?.code)) {
      const stage = action === 'previewMailboxOrder' ? 'order-preview' : action === 'exportMailboxOrder' ? 'order-export' : action === 'previewMailboxTracking' ? 'tracking-preview' : action === 'applyMailboxTracking' ? 'tracking-apply' : ['beginMailboxConnection', 'finishMailboxConnection'].includes(action) ? 'connect' : action === 'getMailboxAttachment' ? 'attachment' : action.includes('Draft') ? 'draft' : action === 'updateMailboxName' ? 'rename' : action === 'sendMailboxReply' ? 'send' : action === 'disconnectMailbox' ? 'disconnect' : 'load'
      void reportTechnicalFailure({ module: 'mailboxes', stage, error })
    }
    throw error
  }
}
