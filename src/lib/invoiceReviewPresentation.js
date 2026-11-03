export const invoiceReviewColors = ['green', 'yellow', 'red', 'blue', 'gray']
const moneyKeys = new Set(['net', 'netTotal', 'vat', 'vatTotal', 'gross', 'grossTotal', 'positionSum', 'taxSum', 'bookedAmount', 'foreignVat'])

export function formatInvoiceCheckValue(check, data, { language = 'de', currency, side = 'actual' } = {}) {
  if (data === null || data === undefined || data === '') return '—'
  const baseKey = check.key?.split('-')[0]
  const money = check.format === 'money' || check.unit === 'cents' || moneyKeys.has(baseKey) || /\(Cent\)/i.test(check.label || '')
  if (money && typeof data === 'number') {
    const locale = language === 'en' ? 'en-GB' : 'de-DE'
    const currencyField = side === 'expected' ? 'expectedCurrency' : 'actualCurrency'
    // Explicitly unknown reference currency must not inherit the invoice's
    // currency, especially when different orders use different currencies.
    const selectedCurrency = Object.hasOwn(check, currencyField) ? check[currencyField] : check.currency || currency
    if (/^[A-Z]{3}$/.test(selectedCurrency || '')) return new Intl.NumberFormat(locale, { style: 'currency', currency: selectedCurrency }).format(data / 100)
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(data / 100)} (${language === 'en' ? 'currency unknown' : 'Währung offen'})`
  }
  if (Array.isArray(data)) return data.join(' · ')
  if (typeof data === 'object') return JSON.stringify(data)
  return String(data)
}

export function invoiceCheckColor(check = {}) {
  if (invoiceReviewColors.includes(check.color)) return check.color
  return ({ match: 'green', mismatch: 'red', unknown: 'yellow', unassigned: 'red', not_supplied: 'gray', empty: 'gray', info: 'blue' })[check.status] || 'gray'
}

export function invoiceCheckCounts(checks = []) {
  const counts = Object.fromEntries(invoiceReviewColors.map(color => [color, 0]))
  for (const check of checks) counts[invoiceCheckColor(check)]++
  return counts
}

export function invoicePrimarySections(invoice = {}) {
  const totals = invoice.totals?.checks || []
  const legacyHeaderKeys = new Set(['number', 'date'])
  return {
    header: invoice.headerChecks || totals.filter(check => legacyHeaderKeys.has(check.key)),
    amounts: invoice.headerChecks ? totals : totals.filter(check => !legacyHeaderKeys.has(check.key)),
    payment: invoice.paymentChecks || [],
  }
}

export function invoiceTransportChecks(transport = {}) {
  if (transport.checks?.length) return transport.checks
  if (transport.status !== 'unassigned') return transport.checks || []
  return [{ key: 'ta', label: 'TA-Zuordnung', actual: transport.ta || null, expected: null, status: 'unassigned', color: 'red', message: transport.message || 'Keine eindeutige Zuordnung zu einem Auftrag.' }]
}

const amountDetailKeys = new Set(['positionSum', 'taxSum', 'foreignVat'])
const supplementaryKeys = new Set(['date', 'dueDate', 'serviceDate', 'deliveryDate', 'loadingDate', 'unloadingDate', 'loadingCity', 'unloadingCity', 'licensePlate', 'ocr', 'ocrUncertain', 'ocrDifference', 'lookup', ...amountDetailKeys])

export function invoiceAmountDetails(invoice = {}) {
  if (invoice.totals?.detailChecks) return invoice.totals.detailChecks
  const checks = invoicePrimarySections(invoice).amounts
  return checks.some(check => amountDetailKeys.has(check.key)) ? checks : []
}

function invoiceAmountResults(invoice, amounts) {
  const checks = amounts.filter(check => !amountDetailKeys.has(check.key))
  // Older immutable reports stored internal arithmetic/tax checks as extra
  // main rows. Fold their contradictions into the corresponding amount while
  // retaining the original values and full check in the amount disclosure.
  if (invoice.totals?.detailChecks) return checks
  const affectedBy = { netTotal: 'positionSum', vatTotal: 'foreignVat', grossTotal: 'taxSum' }
  return checks.map(check => {
    const detail = amounts.find(item => item.key === affectedBy[check.key] && invoiceCheckColor(item) === 'red')
    return detail ? { ...check, color: 'red', status: 'mismatch', expected: detail.key === 'foreignVat' ? detail.expected : detail.actual, expectedCurrency: check.actualCurrency || detail.actualCurrency || invoice.currency || null, comparisonOrigin: ({ positionSum: 'invoice_positions', taxSum: 'invoice_arithmetic', foreignVat: 'business_rule' })[detail.key], detailKeys: [detail.key] } : check
  })
}

export function invoiceCheckIsSecondary(check = {}) {
  return check.secondary === true || check.scope === 'secondary' || check.key === 'number' && invoiceCheckColor(check) !== 'yellow' || supplementaryKeys.has(check.key?.split('-')[0]) || check.key?.startsWith('warning-')
}

// Build one set of invoice-level results. Repeated header comparisons on every
// transport are detail, not additional votes in the overall percentage.
export function invoiceDisplayChecks(invoice = {}) {
  const sections = invoicePrimarySections(invoice)
  const amounts = invoiceAmountResults(invoice, sections.amounts)
  const primary = [], secondary = [], seen = new Set()
  const add = (check, transport) => {
    const base = check.key?.split('-')[0] || 'check'
    const supplemental = invoiceCheckIsSecondary(check)
    const global = ['issuer', 'recipient', 'issuerVatId', 'recipientVatId', 'recipientAddress', 'currency'].includes(base)
    const id = global || !transport ? base : `${transport.ta || transport.orderId || `unassigned-${transport.displayIndex}`}:${check.key}`
    if (seen.has(id)) {
      // Conflicting transport references must not be hidden by a broader
      // invoice-level comparison that could not choose one reference value.
      const existing = primary.find(item => item.displayId === id)
      if (global && invoiceCheckColor(check) === 'red' && existing && invoiceCheckColor(existing) !== 'red') Object.assign(existing, check)
      return
    }
    seen.add(id)
    const item = { ...check, displayId: id, ...(transport ? { transportTa: transport.ta || null } : {}) }
    if (supplemental || ['gray', 'blue'].includes(invoiceCheckColor(check))) secondary.push(item)
    else primary.push(item)
  }
  const aggregateNet = amounts.some(check => check.key === 'netTotal')
  const transports = invoice.transports || []
  const singleNet = transports.length === 1 ? invoiceTransportChecks(transports[0]).find(check => check.key === 'net') : null
  const severity = check => ({ red: 3, yellow: 2, green: 1 })[invoiceCheckColor(check)] || 0
  for (const check of [...sections.header, ...amounts, ...sections.payment]) {
    // Keep the more severe result when one transport is also represented by
    // the aggregate comparison. A red position must never disappear in a
    // yellow invoice-level result, or count as a second vote for the same net.
    add(check.key === 'netTotal' && singleNet && severity(singleNet) > severity(check) ? { ...singleNet, key: 'netTotal', label: check.label } : check)
  }
  for (const [index, entry] of transports.entries()) {
    const transport = { ...entry, displayIndex: index }
    for (const check of invoiceTransportChecks(transport)) {
      if (check.key === 'net' && aggregateNet && transports.length === 1) continue
      add(check, transport)
    }
  }
  return { primary, secondary }
}

export function invoiceReviewDistribution(checks = []) {
  const counts = { green: 0, yellow: 0, red: 0 }
  for (const check of checks) {
    const color = invoiceCheckColor(check)
    if (!invoiceCheckIsSecondary(check) && Object.hasOwn(counts, color)) counts[color]++
  }
  const total = counts.green + counts.yellow + counts.red
  const colors = Object.keys(counts)
  const percentages = Object.fromEntries(colors.map(color => [color, total ? Math.floor(counts[color] * 100 / total) : 0]))
  // Largest-remainder rounding keeps the displayed segments at exactly 100%.
  let remainder = total ? 100 - Object.values(percentages).reduce((sum, value) => sum + value, 0) : 0
  for (const color of colors.toSorted((a, b) => (counts[b] * 100 / total % 1) - (counts[a] * 100 / total % 1))) {
    if (remainder-- > 0) percentages[color]++
  }
  return { counts, percentages, total }
}
