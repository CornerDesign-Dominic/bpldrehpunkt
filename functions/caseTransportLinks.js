import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentCreatedWithAuthContext, onDocumentDeletedWithAuthContext } from 'firebase-functions/v2/firestore'
import { CASE_TRANSPORT_CASE_TYPES, isCaseTransportCaseType } from './shared/caseTransportLinks.js'

const region = 'europe-west3'
const database = () => getFirestore()

function cleanText(value) { return typeof value === 'string' ? value.trim() : '' }

async function actor(event, fallback = {}) {
  const userId = event.authId || fallback.createdByUserId || null
  const profile = userId ? await database().doc(`users/${userId}`).get() : null
  const profileData = profile?.data() || {}
  const name = [cleanText(profileData.firstName), cleanText(profileData.lastName)].filter(Boolean).join(' ') || cleanText(profileData.email) || cleanText(fallback.createdByName) || 'System'
  return { userId, name }
}

async function transportOrderLabel(transportOrderId) {
  const order = await database().doc(`transportOrders/${transportOrderId}`).get()
  return cleanText(order.data()?.externalNumber) || transportOrderId
}

async function writeCaseHistory(link, text, event) {
  if (!isCaseTransportCaseType(link.caseType) || !cleanText(link.caseId)) return
  const definition = CASE_TRANSPORT_CASE_TYPES[link.caseType]
  const caseRef = database().doc(`${definition.collection}/${link.caseId}`)
  if (!(await caseRef.get()).exists) return
  const currentActor = await actor(event, link)
  const entryId = `${event.id}-${link.caseType}-${link.caseId}`
  if (link.caseType === 'inkasso') {
    await caseRef.collection('history').doc(entryId).set({
      id: entryId, caseId: link.caseId, eventType: text.startsWith('Transportauftrag verknüpft') ? 'transport_order_linked' : 'transport_order_unlinked',
      text, source: 'server', createdAt: FieldValue.serverTimestamp(), createdByUserId: currentActor.userId, createdByName: currentActor.name,
    })
    return
  }
  await caseRef.collection('updates').doc(entryId).set({
    type: 'system', text, createdByUserId: currentActor.userId, createdByName: currentActor.name, createdAt: FieldValue.serverTimestamp(),
  })
}

async function record(link, action, event) {
  const orderNumber = await transportOrderLabel(link.transportOrderId)
  const text = action === 'created' ? `Transportauftrag verknüpft: TA ${orderNumber}` : `Transportauftrag-Verknüpfung entfernt: TA ${orderNumber}`
  await writeCaseHistory(link, text, event)
}

export const recordCaseTransportOrderLinkCreated = onDocumentCreatedWithAuthContext({ region, document: 'caseTransportOrderLinks/{linkId}' }, async (event) => record(event.data.data(), 'created', event))
export const recordCaseTransportOrderLinkDeleted = onDocumentDeletedWithAuthContext({ region, document: 'caseTransportOrderLinks/{linkId}' }, async (event) => record(event.data.data(), 'deleted', event))
