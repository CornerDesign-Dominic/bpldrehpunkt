import assert from 'node:assert/strict'
import test from 'node:test'
import { createMailboxViewCache, mailboxFolder, mailboxFolderParams, nextMailboxFlag, patchMailboxMessage } from './mailboxViewState.js'

test('folder restoration keeps inbox and sent selections and paging independent', () => {
  const cache = createMailboxViewCache()
  cache.write('a:inbox', { message: 'incoming', reply: 'reply', search: 'invoice', next: 'signed-inbox-page', scrollTop: 150 })
  cache.write('a:sentitems', { message: 'outgoing', search: 'recipient', next: 'signed-sent-page', scrollTop: 600 })
  cache.write('a:inbox', { scrollTop: 180 })
  assert.deepEqual(mailboxFolderParams('a', 'inbox', cache.read('a:inbox')), { mailbox: 'a', folder: 'inbox', message: 'incoming', reply: 'reply' })
  assert.deepEqual(mailboxFolderParams('a', 'sentitems', { ...cache.read('a:sentitems'), reply: 'must-not-leak' }), { mailbox: 'a', folder: 'sentitems', message: 'outgoing' })
  assert.equal(cache.read('a:sentitems').scrollTop, 600)
  assert.equal(cache.read('a:inbox').next, 'signed-inbox-page')
  assert.equal(cache.read('other:inbox'), undefined)
  assert.equal(mailboxFolder('arbitrary'), 'inbox')
})

test('flag cycle includes complete and remove while patches preserve unrelated metadata and messages', () => {
  assert.deepEqual(['notFlagged','flagged','complete'].map(nextMailboxFlag), ['flagged','complete','notFlagged'])
  const original = [{ id: 'one', isRead: false, flag: { flagStatus: 'flagged', dueDateTime: { dateTime: '2026-11-05' } } }, { id: 'two', isRead: false }]
  const marked = patchMailboxMessage(original, 'one', { isRead: true, subject: 'must-not-change' })
  assert.equal(marked[0].isRead, true)
  assert.deepEqual(marked[0].flag, original[0].flag)
  assert.equal(marked[0].subject, undefined)
  assert.equal(marked[1], original[1])
  const unmarked = patchMailboxMessage(marked, 'one', { isRead: false, flag: { flagStatus: 'invalid' } })
  assert.equal(unmarked[0].isRead, false)
  assert.deepEqual(unmarked[0].flag, original[0].flag)
  assert.equal(original[0].isRead, false)
})

test('confirmed state reaches cached inactive folders without leaking between connections', () => {
  const cache = createMailboxViewCache()
  cache.write('a:inbox', { messages: [{ id: 'sent-reply', isRead: false }] })
  cache.write('a:sentitems', { messages: [{ id: 'sent-reply', isRead: false }], search: 'recipient', scrollTop: 50 })
  cache.write('b:sentitems', { messages: [{ id: 'sent-reply', isRead: false }] })
  cache.patchMessage('a', 'sent-reply', { isRead: true, flag: { flagStatus: 'complete' } })
  assert.equal(cache.read('a:sentitems').messages[0].flag.flagStatus, 'complete')
  assert.equal(cache.read('a:inbox').messages[0].isRead, true)
  assert.equal(cache.read('b:sentitems').messages[0].isRead, false)
  assert.equal(cache.read('a:sentitems').scrollTop, 50)
  cache.clear()
  assert.equal(cache.read('a:sentitems'), undefined)
})
