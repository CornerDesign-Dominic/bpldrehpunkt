import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'

export const transportOrderListPageSize = 100
const levels = { none: 0, view: 1, edit: 2 }
const statusValues = new Set(['all', 'upcoming', 'active', 'completed'])
const sortFields = {
  externalNumber: 'externalNumber', loading: 'imported.loading.city', loadingFrom: 'imported.loading.window.from',
  unloading: 'imported.unloading.city', unloadingUntil: 'imported.unloading.window.until', customer: 'imported.customer.name',
  carrier: 'imported.carrier.originalName', relation: 'imported.relation',
}

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function hasViewAccess(profile) { return profile?.role === 'superadmin' || levels[profile?.permissions?.transportOrders] >= levels.view }
function statusForTracking(tracking) { return tracking?.lifecycleStatus === 'completed' ? 'completed' : tracking?.lifecycleStatus === 'active' ? 'active' : 'upcoming' }
function searchableText(order) { return [order.externalNumber, order.imported?.customer?.name, order.imported?.customer?.debtorNumber, order.imported?.carrier?.originalName, order.imported?.customerReference, order.imported?.loading?.city, order.imported?.unloading?.city].filter(Boolean).join(' ').toLocaleLowerCase('de-DE') }

export function transportOrderTrackingStatus(tracking) { return statusForTracking(tracking) }
export function trackingStatusMatches(status, filter) { return filter === 'all' || status === filter }

export async function listTransportOrdersPageHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasViewAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Transportaufträge.')
  const filter = request.data?.trackingStatus || 'active'
  const sort = request.data?.sort || {}
  const sortKey = Object.hasOwn(sortFields, sort.key) ? sort.key : null
  const sortDirection = sort.direction === 'asc' ? 'asc' : 'desc'
  const search = text(request.data?.search).toLocaleLowerCase('de-DE')
  const cursorId = text(request.data?.cursor)
  if (!statusValues.has(filter) || search.length > 180 || (cursorId && cursorId.length > 240)) throw new HttpsError('invalid-argument', 'Ungültige Listenabfrage.')

  const db = getFirestore(); const orders = db.collection('transportOrders')
  let cursor = null
  if (cursorId) {
    const snapshot = await orders.doc(cursorId).get()
    if (!snapshot.exists) throw new HttpsError('invalid-argument', 'Der Listencursor ist nicht mehr gültig.')
    cursor = snapshot
  }
  const results = []; let lastResultCursor = null
  while (true) {
    let query = orders.orderBy(sortKey ? sortFields[sortKey] : 'importMeta.lastImportedAt', sortKey ? sortDirection : 'desc').limit(transportOrderListPageSize + 1)
    if (cursor) query = query.startAfter(cursor)
    const batch = await query.get()
    if (!batch.docs.length) break
    const candidates = batch.docs.slice(0, transportOrderListPageSize)
    const trackingSnapshots = candidates.length ? await db.getAll(...candidates.map((entry) => db.doc(`transportOrderTrackings/${entry.id}`))) : []
    const trackingByOrder = new Map(trackingSnapshots.filter((entry) => entry.exists).map((entry) => [entry.id, entry.data()]))
    for (const entry of candidates) {
      const order = { id: entry.id, ...entry.data() }; const trackingStatus = statusForTracking(trackingByOrder.get(entry.id))
      if (trackingStatusMatches(trackingStatus, filter) && (!search || searchableText(order).includes(search))) {
        if (results.length === transportOrderListPageSize) return { orders: results, nextCursor: lastResultCursor, hasMore: true }
        results.push({ ...order, trackingStatus })
        lastResultCursor = entry.id
      }
    }
    if (batch.docs.length <= transportOrderListPageSize) break
    cursor = candidates[candidates.length - 1]
  }
  return { orders: results, nextCursor: null, hasMore: false }
}
