import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { BUSINESS_PARTNERS_COLLECTION } from './businessPartners.js'
import { db } from './firebase.js'
import { getPartnerCluster } from './partnerClusterQueries.js'
import { createHistoryPayload } from './partnerHistory.js'
import { resolvePartnerInIndex } from './partnerCluster.js'

export const CUSTOMER_RATING_CRITERIA = [
  { key: 'paymentBehavior', label: 'Zahlungsmoral' },
  { key: 'margin', label: 'Ertrag / Marge' },
  { key: 'cooperation', label: 'Zusammenarbeit' },
  { key: 'orderQuality', label: 'Auftragsqualität' },
  { key: 'potential', label: 'Potenzial' },
  { key: 'strategicImportance', label: 'Strategische Bedeutung' },
]

export const CARRIER_RATING_CRITERIA = [
  { key: 'reliability', label: 'Zuverlässigkeit' },
  { key: 'punctuality', label: 'Pünktlichkeit' },
  { key: 'communication', label: 'Kommunikation' },
  { key: 'priceLevel', label: 'Preisniveau' },
  { key: 'documentQuality', label: 'Dokumentenqualität / POD' },
  { key: 'palletExchange', label: 'Palettentausch' },
  { key: 'claimsPerformance', label: 'Schaden- / Reklamationsquote' },
]

const criteriaByRole = { customer: CUSTOMER_RATING_CRITERIA, carrier: CARRIER_RATING_CRITERIA }
const trim = (value) => (value ?? '').trim()
const timestampValue = (value) => value?.toMillis?.() ?? 0

function ratingsRef(partnerId) {
  return collection(db, BUSINESS_PARTNERS_COLLECTION, partnerId, 'ratings')
}

function mapSnapshot(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

export function getRatingRoles(partner) {
  const roles = []
  if (partner.debtorNumber?.trim()) roles.push('customer')
  if (partner.creditorNumber?.trim()) roles.push('carrier')
  return roles.length ? roles : ['carrier']
}

export function getRatingCriteria(role) {
  return criteriaByRole[role] ?? []
}

export function createEmptyRating(role) {
  return {
    role,
    date: new Date().toISOString().slice(0, 10),
    scores: Object.fromEntries(getRatingCriteria(role).map(({ key }) => [key, ''])),
    comment: '',
  }
}

export function calculateOverallScore(role, scores) {
  const values = getRatingCriteria(role).map(({ key }) => Number(scores[key]))
  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) return null
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.round(average * 100) / 100
}

export function formatRatingScore(score) {
  return score === null || score === undefined ? '—' : new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(score)
}

export function getCrmRatingStatus(score) {
  if (score === null || score === undefined) return 'unrated'
  if (score >= 4) return 'good'
  if (score >= 3) return 'watch'
  return 'critical'
}

export function getCurrentCrmRatingPresentation(partner, currentRatings = {}) {
  const roles = getRatingRoles(partner)
  return roles.map((role) => {
    const score = currentRatings[role]?.overallScore ?? null
    return {
      role,
      label: roles.length > 1 ? (role === 'customer' ? 'Kunde' : 'Unternehmer') : 'Bewertung',
      score,
      value: score === null ? 'Nicht bewertet' : `${formatRatingScore(score)} / 5`,
      status: getCrmRatingStatus(score),
    }
  })
}

export async function listCrmRatings(partnerId, role) {
  const cluster = await getPartnerCluster(partnerId)
  const snapshots = await Promise.all(cluster.members.map((partner) => getDocs(ratingsRef(partner.id))))
  return snapshots.flatMap((snapshot, index) => snapshot.docs.map((entry) => ({ ...mapSnapshot(entry), originPartnerId: cluster.members[index].id })))
    .filter((item) => !item.splitArchivedAt && (!role || item.role === role))
    .sort((left, right) => (
      (right.date || '').localeCompare(left.date || '')
      || timestampValue(right.createdAt) - timestampValue(left.createdAt)
    ))
}

export async function listCurrentCrmRatings(partnerIds, knownPartners = null) {
  const partners = knownPartners || (await getDocs(collection(db, BUSINESS_PARTNERS_COLLECTION))).docs.map((entry) => ({ id: entry.id, ...entry.data() }))
  const byId = new Map(partners.map((partner) => [partner.id, partner]))
  const rootFor = (id) => resolvePartnerInIndex(byId, id)?.id || id
  const requestedRoots = new Set(partnerIds.map(rootFor))
  const members = partners.filter((partner) => requestedRoots.has(rootFor(partner.id)))
  const snapshots = await Promise.all(members.map((partner) => getDocs(ratingsRef(partner.id))))
  const grouped = new Map()
  snapshots.forEach((snapshot, index) => {
    const rootId = rootFor(members[index].id)
    grouped.set(rootId, [...(grouped.get(rootId) || []), ...snapshot.docs.map((entry) => ({ ...mapSnapshot(entry), originPartnerId: members[index].id }))])
  })
  const currentByRoot = new Map([...requestedRoots].map((rootId) => {
    const ratings = (grouped.get(rootId) || []).filter((item) => !item.splitArchivedAt).sort((left, right) => (right.date || '').localeCompare(left.date || '') || timestampValue(right.createdAt) - timestampValue(left.createdAt))
    return [rootId, { customer: ratings.find((rating) => rating.role === 'customer') ?? null, carrier: ratings.find((rating) => rating.role === 'carrier') ?? null }]
  }))
  return Object.fromEntries(partnerIds.map((id) => [id, currentByRoot.get(rootFor(id)) || { customer: null, carrier: null }]))
}

export async function createCrmRating(partnerId, values, actor) {
  const overallScore = calculateOverallScore(values.role, values.scores)
  if (!values.date || overallScore === null) throw new Error('Ungültige Bewertung')
  const scores = Object.fromEntries(getRatingCriteria(values.role).map(({ key }) => [key, Number(values.scores[key])]))
  const ratingRef = doc(ratingsRef(partnerId))
  const historyRef = doc(collection(db, BUSINESS_PARTNERS_COLLECTION, partnerId, 'history'))
  const roleLabel = values.role === 'customer' ? 'Kundenbewertung' : 'Unternehmerbewertung'
  const batch = writeBatch(db)
  batch.set(ratingRef, {
    role: values.role,
    date: values.date,
    scores,
    overallScore,
    comment: trim(values.comment),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(historyRef, createHistoryPayload({
    category: 'rating',
    action: 'created',
    summary: `${roleLabel} mit ${formatRatingScore(overallScore)} / 5 hinzugefügt`,
    metadata: { ratingId: ratingRef.id, role: values.role, overallScore, scores, comment: trim(values.comment) },
    actor,
  }))
  await batch.commit()
}
