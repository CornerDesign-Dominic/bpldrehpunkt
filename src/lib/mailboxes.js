import { httpsCallable } from 'firebase/functions'
import { functions, waitForAppCheckToken } from './firebase.js'
import { reportTechnicalFailure } from './diagnostics.js'

export async function mailboxCall(action, data = {}) {
  try {
    await waitForAppCheckToken()
    return (await httpsCallable(functions, action)(data)).data
  } catch (error) {
    if (!['functions/invalid-argument', 'functions/permission-denied', 'functions/failed-precondition'].includes(error?.code)) {
      const stage = ['beginMailboxConnection', 'finishMailboxConnection'].includes(action) ? 'connect' : action === 'getMailboxAttachment' ? 'attachment' : action.includes('Draft') ? 'draft' : action === 'updateMailboxName' ? 'rename' : action === 'sendMailboxReply' ? 'send' : action === 'disconnectMailbox' ? 'disconnect' : 'load'
      void reportTechnicalFailure({ module: 'mailboxes', stage, error })
    }
    throw error
  }
}
