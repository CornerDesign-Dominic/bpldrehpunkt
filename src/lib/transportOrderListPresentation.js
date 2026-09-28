export const trackingFilterOptions = [
  { value: 'all', label: 'Alle' }, { value: 'upcoming', label: 'Bevorstehend' },
  { value: 'preparation', label: 'Vorbereitung' }, { value: 'in_progress', label: 'Laufend' },
  { value: 'aftercare', label: 'Abschlussphase' }, { value: 'completed', label: 'Durchgeführt' },
]

export const defaultTrackingFilter = 'all'
export const transportOrderListPageSize = 100
export const trackingStatusPresentation = {
  upcoming: { label: 'Bevorstehend', className: 'upcoming' },
  preparation: { label: 'Vorbereitung', className: 'preparation' },
  in_progress: { label: 'Laufend', className: 'in-progress' },
  aftercare: { label: 'Abschlussphase', className: 'aftercare' },
  completed: { label: 'Durchgeführt', className: 'completed' },
}

export function trackingStatusForList(value) { return trackingStatusPresentation[value] || trackingStatusPresentation.upcoming }
export function emptyTrackingFilterMessage(filter) { return filter === 'in_progress' ? 'Keine laufenden Sendungsverfolgungen vorhanden.' : filter === 'preparation' ? 'Keine Sendungsverfolgungen in Vorbereitung vorhanden.' : filter === 'aftercare' ? 'Keine Sendungsverfolgungen in Abschlussphase vorhanden.' : filter === 'upcoming' ? 'Keine bevorstehenden Sendungsverfolgungen vorhanden.' : filter === 'completed' ? 'Keine durchgeführten Sendungsverfolgungen vorhanden.' : 'Keine Transportaufträge gefunden.' }
export function visibleTransportOrderPage(result) {
  return { orders: Array.isArray(result?.orders) ? result.orders.slice(0, transportOrderListPageSize) : [], hasMore: result?.hasMore === true, nextCursor: typeof result?.nextCursor === 'string' ? result.nextCursor : null }
}
