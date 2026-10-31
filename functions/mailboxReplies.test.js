import test from 'node:test'
import assert from 'node:assert/strict'
import { associateMailboxReplies, listMailboxReplies } from './mailboxReplies.js'

const source = (id, internetMessageId) => ({ id, internetMessageId, receivedDateTime: '2026-10-31T08:00:00Z' })
const reply = (id, parent, date = '2026-10-31T09:00:00Z') => ({ id, internetMessageId: `<${id}>`, sentDateTime: date, internetMessageHeaders: [{ name: 'In-Reply-To', value: parent }] })

test('five replies get five separate sorted rows; a new incoming message starts independently', () => {
  const incoming = [source('old', '<old>'), source('new', '<new>')]
  const sent = Array.from({ length: 5 }, (_, index) => reply(`reply-${index}`, '<old>', `2026-10-31T09:0${index}:00Z`))
  const result = associateMailboxReplies(incoming, [...sent].reverse())
  assert.equal(result.old.length, 5)
  assert.deepEqual(result.new, [])
  assert.equal(result.old[0].id, 'reply-0')
  sent.push(reply('new-answer', '<new>'))
  assert.equal(associateMailboxReplies(incoming, sent).new[0].id, 'new-answer')
})

test('unknown new incoming reference never marks an older card; sent follow-ups resolve their actual ancestor', () => {
  const incoming = [source('old', '<old>')]
  const newer = reply('new-answer', '<new>')
  newer.internetMessageHeaders.push({ name: 'References', value: '<old> <new>' })
  assert.deepEqual(associateMailboxReplies(incoming, [newer]).old, [])
  const first = reply('first', '<old>')
  const followUp = reply('follow-up', '<first>')
  assert.equal(associateMailboxReplies(incoming, [followUp, first]).old.length, 2)
  const referencesOnly = { ...reply('references', ''), internetMessageHeaders: [{ name: 'REFERENCES', value: '<older> <old>' }] }
  assert.equal(associateMailboxReplies(incoming, [referencesOnly]).old.length, 1)
})

test('subjects, drafts, duplicate copies, receipts and cycles cannot produce false reply rows', () => {
  const incoming = [source('old', '<old>')]
  const valid = reply('sent', '<old>')
  const drafts = { ...reply('draft', '<old>'), isDraft: true }
  const receipt = reply('receipt', '<old>')
  receipt.internetMessageHeaders.push({ name: 'Content-Type', value: 'multipart/report; report-type=disposition-notification' })
  const result = associateMailboxReplies(incoming, [valid, { ...valid, id: 'duplicate-copy' }, drafts, receipt, reply('early', '<old>', '2026-10-31T07:00:00Z'), reply('loop-a', '<loop-b>'), reply('loop-b', '<loop-a>'), { ...reply('same-subject', ''), subject: 'RE: Same subject' }])
  assert.deepEqual(result.old, [{ id: 'sent', sentDateTime: valid.sentDateTime }])
})

test('lookup uses server source metadata, sent folder and separate header GETs; chunks stay within Graph limits', async () => {
  const batches = []
  const result = await listMailboxReplies({ ids: Array.from({ length: 25 }, (_, i) => String(i)), base: '/users/shared%40example.com', graph: async (path, options) => {
    assert.equal(path, '/$batch')
    const requests = JSON.parse(options.body).requests
    assert.ok(requests.length <= 20)
    batches.push(requests)
    return { responses: requests.map(request => ({ id: request.id, status: 200, body: request.url.includes('/mailFolders/sentitems/') ? { value: [{ id: 'sent' }] } : request.url.includes('internetMessageHeaders') ? reply('sent', '<original>') : { ...source(decodeURIComponent(request.url.split('/messages/')[1].split('?')[0]), '<original>'), conversationId: "conversation'quoted" } })) }
  } })
  assert.equal(result.partial, false)
  assert.ok(batches.flat().every(request => request.url.startsWith('/users/shared%40example.com/')))
  const listing = batches.flat().find(request => request.url.includes('/sentitems/'))
  assert.ok(decodeURIComponent(listing.url).includes("conversation''quoted"))
  assert.equal(Object.values(result.replies).flat().length, 1)
})

test('subrequest errors fail visibly, oversized input is rejected, and nextLink cannot escape the mailbox', async () => {
  await assert.rejects(listMailboxReplies({ ids: Array(31).fill('x') }), { code: 'invalid-argument' })
  await assert.rejects(listMailboxReplies({ ids: ['x'], base: '/me', graph: async () => ({ responses: [{ id: '0', status: 403 }] }) }), { code: 'permission-denied' })
  let calls = 0
  await assert.rejects(listMailboxReplies({ ids: ['x'], base: '/me', graph: async () => ({ responses: [{ id: '0', status: 200, body: ++calls === 1 ? { ...source('x', '<x>'), conversationId: 'c' } : { value: [], '@odata.nextLink': 'https://attacker.example/me/mailFolders/sentitems/messages' } }] }) }), { code: 'unavailable' })
})
