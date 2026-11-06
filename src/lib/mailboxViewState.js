export const mailboxFolder = value => value === 'sentitems' ? 'sentitems' : 'inbox'
export function mailboxFolderParams(connectionId, folder, cached = {}) {
  const selected = mailboxFolder(folder)
  return { mailbox: connectionId, folder: selected, ...(cached?.message ? { message: cached.message, ...(selected === 'inbox' && cached.reply ? { reply: cached.reply } : {}) } : {}) }
}
export const nextMailboxFlag = status => status === 'flagged' ? 'complete' : status === 'complete' ? 'notFlagged' : 'flagged'
export function patchMailboxMessage(messages, messageId, patch) {
  return messages.map(message => message.id !== messageId ? message : { ...message, ...(typeof patch.isRead === 'boolean' ? { isRead: patch.isRead } : {}), ...(['notFlagged', 'flagged', 'complete'].includes(patch.flag?.flagStatus) ? { flag: patch.flag } : {}) })
}

export function createMailboxViewCache() {
  const values = new Map()
  return {
    read: key => values.get(key),
    write: (key, patch) => values.set(key, { ...values.get(key), ...patch }),
    clear: () => values.clear(),
    patchMessage: (connectionId, messageId, patch) => {
      for (const [key, snapshot] of values) if (key.startsWith(`${connectionId}:`) && snapshot.messages) values.set(key, { ...snapshot, messages: patchMailboxMessage(snapshot.messages, messageId, patch) })
    },
  }
}
