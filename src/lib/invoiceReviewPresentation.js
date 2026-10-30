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
