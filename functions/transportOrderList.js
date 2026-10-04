import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { shipmentTrackingAttention } from './shared/shipmentTrackingAttention.js'
import { DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS, SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH } from './shared/shipmentTrackingForecastSettings.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'
import { shipmentTrackingOperatingHoursPath } from './shipmentTrackingOperatingHours.js'

export const transportOrderListPageSize = 25
export const transportOrderListPageSizeOptions = new Set([25, 50, 100])
const levels = { none: 0, view: 1, edit: 2 }
const statusValues = new Set(['all', 'upcoming', 'in_progress', 'completed'])
const attentionValues = new Set(['all', 'critical', 'action'])
const attentionSeverities = new Set(['info', 'success', 'warning', 'critical'])
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const sortFields = {
  externalNumber: 'externalNumber', loading: 'imported.loading.city', loadingFrom: 'imported.loading.window.from',
  unloading: 'imported.unloading.city', unloadingUntil: 'imported.unloading.window.until', customer: 'imported.customer.name',
  carrier: 'imported.carrier.originalName', relation: 'imported.relation',
}

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function hasViewAccess(profile) { return profile?.role === 'superadmin' || levels[profile?.permissions?.transportOrders] >= levels.view }
function statusForTracking(tracking) {
  if (tracking?.lifecycleStatus === 'completed') return 'completed'
  if (tracking?.lifecycleStatus !== 'active') return 'upcoming'
  if (tracking.lifecyclePhase === 'upcoming') return 'upcoming'
  return 'in_progress'
}
function searchableText(order) { return [order.externalNumber, order.imported?.customer?.name, order.imported?.customer?.debtorNumber, order.imported?.carrier?.originalName, order.imported?.customerReference, order.imported?.loading?.city, order.imported?.unloading?.city, order.imported?.relation].filter(Boolean).join(' ').toLocaleLowerCase('de-DE') }
function startDate(order) {
  const value = order?.imported?.loading?.window?.from
  if (typeof value === 'string') return value.slice(0, 10)
  if (value?.toDate) return value.toDate().toISOString().slice(0, 10)
  return ''
}
function asMillis(value) { return value?.toMillis?.() ?? (value ? new Date(value).getTime() : null) }
function forecastForList(value, settings, now = new Date(), tracking = null, imported = {}) {
  const actualUnloading = asMillis(tracking?.actualArrivalUnloadingAt)
  if (Number.isFinite(actualUnloading)) {
    const slotEnd = asMillis(imported?.unloading?.window?.until) ?? asMillis(imported?.unloading?.window?.from)
    return { kind: 'arrival', state: !Number.isFinite(slotEnd) || actualUnloading <= slotEnd ? 'green' : 'yellow' }
  }
  if (!value || typeof value !== 'object' || value.kind !== 'forecast') return value || null
  const expiresAt = asMillis(value.expiresAt)
  if (Number.isFinite(expiresAt) && now.getTime() > expiresAt) return { ...value, state: 'grey' }
  const share = Number(value.onTimeSharePercent)
  if (!Number.isFinite(share)) return value
  const red = Number(settings?.redThresholdPercent) || DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS.redThresholdPercent
  const green = Number(settings?.greenThresholdPercent) || DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS.greenThresholdPercent
  return { ...value, state: share <= red ? 'red' : share < green ? 'yellow' : 'green', thresholds: { red, green } }
}

export function relationMatches(order, relation) { return !relation || text(order?.imported?.relation) === relation }
export function loadingStartMatches(order, from, until) {
  const value = startDate(order)
  return Boolean(value) && (!from || value >= from) && (!until || value <= until)
}
export function transportOrderRelationOptions(orders) {
  return [...new Set((orders || []).map((order) => text(order?.imported?.relation)).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'de-DE', { numeric: true }))
}

export function transportOrderTrackingStatus(tracking) { return statusForTracking(tracking) }
export function trackingStatusMatches(status, filter) { return filter === 'all' || status === filter }
export function normalizeListIconFilters(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    automationPaused: source.automationPaused === true,
    mailReview: source.mailReview === true,
    licensePlate: source.licensePlate === true,
    stopwatch: attentionSeverities.has(source.stopwatch) ? source.stopwatch : '',
    truck: attentionSeverities.has(source.truck) ? source.truck : '',
  }
}
export function listIconFiltersMatch(items, filters) {
  const attention = Array.isArray(items) ? items : []
  if (filters.automationPaused && !attention.some((item) => item.id === 'automation-paused')) return false
  if (filters.mailReview && !attention.some((item) => item.id === 'mail-review')) return false
  if (filters.licensePlate && !attention.some((item) => item.id === 'license-plate')) return false
  if (filters.stopwatch && !attention.some((item) => item.icon === 'stopwatch' && item.severity === filters.stopwatch)) return false
  if (filters.truck && !attention.some((item) => item.icon !== 'stopwatch' && !['mail-review', 'automation-paused', 'license-plate'].includes(item.id) && item.severity === filters.truck)) return false
  return true
}

