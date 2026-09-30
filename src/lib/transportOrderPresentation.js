const text = (value) => typeof value === 'string' ? value.trim() : ''
const sortCollator = new Intl.Collator('de-DE', { numeric: true, sensitivity: 'base' })

const orderSortValues = {
  externalNumber: (order) => order.externalNumber,
  tracking: (order) => order.tracking?.status,
  customer: (order) => order.imported?.customer?.name,
  carrier: (order) => order.imported?.carrier?.originalName,
  loading: (order) => order.imported?.loading?.city,
  loadingFrom: (order) => order.imported?.loading?.window?.from,
  unloading: (order) => order.imported?.unloading?.city,
  unloadingUntil: (order) => order.imported?.unloading?.window?.until,
  relation: (order) => order.imported?.relation,
}

export function formatTransportOrderWindow(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  return match ? `${match[3]}.${match[2]}.${match[1]}, ${match[4]}:${match[5]}` : '—'
}

export function sortTransportOrders(orders, sort) {
  const valueFor = orderSortValues[sort?.key]
  if (!valueFor) return orders
  return [...orders].sort((left, right) => {
    const leftValue = text(valueFor(left))
    const rightValue = text(valueFor(right))
    if (!leftValue || !rightValue) {
      if (leftValue !== rightValue) return leftValue ? -1 : 1
    }
    const compared = sortCollator.compare(leftValue, rightValue)
    return (sort.direction === 'desc' ? -compared : compared) || sortCollator.compare(text(left.externalNumber), text(right.externalNumber))
  })
}

export function transportOrderPath(transportOrderId) {
  return `/transportauftraege/${encodeURIComponent(transportOrderId)}`
}

export function transportOrderDocumentTitle(externalNumber) {
  return text(externalNumber) ? `Drehpunkt · ${text(externalNumber)}` : 'Drehpunkt · Transportauftrag'
}
