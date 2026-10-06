export const trackingFilterOptions = [
  { value: 'all', label: 'Alle' }, { value: 'upcoming', label: 'Startet' },
  { value: 'in_progress', label: 'Laufend' }, { value: 'completed', label: 'Ende' },
]

export const defaultTrackingFilter = 'all'
export const transportOrderListPageSize = 25
export const transportOrderListPageSizeOptions = [25, 50, 100]
const attentionSeverities = new Set(['info', 'success', 'warning', 'critical'])
const transportOrderListSortKeys = new Set(['externalNumber', 'loading', 'loadingFrom', 'unloading', 'unloadingUntil', 'customer', 'carrier', 'relation'])
export const trackingStatusPresentation = {
  upcoming: { label: 'Startet', className: 'upcoming' },
  in_progress: { label: 'Laufend', className: 'in-progress' },
  completed: { label: 'Ende', className: 'completed' },
}

export function trackingStatusForList(value) { return trackingStatusPresentation[value] || trackingStatusPresentation.upcoming }
export function emptyTrackingFilterMessage(filter) { return filter === 'in_progress' ? 'Keine laufenden Sendungsverfolgungen vorhanden.' : filter === 'upcoming' ? 'Keine Sendungsverfolgungen mit Status „Startet“ vorhanden.' : filter === 'completed' ? 'Keine Sendungsverfolgungen mit Status „Ende“ vorhanden.' : 'Keine Transportaufträge gefunden.' }
export function validTransportOrderListPageSize(value) { return transportOrderListPageSizeOptions.includes(Number(value)) ? Number(value) : transportOrderListPageSize }
export function defaultTransportOrderListPreferences() {
  return {
    search: '', trackingFilter: defaultTrackingFilter, attentionFilter: 'all',
    iconFilters: { automationPaused: false, mailReview: false, licensePlate: false, stopwatch: '', truck: '' },
    relation: '', loadingFrom: '', loadingUntil: '', sort: { key: null, direction: 'asc' }, pageSize: transportOrderListPageSize,
  }
}
export function normalizeTransportOrderListPreferences(value) {
  const defaults = defaultTransportOrderListPreferences()
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const iconFilters = source.iconFilters && typeof source.iconFilters === 'object' && !Array.isArray(source.iconFilters) ? source.iconFilters : {}
  const sort = source.sort && typeof source.sort === 'object' && !Array.isArray(source.sort) ? source.sort : {}
  const text = (entry, maxLength = 180) => typeof entry === 'string' ? entry.trim().slice(0, maxLength) : ''
  const date = (entry) => /^\d{4}-\d{2}-\d{2}$/.test(text(entry, 10)) ? text(entry, 10) : ''
  const loadingFrom = date(source.loadingFrom)
  const loadingUntil = date(source.loadingUntil)
  return {
    search: text(source.search),
    trackingFilter: trackingFilterOptions.some((option) => option.value === source.trackingFilter) ? source.trackingFilter : defaults.trackingFilter,
    attentionFilter: ['all', 'action', 'critical'].includes(source.attentionFilter) ? source.attentionFilter : defaults.attentionFilter,
    iconFilters: {
      automationPaused: iconFilters.automationPaused === true,
      mailReview: iconFilters.mailReview === true,
      licensePlate: iconFilters.licensePlate === true,
      stopwatch: attentionSeverities.has(iconFilters.stopwatch) ? iconFilters.stopwatch : '',
      truck: attentionSeverities.has(iconFilters.truck) ? iconFilters.truck : '',
    },
    relation: text(source.relation), loadingFrom, loadingUntil: loadingFrom && loadingUntil && loadingFrom > loadingUntil ? '' : loadingUntil,
    sort: { key: transportOrderListSortKeys.has(sort.key) ? sort.key : null, direction: sort.direction === 'desc' ? 'desc' : 'asc' },
    pageSize: validTransportOrderListPageSize(source.pageSize),
  }
}
export function visibleTransportOrderPage(result, pageSize = transportOrderListPageSize) {
  return { orders: Array.isArray(result?.orders) ? result.orders.slice(0, validTransportOrderListPageSize(pageSize)) : [], hasMore: result?.hasMore === true, nextCursor: typeof result?.nextCursor === 'string' ? result.nextCursor : null }
}
