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
  if (!match) return '—'
  const [, , month, day, hour, minute] = match
  const time = minute === '00' ? `${hour} Uhr` : `${hour}:${minute} Uhr`
  return `${day}.${month}. · ${time}`
}

export function formatTransportOrderWindowRange(window, language = 'de') {
  // Retain the source's local clock, as in the existing single-time display.
  // An unresolved clock without its own date is not a confirmed boundary.
  const parse = value => {
    const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)/)
    return match ? { date: match[0].slice(0, 10), year: match[1], month: match[2], day: match[3], time: match[4] } : null
  }
  const from = parse(window?.from), until = parse(window?.until)
  if (!from && !until) return '—'
  const differentYears = from && until && from.year !== until.year
  const date = value => `${value.day}.${value.month}.${differentYears ? value.year : ''}`
  const suffix = language === 'en' ? '' : ' Uhr'
  if (!from) return `${date(until)} · ${language === 'en' ? 'until' : 'bis'} ${until.time}${suffix}`
  if (!until) return `${date(from)} · ${language === 'en' ? 'from' : 'ab'} ${from.time}${suffix}`
  if (from.date !== until.date) return `${date(from)} · ${from.time} – ${date(until)} · ${until.time}${suffix}`
  return `${date(from)} · ${from.time === until.time ? from.time : `${from.time}–${until.time}`}${suffix}`
}

export function formatTransportOrderRelation(value) {
  const relation = text(value).replace(/^\d+\s+/, '')
  return relation || '—'
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

export function transportOrderFinancialDocumentLabels(document = {}) {
  const business = { customer_invoice: 'Kundenrechnung', customer_invoice_cancellation: 'Stornorechnung Kunde', customer_credit_note: 'Kundengutschrift', carrier_invoice: 'Unternehmerrechnung', carrier_credit_note: 'Unternehmergutschrift' }
  const internal = { invoice: 'Rechnung', invoice_cancellation: 'Stornorechnung', credit_note: 'Gutschrift', proforma_invoice: 'Proforma-Rechnung', proforma_credit_note: 'Proforma-Gutschrift' }
  const issuer = { us: 'Von uns', partner: 'Vom Geschäftspartner' }
  return { business: Object.hasOwn(business, document.businessType) ? business[document.businessType] : 'Belegzuordnung offen', internal: Object.hasOwn(internal, document.internalType) ? internal[document.internalType] : 'Unbekannt', issuer: Object.hasOwn(issuer, document.issuer) ? issuer[document.issuer] : null }
}

export function formatTransportOrderDocumentDate(value, language = 'de') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return '—'
  const date = new Date(`${value}T12:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '—'
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date)
}