export function normalizeTransportOrderListPageSize(value) { return transportOrderListPageSizeOptions.has(Number(value)) ? Number(value) : transportOrderListPageSize }

export async function listTransportOrdersPageHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasViewAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Transportaufträge.')
  const filter = request.data?.trackingStatus || 'all'
  const attentionFilter = request.data?.attention || 'all'
  const iconFilters = normalizeListIconFilters(request.data?.iconFilters)
  const sort = request.data?.sort || {}
  const sortKey = Object.hasOwn(sortFields, sort.key) ? sort.key : null
  const sortDirection = sort.direction === 'asc' ? 'asc' : 'desc'
  const search = text(request.data?.search).toLocaleLowerCase('de-DE')
  const relation = text(request.data?.relation)
  const loadingFrom = text(request.data?.loadingFrom)
  const loadingUntil = text(request.data?.loadingUntil)
  const cursorId = text(request.data?.cursor)
  const pageSize = normalizeTransportOrderListPageSize(request.data?.pageSize)
  if (!statusValues.has(filter) || !attentionValues.has(attentionFilter) || search.length > 180 || relation.length > 180 || (loadingFrom && !datePattern.test(loadingFrom)) || (loadingUntil && !datePattern.test(loadingUntil)) || (loadingFrom && loadingUntil && loadingFrom > loadingUntil) || (cursorId && cursorId.length > 240)) throw new HttpsError('invalid-argument', 'Ungültige Listenabfrage.')

  const db = getFirestore(); const orders = db.collection('transportOrders')
  const [forecastSettingsSnapshot, operatingHoursSnapshot] = await Promise.all([db.doc(SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH).get(), db.doc(shipmentTrackingOperatingHoursPath).get()])
  const forecastSettings = forecastSettingsSnapshot.exists ? forecastSettingsSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS
  const operatingHours = operatingHoursSnapshot.exists ? operatingHoursSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS
  let cursor = null
  if (cursorId) {
    const snapshot = await orders.doc(cursorId).get()
    if (!snapshot.exists) throw new HttpsError('invalid-argument', 'Der Listencursor ist nicht mehr gültig.')
    cursor = snapshot
  }
  const results = []; let lastResultCursor = null
  while (true) {
    let query = orders.orderBy(sortKey ? sortFields[sortKey] : 'importMeta.lastImportedAt', sortKey ? sortDirection : 'desc').limit(pageSize + 1)
    if (cursor) query = query.startAfter(cursor)
    const batch = await query.get()
    if (!batch.docs.length) break
    const candidates = batch.docs.slice(0, pageSize)
    const trackingSnapshots = candidates.length ? await db.getAll(...candidates.map((entry) => db.doc(`transportOrderTrackings/${entry.id}`))) : []
    const trackingByOrder = new Map(trackingSnapshots.filter((entry) => entry.exists).map((entry) => [entry.id, entry.data()]))
    for (const entry of candidates) {
      const order = { id: entry.id, ...entry.data() }; const trackingStatus = statusForTracking(trackingByOrder.get(entry.id))
      const tracking = trackingByOrder.get(entry.id) || null
      const attention = shipmentTrackingAttention({ tracking, imported: order.imported, receivedMails: tracking?.attentionSummary?.manualReviewOpen ? [{ ai: { reviewRequired: true } }] : [], settings: forecastSettings, operatingHours })
      const attentionMatches = attentionFilter === 'all' || (attentionFilter === 'critical' ? attention.items.some((item) => item.severity === 'critical') : attention.items.some((item) => ['critical', 'warning'].includes(item.severity)))
      if (trackingStatusMatches(trackingStatus, filter) && attentionMatches && listIconFiltersMatch(attention.items, iconFilters) && (!search || searchableText(order).includes(search)) && relationMatches(order, relation) && loadingStartMatches(order, loadingFrom, loadingUntil)) {
        if (results.length === pageSize) return { orders: results, nextCursor: lastResultCursor, hasMore: true }
        results.push({ ...order, trackingStatus, attention, forecast: forecastForList(tracking?.currentForecast, forecastSettings, new Date(), tracking, order.imported) })
        lastResultCursor = entry.id
      }
    }
    if (batch.docs.length <= pageSize) break
    cursor = candidates[candidates.length - 1]
  }
  return { orders: results, nextCursor: null, hasMore: false }
}

export async function listTransportOrderRelationsHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasViewAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Transportaufträge.')
  const snapshots = await getFirestore().collection('transportOrders').select('imported.relation').get()
  return { relations: transportOrderRelationOptions(snapshots.docs.map((entry) => entry.data())) }
}
