import { createHash, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'

export const statusMailIngestToken = defineSecret('STATUS_MAIL_INGEST_TOKEN')
export const statusMailboxAddress = defineSecret('STATUS_MAILBOX_ADDRESS')

function text(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength ? value.trim() : ''
}

export function transportOrderNumberFromSubject(subject) {
  const matches = [...subject.matchAll(/\b(?:TA|Transportauftrag)(?:\s*[- ]?\s*(?:Nr\.?|Nummer))?\s*[:#-]?\s*(\d{9})\b/gi)]
  const numbers = [...new Set(matches.map((match) => match[1]))]
  return numbers.length === 1 ? numbers[0] : null
}

export function validateStatusMail(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const mailbox = text(payload.mailbox, 254).toLowerCase()
  const messageId = text(payload.messageId, 500)
  const subject = text(payload.subject, 998)
  const sender = text(payload.sender, 254)
  const bodyText = text(payload.bodyText, 150000)
  const receivedAt = text(payload.receivedAt, 40)
  const date = new Date(receivedAt)
  if (!mailbox || !messageId || !subject || !sender || !receivedAt || !/^\d{4}-\d\d-\d\dT/.test(receivedAt) || Number.isNaN(date.getTime())) return null
  return { mailbox, messageId, subject, sender, bodyText, receivedAt: date }
}

function authorized(header, secret) {
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token || !secret) return false
  const left = Buffer.from(token)
  const right = Buffer.from(secret)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function ingestStatusMailHandler(request, response, { db = getFirestore(), secret = statusMailIngestToken.value(), allowedMailbox = statusMailboxAddress.value() } = {}) {
  if (request.method !== 'POST') { response.set('Allow', 'POST').status(405).json({ error: 'method_not_allowed' }); return }
  if (!authorized(request.headers.authorization, secret)) { response.status(401).json({ error: 'unauthorized' }); return }
  if (!request.is('application/json') || (request.rawBody?.byteLength ?? 0) > 200000) { response.status(415).json({ error: 'invalid_content_type_or_size' }); return }
  const mail = validateStatusMail(request.body)
  if (!mail || !allowedMailbox || mail.mailbox !== allowedMailbox.toLowerCase().trim()) { response.status(400).json({ error: 'invalid_mail' }); return }
  const orderNumber = transportOrderNumberFromSubject(mail.subject)
  if (!orderNumber) { response.status(200).json({ outcome: 'unmatched' }); return }
  const orders = await db.collection('transportOrders').where('externalNumber', '==', orderNumber).limit(2).get()
  if (orders.size !== 1) { logger.info('Status-Mail ohne eindeutigen Auftrag', { orderNumber, matches: orders.size }); response.status(200).json({ outcome: 'unmatched' }); return }
  const orderId = orders.docs[0].id
  const id = createHash('sha256').update(`${mail.mailbox}\n${mail.messageId}`).digest('hex')
  const mailRef = db.doc(`transportOrders/${orderId}/receivedMails/${id}`)
  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(mailRef)
    if (existing.exists) return 'duplicate'
    transaction.create(mailRef, {
      source: 'powerAutomate', mailbox: mail.mailbox, messageId: mail.messageId,
      transportOrderId: orderId, transportOrderNumber: orderNumber,
      subject: mail.subject, sender: mail.sender, bodyText: mail.bodyText,
      receivedAt: mail.receivedAt, createdAt: FieldValue.serverTimestamp(),
    })
    return 'stored'
  })
  response.status(200).json({ outcome: result, transportOrderId: orderId })
}
