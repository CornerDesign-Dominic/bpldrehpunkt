const sortKeys = new Set(['externalNumber', 'relation', 'loadingFrom', 'unloadingUntil', 'customer', 'carrier'])
export function normalizeOrderListPreferences(value = {}) {
  const text = (field) => typeof field === 'string' ? field.slice(0, 180) : ''
  const date = (field) => /^\d{4}-\d{2}-\d{2}$/.test(text(field)) ? field : ''
  const loadingFrom = date(value.loadingFrom)
  const loadingUntil = date(value.loadingUntil)
  return {
    search: text(value.search), relation: text(value.relation), loadingFrom,
    loadingUntil: loadingUntil && loadingFrom && loadingUntil < loadingFrom ? '' : loadingUntil,
    pageSize: [25, 50, 100].includes(value.pageSize) ? value.pageSize : 25,
    sort: { key: sortKeys.has(value.sort?.key) ? value.sort.key : 'externalNumber', direction: value.sort?.direction === 'asc' ? 'asc' : 'desc' },
  }
}

export const orderListStorageKey = (uid) => `drehpunkt.order-record-list.${uid}`
