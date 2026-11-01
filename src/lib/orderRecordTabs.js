export const orderRecordTabs = ['overview', 'transport', 'partners', 'finance', 'tracking', 'history']

export function orderRecordTab(value) {
  return orderRecordTabs.includes(value) ? value : 'overview'
}

export function orderRecordPath(orderId, tab = 'overview') {
  const path = `/transportauftraege/${encodeURIComponent(orderId)}`
  return orderRecordTab(tab) === 'overview' ? path : `${path}?tab=${orderRecordTab(tab)}`
}

export function legacyTrackingDetailPath(orderId, search = '', hash = '') {
  const params = new URLSearchParams(search)
  params.set('tab', 'tracking')
  return `/transportauftraege/${encodeURIComponent(orderId)}?${params}${hash}`
}

export function isTrackingRecord(pathname, search = '') {
  return /^\/transportauftraege\/[^/]+$/.test(pathname) && pathname !== '/transportauftraege/import' && new URLSearchParams(search).get('tab') === 'tracking'
}
