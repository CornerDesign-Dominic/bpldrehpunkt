export const trackingFilterOptions = [
  { value: 'all', label: 'Alle' }, { value: 'upcoming', label: 'Startet' },
  { value: 'in_progress', label: 'Laufend' }, { value: 'completed', label: 'Ende' },
]

export const defaultTrackingFilter = 'all'
export const transportOrderListPageSize = 25
export const transportOrderListPageSizeOptions = [25, 50, 100]
export const trackingStatusPresentation = {
  upcoming: { label: 'Startet', className: 'upcoming' },
  in_progress: { label: 'Laufend', className: 'in-progress' },
  completed: { label: 'Ende', className: 'completed' },
}

export function trackingStatusForList(value) { return trackingStatusPresentation[value] || trackingStatusPresentation.upcoming }
export function emptyTrackingFilterMessage(filter) { return filter === 'in_progress' ? 'Keine laufenden Sendungsverfolgungen vorhanden.' : filter === 'upcoming' ? 'Keine Sendungsverfolgungen mit Status „Startet“ vorhanden.' : filter === 'completed' ? 'Keine Sendungsverfolgungen mit Status „Ende“ vorhanden.' : 'Keine Transportaufträge gefunden.' }
export function validTransportOrderListPageSize(value) { return transportOrderListPageSizeOptions.includes(Number(value)) ? Number(value) : transportOrderListPageSize }
export function visibleTransportOrderPage(result, pageSize = transportOrderListPageSize) {
  return { orders: Array.isArray(result?.orders) ? result.orders.slice(0, validTransportOrderListPageSize(pageSize)) : [], hasMore: result?.hasMore === true, nextCursor: typeof result?.nextCursor === 'string' ? result.nextCursor : null }
}
