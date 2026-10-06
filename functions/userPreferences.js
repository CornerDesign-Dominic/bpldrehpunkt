import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'

const trackingFilters = new Set(['all', 'upcoming', 'in_progress', 'completed'])
const attentionFilters = new Set(['all', 'action', 'critical'])
const attentionSeverities = new Set(['info', 'success', 'warning', 'critical'])
const pageSizes = new Set([25, 50, 100])
const sortKeys = new Set(['externalNumber', 'loading', 'loadingFrom', 'unloading', 'unloadingUntil', 'customer', 'carrier', 'relation'])
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const preferenceKeys = new Set(['search', 'trackingFilter', 'attentionFilter', 'iconFilters', 'relation', 'loadingFrom', 'loadingUntil', 'sort', 'pageSize'])

function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function text(value, maxLength) {
  if (typeof value !== 'string') return ''
  const result = value.trim()
  if (result.length > maxLength) throw new HttpsError('invalid-argument', 'Eine gespeicherte Listenansicht ist ungültig.')
  return result
}
function date(value) {
  const result = text(value, 10)
  if (result && !datePattern.test(result)) throw new HttpsError('invalid-argument', 'Eine gespeicherte Listenansicht ist ungültig.')
  return result
}

/** Keeps personal list settings deliberately small and harmless. No profile,
 * permissions, or shared data can be changed through this callable. */
export function normalizeTransportOrderListPreferences(value) {
  if (!isPlainObject(value) || Object.keys(value).some((key) => !preferenceKeys.has(key))) throw new HttpsError('invalid-argument', 'Eine gespeicherte Listenansicht ist ungültig.')
  const loadingFrom = date(value.loadingFrom)
  const loadingUntil = date(value.loadingUntil)
  if (loadingFrom && loadingUntil && loadingFrom > loadingUntil) throw new HttpsError('invalid-argument', 'Eine gespeicherte Listenansicht ist ungültig.')
  const iconFilters = isPlainObject(value.iconFilters) ? value.iconFilters : {}
  if (Object.keys(iconFilters).some((key) => !['automationPaused', 'mailReview', 'licensePlate', 'stopwatch', 'truck'].includes(key))) throw new HttpsError('invalid-argument', 'Eine gespeicherte Listenansicht ist ungültig.')
  const sort = isPlainObject(value.sort) ? value.sort : {}
  if (Object.keys(sort).some((key) => !['key', 'direction'].includes(key))) throw new HttpsError('invalid-argument', 'Eine gespeicherte Listenansicht ist ungültig.')
  return {
    search: text(value.search, 180),
    trackingFilter: trackingFilters.has(value.trackingFilter) ? value.trackingFilter : 'all',
    attentionFilter: attentionFilters.has(value.attentionFilter) ? value.attentionFilter : 'all',
    iconFilters: {
      automationPaused: iconFilters.automationPaused === true,
      mailReview: iconFilters.mailReview === true,
      licensePlate: iconFilters.licensePlate === true,
      stopwatch: attentionSeverities.has(iconFilters.stopwatch) ? iconFilters.stopwatch : '',
      truck: attentionSeverities.has(iconFilters.truck) ? iconFilters.truck : '',
    },
    relation: text(value.relation, 180), loadingFrom, loadingUntil,
    sort: { key: sortKeys.has(sort.key) ? sort.key : null, direction: sort.direction === 'desc' ? 'desc' : 'asc' },
    pageSize: pageSizes.has(Number(value.pageSize)) ? Number(value.pageSize) : 25,
  }
}

export async function updateOwnTransportOrderListPreferencesHandler(request) {
  await requireActiveProfile(request)
  if (!isPlainObject(request.data) || Object.keys(request.data).some((key) => key !== 'preferences')) throw new HttpsError('invalid-argument', 'Ungültige Benutzereinstellung.')
  const preferences = normalizeTransportOrderListPreferences(request.data.preferences)
  await getFirestore().doc(`users/${request.auth.uid}`).update({
    'userPreferences.transportOrderList': preferences,
    'userPreferences.transportOrderListUpdatedAt': FieldValue.serverTimestamp(),
  })
  return { preferences }
}
