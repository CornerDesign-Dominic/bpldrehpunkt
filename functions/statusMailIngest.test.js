import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { ingestStatusMailHandler, transportOrderNumberFromSubject, validateStatusMail } from './statusMailIngest.js'

const payload = {
  mailbox: 'status@example.com', messageId: '<unique@example.com>',
  subject: 'Re: Transportauftrag 260900123 – Status', sender: 'fahrer@example.com',
  bodyText: 'Ankunft voraussichtlich 14:30 Uhr', receivedAt: '2026-09-30T10:00:00Z',
}

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this }, set() { return this } }
}

function request(body = payload, authorization = 'Bearer secure-token') {
  return { method: 'POST', headers: { authorization }, is: () => true, rawBody: Buffer.from(JSON.stringify(body)), body }
}

test('reads only an unambiguous TA number from the subject', () => {
  assert.equal(transportOrderNumberFromSubject('AW: TA-Nr. 260900123'), '260900123')
  assert.equal(transportOrderNumberFromSubject('Re: Transportauftrag 260900123'), '260900123')
  assert.equal(transportOrderNumberFromSubject('260900123'), '260900123')
  assert.equal(transportOrderNumberFromSubject('WG: 260900123'), '260900123')
  assert.equal(transportOrderNumberFromSubject('[EXTERN] AW: WG: 260900123'), '260900123')
  assert.equal(transportOrderNumberFromSubject('TA 260900123 und TA 260900124'), null)
  assert.equal(transportOrderNumberFromSubject('Referenz 260900123'), null)
})

test('validates the mail contract', () => {
  assert.equal(validateStatusMail(payload).receivedAt.toISOString(), '2026-09-30T10:00:00.000Z')
  assert.equal(validateStatusMail({ ...payload, receivedAt: 'morgen' }), null)
  assert.equal(validateStatusMail({ ...payload, messageId: '' }), null)
  const enriched = validateStatusMail({ ...payload, outlookMessageId: 'AAMk123', internetMessageId: '<unique@example.com>', conversationId: 'conv-1', replyTo: 'reply@example.com', toRecipients: 'status@example.com', ccRecipients: 'desk@example.com', sentAt: '2026-09-30T09:59:00Z' })
  assert.deepEqual(enriched.replyTo, ['reply@example.com'])
  assert.deepEqual(enriched.toRecipients, ['status@example.com'])
  assert.equal(enriched.sentAt.toISOString(), '2026-09-30T09:59:00.000Z')
})

test('stores a uniquely matched mail once and leaves unmatched mail untouched', async () => {
  const stored = new Map()
  let matchingOrders = [{ id: 'order-1' }]
  const db = {
    collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ size: matchingOrders.length, docs: matchingOrders }) }) }) }),
    doc: (path) => ({ path }),
    runTransaction: async (action) => action({
      get: async (ref) => ({ exists: stored.has(ref.path) }),
      create: (ref, data) => stored.set(ref.path, data),
    }),
  }
  const options = { db, secret: 'secure-token', allowedMailbox: 'status@example.com' }
  const first = response()
  await ingestStatusMailHandler(request(), first, options)
  assert.equal(first.body.outcome, 'stored')
  assert.equal(stored.size, 1)
  assert.equal([...stored.values()][0].transportOrderNumber, '260900123')
  const second = response()
  await ingestStatusMailHandler(request(), second, options)
  assert.equal(second.body.outcome, 'duplicate')
  assert.equal(stored.size, 1)
  matchingOrders = []
  const unmatched = response()
  await ingestStatusMailHandler(request({ ...payload, messageId: 'other' }), unmatched, options)
  assert.equal(unmatched.body.outcome, 'unmatched')
  assert.equal(stored.size, 1)
})

test('rejects calls without the secret or from another mailbox', async () => {
  const options = { db: {}, secret: 'secure-token', allowedMailbox: 'status@example.com' }
  const unauthorized = response()
  await ingestStatusMailHandler(request(payload, 'Bearer wrong'), unauthorized, options)
  assert.equal(unauthorized.statusCode, 401)
  const otherMailbox = response()
  await ingestStatusMailHandler(request({ ...payload, mailbox: 'other@example.com' }), otherMailbox, options)
  assert.equal(otherMailbox.statusCode, 400)
})
