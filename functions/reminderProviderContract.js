import { createHash } from 'node:crypto'
import { reminderMinuteState } from './shared/reminderTime.js'

export const reminderSenderAddress = 'drehpunkt@brennpunkt-logistik.de'
export const reminderProviderContractVersion = 1
export const reminderProviderTargets = Object.freeze({
  development: Object.freeze({ projectId: 'db-bpl-drehpunkt-dev' }),
  production: Object.freeze({ projectId: 'db-bpl-drehpunkt' }),
})
const identity = /^[a-f0-9]{64}$/
const email = /^[^<>(),;:\s@]+@[^<>(),;:\s@]+\.[^<>(),;:\s@]+$/
const content = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit

/** No credentials or network access. The digest identifies an accidental
 * payload change; it is not authentication. The endpoint remains a secret. */
export function buildReminderProviderRequest({ environment, recipient, deliveryId, dueAt, subject, message, messageHtml }) {
  const target = typeof environment === 'string' && Object.hasOwn(reminderProviderTargets, environment) ? reminderProviderTargets[environment] : null
  const instant = typeof dueAt === 'string' ? new Date(dueAt) : new Date(NaN)
  if (!target || typeof deliveryId !== 'string' || !identity.test(deliveryId) || typeof recipient !== 'string' || !email.test(recipient) || instant.getTime() % 60000 !== 0 || reminderMinuteState(dueAt, instant) !== 'due'
    || !content(subject, 1000) || /[\r\n]/.test(subject) || !content(message, 40000) || !content(messageHtml, 200000)) throw new TypeError('invalid-reminder-provider-contract')
  const request = {
    contractVersion: reminderProviderContractVersion,
    projectId: target.projectId,
    environment,
    deliveryId,
    deliveryKey: `${target.projectId}:${deliveryId}`,
    dueAt: instant.toISOString(),
    expiresAt: new Date(instant.getTime() + 60000).toISOString(),
    from: reminderSenderAddress,
    to: recipient,
    subject,
    message,
    messageHtml,
    type: 'central_reminder',
  }
  request.payloadDigest = createHash('sha256').update(JSON.stringify(request)).digest('hex')
  return request
}

/** Require the actual provider outcome, not an HTTP/queue acknowledgement.
 * Never pass through arbitrary provider text or claim inbox delivery. */
export function parseReminderProviderResponse(receipt, request, httpStatus) {
  const uncertain = (reason) => ({ status: 'uncertain', reason })
  if (receipt?.contractVersion !== reminderProviderContractVersion || receipt?.projectId !== request.projectId || receipt?.environment !== request.environment
    || receipt?.deliveryId !== request.deliveryId || receipt?.payloadDigest !== request.payloadDigest) return uncertain('provider-acknowledgement-mismatch')
  if (typeof receipt?.sender !== 'string' || receipt.sender.toLowerCase() !== reminderSenderAddress) return uncertain('sender-mismatch')
  if (httpStatus === 200 && receipt.outcome === 'accepted' && receipt.accepted === true) return { status: 'accepted' }
  if (httpStatus === 200 && receipt.accepted === false) {
    if (receipt.outcome === 'missed') return { status: 'missed', reason: 'provider-minute-expired' }
    if (receipt.outcome === 'uncertain') return uncertain('provider-reported-uncertain')
  }
  if ([400, 403, 409, 422].includes(httpStatus) && receipt.outcome === 'rejected' && receipt.accepted === false) return { status: 'failed', reason: 'provider-rejected' }
  return uncertain('provider-outcome-unconfirmed')
}
