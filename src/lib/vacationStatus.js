export const MAIN_VACATION_STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'withdrawn']
export const VACATION_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn']

export function getVacationRequestKind(item) {
  if (item?.requestKind === 'cancellation' || item?.cancellationRequest) return 'cancellation'
  return item?.vacationId || item?.originalRequestId || item?.changeRequest ? 'change' : 'vacation'
}

export function isMainVacation(item) {
  return getVacationRequestKind(item) === 'vacation'
}

export function getVacationId(item) {
  return item?.vacationId || item?.originalRequestId || item?.id || ''
}

export function getMainVacationStatus(vacation) {
  if (MAIN_VACATION_STATUSES.includes(vacation?.mainStatus)) return vacation.mainStatus
  if (MAIN_VACATION_STATUSES.includes(vacation?.status)) return vacation.status
  return 'pending'
}

export function getVacationRequestStatus(request) {
  if (VACATION_REQUEST_STATUSES.includes(request?.requestStatus)) return request.requestStatus
  if (request?.status === 'change_requested' || request?.status === 'cancellation_requested') return 'pending'
  if (VACATION_REQUEST_STATUSES.includes(request?.status)) return request.status
  return 'pending'
}

export function requestStatusLabel(status) {
  return ({ pending: 'Ausstehend', approved: 'Genehmigt', rejected: 'Abgelehnt', withdrawn: 'Zurückgezogen' })[status] || 'Ausstehend'
}

export function mainStatusLabel(status) {
  return ({ pending: 'Ausstehend', approved: 'Genehmigt', rejected: 'Abgelehnt', cancelled: 'Storniert', withdrawn: 'Zurückgezogen' })[status] || 'Ausstehend'
}

export function latestVacationRequest(requests) {
  return [...requests].sort((left, right) => {
    const leftTime = left?.createdAt?.toMillis?.() || Date.parse(left?.submittedAt || '') || 0
    const rightTime = right?.createdAt?.toMillis?.() || Date.parse(right?.submittedAt || '') || 0
    return rightTime - leftTime || String(right?.id || '').localeCompare(String(left?.id || ''))
  })[0] || null
}
