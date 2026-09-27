export const trackingFilterOptions = [
  { value: 'all', label: 'Alle' }, { value: 'upcoming', label: 'Bevorstehend' },
  { value: 'active', label: 'Laufend' }, { value: 'completed', label: 'Abgeschlossen' },
]

export const defaultTrackingFilter = 'active'
export const transportOrderListPageSize = 100
export const trackingStatusPresentation = {
  upcoming: { label: 'Bevorstehend', className: 'upcoming' },
  active: { label: 'Laufend', className: 'active' },
  completed: { label: 'Abgeschlossen', className: 'completed' },
}

export function trackingStatusForList(value) { return trackingStatusPresentation[value] || trackingStatusPresentation.upcoming }
export function emptyTrackingFilterMessage(filter) { return filter === 'active' ? 'Keine laufenden Sendungsverfolgungen vorhanden.' : filter === 'upcoming' ? 'Keine bevorstehenden Sendungsverfolgungen vorhanden.' : filter === 'completed' ? 'Keine abgeschlossenen Sendungsverfolgungen vorhanden.' : 'Keine Transportaufträge gefunden.' }
export function visibleTransportOrderPage(result) {
  return { orders: Array.isArray(result?.orders) ? result.orders.slice(0, transportOrderListPageSize) : [], hasMore: result?.hasMore === true, nextCursor: typeof result?.nextCursor === 'string' ? result.nextCursor : null }
}
