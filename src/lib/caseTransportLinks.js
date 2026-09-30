import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { CASE_TRANSPORT_CASE_TYPES, CASE_TRANSPORT_CASE_TYPE_IDS, businessPartnerRoleSelectionValue, caseCreationDefaults, caseDetailPath, caseTransportLinkId, filterTransportOrders, linkedCaseLabel, loadCaseTransportLinks, parseBusinessPartnerRoleSelection, transportOrderCaseTypeOrder, visibleCaseTransportCaseTypes } from '../../shared/caseTransportLinks.js'
import { db } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'
import { getTransportOrder, listTransportOrders } from './transportOrders.js'

export { CASE_TRANSPORT_CASE_TYPES, CASE_TRANSPORT_CASE_TYPE_IDS, businessPartnerRoleSelectionValue, caseCreationDefaults, caseDetailPath, filterTransportOrders, linkedCaseLabel, parseBusinessPartnerRoleSelection, transportOrderCaseTypeOrder, visibleCaseTransportCaseTypes }

export const CASE_TRANSPORT_LINKS_COLLECTION = 'caseTransportOrderLinks'

function mapSnapshot(snapshot) { return { id: snapshot.id, ...snapshot.data() } }

function definition(caseType) {
  const result = CASE_TRANSPORT_CASE_TYPES[caseType]
  if (!result) throw new Error('Dieser Falltyp kann nicht mit einem Transportauftrag verknüpft werden.')
  return result
}

function caseReference(caseType, caseId) { return doc(db, definition(caseType).collection, caseId) }

export function transportOrderLinkReference(caseType, caseId, transportOrderId) {
  return doc(db, CASE_TRANSPORT_LINKS_COLLECTION, caseTransportLinkId(caseType, caseId, transportOrderId))
}

export function setTransportOrderCaseLink(transaction, { caseType, caseId, transportOrderId, actor }) {
  transaction.set(transportOrderLinkReference(caseType, caseId, transportOrderId), {
    caseType,
    caseId,
    transportOrderId,
    createdAt: serverTimestamp(),
    createdByUserId: actor.user.uid,
    createdByName: getUserDisplayName(actor.profile, actor.user),
  })
}

export async function listTransportOrderLinksForCase(caseType, caseId) {
  const snapshots = await getDocs(query(collection(db, CASE_TRANSPORT_LINKS_COLLECTION), where('caseType', '==', caseType), where('caseId', '==', caseId)))
  const links = snapshots.docs.map(mapSnapshot)
  const orders = await Promise.all(links.map((link) => getTransportOrder(link.transportOrderId)))
  return links.map((link, index) => ({ ...link, transportOrder: orders[index] })).filter((link) => link.transportOrder)
}

export async function listCaseLinksForTransportOrder(transportOrderId, caseTypes) {
  const permittedTypes = (caseTypes || []).filter((caseType) => CASE_TRANSPORT_CASE_TYPES[caseType])
  const { entries, ignored } = await loadCaseTransportLinks({
    caseTypes: permittedTypes,
    listLinksForType: async (caseType) => {
    const snapshots = await getDocs(query(collection(db, CASE_TRANSPORT_LINKS_COLLECTION), where('transportOrderId', '==', transportOrderId), where('caseType', '==', caseType)))
    return snapshots.docs.map(mapSnapshot)
    },
    readCase: async (caseType, caseId) => {
      const snapshot = await getDoc(caseReference(caseType, caseId))
      return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
    },
  })
  if (ignored.length) console.warn('TA-Fallverknüpfungen wurden teilweise übersprungen.', { transportOrderId, ignored: ignored.map(({ link, reason }) => ({ linkId: link?.id || null, caseType: link?.caseType || null, reason })) })
  return entries.map((link) => ({ ...link, href: caseDetailPath(link.caseType, link.caseId), label: linkedCaseLabel(link.caseType, link.caseItem) }))
}

export async function searchTransportOrders(search) {
  return filterTransportOrders(await listTransportOrders(), search)
}

export async function linkTransportOrderToCase({ caseType, caseId, transportOrderId, actor }) {
  const caseRef = caseReference(caseType, caseId)
  const orderRef = doc(db, 'transportOrders', transportOrderId)
  return runTransaction(db, async (transaction) => {
    // A new relation document has no resource data yet. Reading it first would
    // be denied by the relation's read rule, which intentionally authorizes
    // reads from its stored case type. The deterministic document ID already
    // makes this write unique, so only verify the two source documents here.
    const [caseSnapshot, order] = await Promise.all([transaction.get(caseRef), transaction.get(orderRef)])
    if (!caseSnapshot.exists()) throw new Error('Der Fall ist nicht mehr verfügbar.')
    if (!order.exists()) throw new Error('Der Transportauftrag ist nicht mehr verfügbar.')
    setTransportOrderCaseLink(transaction, { caseType, caseId, transportOrderId, actor })
    return true
  })
}

export async function unlinkTransportOrderFromCase({ caseType, caseId, transportOrderId }) {
  const linkRef = transportOrderLinkReference(caseType, caseId, transportOrderId)
  return runTransaction(db, async (transaction) => {
    const link = await transaction.get(linkRef)
    if (!link.exists()) return false
    transaction.delete(linkRef)
    return true
  })
}
