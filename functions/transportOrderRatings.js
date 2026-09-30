import { createHash } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { resolvePartnerInIndex } from './partnerCluster.js'
import { businessPartnerRoles } from './shared/businessPartnerRoles.js'
import { TRANSPORT_RATING_CRITERIA, validateTransportRating } from './shared/transportOrderRatings.js'

export function ratingDocumentId(transportOrderId, partnerId, partnerRole, ratedByUserId) {
  return createHash('sha256').update(JSON.stringify([transportOrderId, partnerId, partnerRole, ratedByUserId])).digest('hex')
}

export async function upsertTransportOrderRating(store, identity, payload) {
  const { transportOrderId, partnerId, partnerRole, ratedByUserId } = identity
  const ref = store.doc(`transportOrderRatings/${ratingDocumentId(transportOrderId, partnerId, partnerRole, ratedByUserId)}`)
  await store.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    transaction.set(ref, {
      ...identity,
      ...payload,
      createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
}

async function assertAccess(request, minimum) {
  const profile = await requireActiveProfile(request)
  const level = profile.role === 'superadmin' ? 'edit' : profile.permissions?.transportOrders
  if (level !== 'edit' && !(minimum === 'view' && level === 'view')) throw new HttpsError('permission-denied', 'Keine Berechtigung für Transportaufträge.')
  return request.auth.uid
}

function validId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 500 && !value.includes('/') }

async function resolvePartner(db, sourceId) {
  if (!validId(sourceId)) throw new HttpsError('failed-precondition', 'Der Partner fehlt im Transportauftrag.')
  let currentId = sourceId
  const seen = new Set()
  while (seen.size < 20 && !seen.has(currentId)) {
    seen.add(currentId)
    const partnerSnapshot = await db.doc(`businessPartners/${currentId}`).get()
    if (!partnerSnapshot.exists) throw new HttpsError('failed-precondition', 'Der Partner ist nicht verfügbar.')
    const nextId = partnerSnapshot.data().mergedIntoPartnerId
    if (!nextId) return { id: currentId, data: partnerSnapshot.data() }
    if (!validId(nextId)) throw new HttpsError('failed-precondition', 'Der Partner ist nicht verfügbar.')
    currentId = nextId
  }
  throw new HttpsError('failed-precondition', 'Der Partner ist nicht verfügbar.')
}

async function resolveOrderAndPartner(db, transportOrderId, partnerId, partnerRole) {
  if (!validId(transportOrderId) || !validId(partnerId) || !TRANSPORT_RATING_CRITERIA[partnerRole]) throw new HttpsError('invalid-argument', 'Transportauftrag oder Partner fehlt.')
  const orderSnapshot = await db.doc(`transportOrders/${transportOrderId}`).get()
  if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
  const order = orderSnapshot.data()
  const partner = await resolvePartner(db, order.imported?.[partnerRole]?.partnerId)
  if (partner.id !== partnerId) throw new HttpsError('failed-precondition', 'Der Partner ist nicht verfügbar.')
  if (!businessPartnerRoles(partner.data)[partnerRole]) throw new HttpsError('failed-precondition', 'Die Partnerrolle ist nicht verfügbar.')
  return order
}

export async function getOwnTransportOrderRatingsHandler(request) {
  const uid = await assertAccess(request, 'view')
  const db = getFirestore()
  const transportOrderId = request.data?.transportOrderId
  if (!validId(transportOrderId)) throw new HttpsError('invalid-argument', 'Transportauftrag fehlt.')
  const orderSnapshot = await db.doc(`transportOrders/${transportOrderId}`).get()
  if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
  const result = {}
  const partners = {}
  for (const partnerRole of ['customer', 'carrier']) {
    const sourceId = orderSnapshot.data().imported?.[partnerRole]?.partnerId
    if (!validId(sourceId)) continue
    const partner = await resolvePartner(db, sourceId)
    partners[partnerRole] = { id: partner.id, companyName: partner.data.companyName || '' }
    const snapshot = await db.doc(`transportOrderRatings/${ratingDocumentId(transportOrderId, partner.id, partnerRole, uid)}`).get()
    if (snapshot.exists) result[partnerRole] = { id: snapshot.id, ...snapshot.data() }
  }
  return { ratings: result, partners }
}

export async function saveTransportOrderRatingHandler(request) {
  const uid = await assertAccess(request, 'edit')
  const db = getFirestore()
  const { transportOrderId, partnerId, partnerRole, scores, comment = '' } = request.data || {}
  const order = await resolveOrderAndPartner(db, transportOrderId, partnerId, partnerRole)
  let normalized
  try { normalized = validateTransportRating(partnerRole, scores, comment) }
  catch (error) { throw new HttpsError('invalid-argument', error.message) }
  await upsertTransportOrderRating(db, { transportOrderId, partnerId, partnerRole, ratedByUserId: uid }, { transportOrderNumber: String(order.externalNumber || ''), ...normalized })
  return { rating: { transportOrderId, partnerId, partnerRole, ratedByUserId: uid, ...normalized } }
}

export async function listPartnerRatingRows(db, partnerId) {
  const partner = await resolvePartner(db, partnerId)
  const merged = await db.collection('businessPartners').where('mergedIntoPartnerId', '==', partner.id).get()
  const partnerIds = [partner.id, ...merged.docs.map((entry) => entry.id)]
  const snapshots = await Promise.all(partnerIds.map((id) => db.collection('transportOrderRatings').where('partnerId', '==', id).get()))
  const ratings = snapshots.flatMap((snapshot) => snapshot.docs.map((entry) => {
    const data = entry.data()
    return {
      id: entry.id,
      transportOrderId: data.transportOrderId || '',
      transportOrderNumber: data.transportOrderNumber || '',
      partnerRole: data.partnerRole,
      scores: data.scores || {},
      averageScore: data.averageScore,
      comment: data.comment || '',
      createdAtMs: data.createdAt?.toMillis?.() || 0,
      updatedAtMs: data.updatedAt?.toMillis?.() || 0,
    }
  })).filter((rating) => rating.partnerRole === 'customer' || rating.partnerRole === 'carrier')
    .sort((left, right) => right.createdAtMs - left.createdAtMs || right.updatedAtMs - left.updatedAtMs)
  return ratings
}

export async function listPartnerTransportOrderRatingsHandler(request) {
  const profile = await requireActiveProfile(request)
  if (profile.role !== 'superadmin' && !['view', 'edit'].includes(profile.permissions?.crm)) throw new HttpsError('permission-denied', 'Keine Berechtigung für CRM-Bewertungen.')
  const partnerId = request.data?.partnerId
  if (!validId(partnerId)) throw new HttpsError('invalid-argument', 'Geschäftspartner fehlt.')
  return { ratings: await listPartnerRatingRows(getFirestore(), partnerId) }
}

export function summarizeCrmRatingRows(partners, ratings) {
  const byId = new Map(partners.map((partner) => [partner.id, partner]))
  const totals = Object.create(null)
  for (const rating of ratings) {
    if (!['customer', 'carrier'].includes(rating.partnerRole)) continue
    if (typeof rating.averageScore !== 'number' || !Number.isFinite(rating.averageScore) || rating.averageScore < 1 || rating.averageScore > 5) continue
    let partner
    try { partner = resolvePartnerInIndex(byId, rating.partnerId) } catch { continue }
    if (!partner) continue
    const role = totals[partner.id]?.[rating.partnerRole] || { sum: 0, count: 0 }
    totals[partner.id] = { ...totals[partner.id], [rating.partnerRole]: { sum: role.sum + rating.averageScore, count: role.count + 1 } }
  }
  return Object.fromEntries(Object.entries(totals).map(([id, roles]) => [id, Object.fromEntries(Object.entries(roles).map(([role, { sum, count }]) => [role, { averageScore: sum / count, count }]))]))
}

export async function listCrmTransportRatingSummariesHandler(request) {
  const profile = await requireActiveProfile(request)
  if (profile.role !== 'superadmin' && !['view', 'edit'].includes(profile.permissions?.crm)) throw new HttpsError('permission-denied', 'Keine Berechtigung für CRM-Bewertungen.')
  const db = getFirestore()
  const [partnerSnapshot, ratingSnapshot] = await Promise.all([
    db.collection('businessPartners').select('mergedIntoPartnerId', 'status').get(),
    db.collection('transportOrderRatings').select('partnerId', 'partnerRole', 'averageScore').get(),
  ])
  const partners = partnerSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
  const ratings = ratingSnapshot.docs.map((entry) => entry.data())
  return { summaries: summarizeCrmRatingRows(partners, ratings) }
}
