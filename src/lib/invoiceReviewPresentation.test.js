import test from 'node:test'
import assert from 'node:assert/strict'
import { invoiceCheckColor, invoiceCheckCounts, invoicePrimarySections, invoiceTransportChecks, formatInvoiceCheckValue, invoiceDisplayChecks, invoiceReviewDistribution, invoiceAmountDetails, invoiceReviewAlerts } from './invoiceReviewPresentation.js'

test('explicit information/noncritical colors override legacy mismatch status', () => {
  assert.equal(invoiceCheckColor({ status: 'mismatch', color: 'blue' }), 'blue')
  assert.equal(invoiceCheckColor({ status: 'mismatch', color: 'yellow' }), 'yellow')
  assert.equal(invoiceCheckColor({ status: 'unassigned' }), 'red')
  assert.equal(invoiceCheckColor({ status: 'not_supplied' }), 'gray')
})

test('counter counts primary checks once and does not convert empty sections into successes', () => {
  assert.deepEqual(invoiceCheckCounts([{ color: 'green' }, { color: 'green' }, { color: 'yellow' }, { color: 'red' }, { color: 'blue' }, { color: 'gray' }]), { green: 2, yellow: 1, red: 1, blue: 1, gray: 1 })
  assert.deepEqual(invoiceCheckCounts(), { green: 0, yellow: 0, red: 0, blue: 0, gray: 0 })
})

test('saved version-one reports retain header and total checks without duplicate rendering', () => {
  const number = { key: 'number' }, date = { key: 'date' }, sum = { key: 'positionSum' }
  assert.deepEqual(invoicePrimarySections({ totals: { checks: [sum, number, date] } }), { header: [number, date], amounts: [sum], payment: [] })
  assert.deepEqual(invoicePrimarySections({ headerChecks: [number], paymentChecks: [date], totals: { checks: [sum] } }), { header: [number], amounts: [sum], payment: [date] })
})

test('saved unassigned transports with an empty check list retain a red assignment result', () => {
  const checks = invoiceTransportChecks({ ta: '260200202', status: 'unassigned', checks: [], message: 'Auftrag nicht gefunden.' })
  assert.equal(checks.length, 1)
  assert.equal(checks[0].key, 'ta')
  assert.equal(checks[0].message, 'Auftrag nicht gefunden.')
  assert.equal(invoiceCheckCounts(checks).red, 1)
  assert.equal(invoiceCheckCounts(checks).gray, 0)
  const current = [{ key: 'ta', color: 'yellow', status: 'unknown' }]
  assert.equal(invoiceTransportChecks({ status: 'unassigned', checks: current }), current)
  assert.deepEqual(invoiceTransportChecks({ status: 'unknown', checks: [] }), [])
})

test('invoice and reference amounts preserve their own currencies rather than sharing one label', () => {
  const check = { key: 'net', actualCurrency: 'PLN', expectedCurrency: 'EUR' }
  const actual = formatInvoiceCheckValue(check, 50000, { currency: 'PLN', side: 'actual' })
  const expected = formatInvoiceCheckValue(check, 50000, { currency: 'PLN', side: 'expected' })
  assert.match(actual, /500,00.*PLN/)
  assert.match(expected, /500,00.*€/)
  assert.doesNotMatch(actual, /€|EUR/)
  assert.doesNotMatch(expected, /PLN/)
})

test('legacy amounts inherit invoice currency while explicitly unknown reference currency stays open', () => {
  assert.match(formatInvoiceCheckValue({ key: 'net' }, 50000, { currency: 'EUR', side: 'expected' }), /500,00.*€/)
  const unknown = formatInvoiceCheckValue({ key: 'net', expectedCurrency: null }, 50000, { currency: 'EUR', side: 'expected' })
  assert.match(unknown, /500,00.*Währung offen/)
  assert.doesNotMatch(unknown, /€|EUR/)
  assert.equal(formatInvoiceCheckValue({ key: 'net' }, null, { currency: 'EUR' }), '—')
  assert.match(formatInvoiceCheckValue({ key: 'foreignVat' }, 0, { currency: 'EUR' }), /0,00.*€/)
})

test('main percentage excludes supplementary checks and rounds to exactly 100 percent', () => {
  const result = invoiceReviewDistribution([
    { key: 'issuer', color: 'green' }, { key: 'net', color: 'yellow' }, { key: 'recipientAddress', color: 'red' },
    { key: 'loadingDate-0', color: 'red' }, { key: 'custom', secondary: true, color: 'green' }, { key: 'date', color: 'blue' },
  ])
  assert.equal(result.total, 3)
  assert.deepEqual(result.counts, { green: 1, yellow: 1, red: 1 })
  assert.deepEqual(result.percentages, { green: 34, yellow: 33, red: 33 })
  assert.deepEqual(invoiceReviewDistribution([]), { total: 0, counts: { green: 0, yellow: 0, red: 0 }, percentages: { green: 0, yellow: 0, red: 0 } })
})

test('invoice score does not count metadata and repeated transport identity or aggregate net twice', () => {
  const display = invoiceDisplayChecks({
    headerChecks: [{ key: 'number', color: 'green' }, { key: 'issuer', color: 'green' }],
    totals: { checks: [{ key: 'netTotal', color: 'green' }] },
    transports: [{ ta: '261000561', checks: [{ key: 'issuer', color: 'green' }, { key: 'net', color: 'green' }, { key: 'ta', color: 'green' }, { key: 'loadingCity-0', color: 'blue' }] }],
  })
  assert.deepEqual(display.primary.map(check => check.key), ['issuer', 'netTotal', 'ta'])
  assert.deepEqual(display.secondary.map(check => check.key), ['number', 'loadingCity-0'])
  assert.equal(invoiceReviewDistribution(display.primary).total, 3)
})

test('multi-order invoices retain individual net mismatches even if aggregate amounts match', () => {
  const display = invoiceDisplayChecks({
    totals: { checks: [{ key: 'netTotal', color: 'green' }] },
    transports: [{ ta: '261000561', checks: [{ key: 'net', color: 'red' }] }, { ta: '261000562', checks: [{ key: 'net', color: 'red' }] }],
  })
  assert.equal(invoiceReviewDistribution(display.primary).counts.red, 2)
  assert.equal(new Set(display.primary.map(check => check.displayId)).size, 3)
})

test('unresolved candidate alternatives never become additional successful main checks', () => {
  const display = invoiceDisplayChecks({ transports: [{ ta: '', checks: [{ key: 'ta', color: 'yellow' }], candidates: [{ ta: '261000561', checks: [{ key: 'net', color: 'green' }] }] }] })
  assert.deepEqual(invoiceReviewDistribution(display.primary).counts, { green: 0, yellow: 1, red: 0 })
})

test('a missing required invoice number stays visible in main checks while a recognized number is supplementary', () => {
  const missing = invoiceDisplayChecks({ headerChecks: [{ key: 'number', color: 'yellow', actual: null }] })
  const present = invoiceDisplayChecks({ headerChecks: [{ key: 'number', color: 'gray', actual: 'RE4408' }] })
  assert.equal(missing.primary.length, 1)
  assert.equal(invoiceReviewDistribution(missing.primary).counts.yellow, 1)
  assert.equal(present.primary.length, 0)
  assert.equal(present.secondary.length, 1)
})

test('a red single-position net comparison replaces an unresolved aggregate without a double vote', () => {
  const display = invoiceDisplayChecks({
    totals: { checks: [{ key: 'netTotal', color: 'yellow', actual: 23000, expected: null }] },
    transports: [{ ta: '261000561', checks: [{ key: 'net', color: 'red', actual: 23000, expected: 25000 }] }],
  })
  assert.equal(display.primary.length, 1)
  assert.equal(display.primary[0].color, 'red')
  assert.equal(display.primary[0].expected, 25000)
  assert.deepEqual(invoiceReviewDistribution(display.primary).counts, { green: 0, yellow: 0, red: 1 })
})

test('secondary contradictions remain available without changing the main percentage', () => {
  const display = invoiceDisplayChecks({ headerChecks: [{ key: 'deliveryDate', color: 'red', actual: '2026-10-28', expected: '2028-10-28' }, { key: 'issuer', color: 'green' }] })
  assert.equal(display.secondary[0].color, 'red')
  assert.equal(display.secondary[0].key, 'deliveryDate')
  assert.deepEqual(invoiceReviewDistribution(display.primary).percentages, { green: 100, yellow: 0, red: 0 })
})

test('deduplicating invoice and transport identities never hides a transport contradiction', () => {
  const display = invoiceDisplayChecks({
    headerChecks: [{ key: 'issuer', color: 'yellow', expected: null }],
    transports: [{ ta: '261000561', checks: [{ key: 'issuer', color: 'red', expected: 'Different carrier' }] }],
  })
  assert.equal(display.primary.length, 1)
  assert.equal(display.primary[0].color, 'red')
  assert.equal(display.primary[0].expected, 'Different carrier')
})

test('legacy single-invoice financial checks contribute only net, VAT and total amount', () => {
  const invoice = { headerChecks: [], totals: { checks: [
    { key: 'netTotal', color: 'green' }, { key: 'vatTotal', color: 'yellow' }, { key: 'grossTotal', color: 'yellow' },
    { key: 'positionSum', color: 'green' }, { key: 'taxSum', color: 'green' }, { key: 'foreignVat', color: 'green' },
  ] } }
  const display = invoiceDisplayChecks(invoice)
  assert.deepEqual(display.primary.map(check => check.key), ['netTotal', 'vatTotal', 'grossTotal'])
  assert.deepEqual(invoiceReviewDistribution(display.primary).counts, { green: 1, yellow: 2, red: 0 })
  assert.equal(invoiceAmountDetails(invoice).length, 6)
})

test('legacy internal contradictions remain red on their related amount without extra votes', () => {
  const invoice = { headerChecks: [], totals: { checks: [
    { key: 'netTotal', color: 'green', actual: 23000, expected: 23000 }, { key: 'vatTotal', color: 'yellow', actual: 4370, expected: null }, { key: 'grossTotal', color: 'green', actual: 27370, expected: 27370 },
    { key: 'positionSum', color: 'red', actual: 24000, expected: 23000 }, { key: 'taxSum', color: 'red', actual: 28370, expected: 27370 }, { key: 'foreignVat', color: 'red', actual: 4370, expected: 0 },
  ] } }
  const display = invoiceDisplayChecks(invoice)
  assert.equal(display.primary.length, 3)
  assert.deepEqual(display.primary.map(check => check.expected), [24000, 0, 28370])
  assert.deepEqual(display.primary.map(check => check.comparisonOrigin), ['invoice_positions', 'business_rule', 'invoice_arithmetic'])
  assert.deepEqual(invoiceReviewDistribution(display.primary).counts, { green: 0, yellow: 0, red: 3 })
  assert.equal(invoiceAmountDetails(invoice).filter(check => check.color === 'red').length, 3)
  assert.equal(invoice.totals.checks[0].color, 'green', 'saved legacy report stays immutable')
})

test('new consolidated amount rows retain backend results while detail checks never add votes', () => {
  const details = [{ key: 'netDatabase', color: 'green' }, { key: 'positionSum', color: 'red' }]
  const invoice = { totals: { checks: [{ key: 'netTotal', color: 'red' }, { key: 'vatTotal', color: 'green' }, { key: 'grossTotal', color: 'yellow' }], detailChecks: details } }
  const display = invoiceDisplayChecks(invoice)
  assert.equal(invoiceAmountDetails(invoice), details)
  assert.deepEqual(invoiceReviewDistribution(display.primary).counts, { green: 1, yellow: 1, red: 1 })
})

test('explicit duplicate suspicion and confirmed amount alerts retain their distinct severity', () => {
  const invoice = { currency: 'EUR', alerts: [
    { kind: 'possible_duplicate', color: 'yellow', externalNumber: 'RE4408', ta: '261000561' },
    { kind: 'amount', color: 'red', checkKey: 'netTotal', actual: 25000, expected: 23000, currency: 'EUR' },
  ] }
  const alerts = invoiceReviewAlerts(invoice)
  assert.deepEqual(alerts.map(alert => [alert.kind, alert.color]), [['possible_duplicate', 'yellow'], ['amount', 'red']])
  assert.equal(alerts[1].key, 'netTotal')
  assert.equal(alerts[0].externalNumber, 'RE4408')
  assert.match(formatInvoiceCheckValue({ ...alerts[1], format: 'money' }, alerts[1].actual), /250,00.*€/)
})

test('legacy alert fallback never interprets a cost-position link as a duplicate', () => {
  const invoice = { currency: 'EUR', headerChecks: [{ key: 'billingStatus', color: 'yellow', actual: '1 Belegbezüge vorhanden' }], notices: [{ message: 'Kostenposition ist mit einem DyCoS-Beleg verknüpft.' }] }
  assert.deepEqual(invoiceReviewAlerts(invoice), [])
  assert.deepEqual(invoiceReviewAlerts({ ...invoice, headerChecks: [{ key: 'billingStatus', color: 'red' }] }), [])
})

test('legacy alerts use monetary primary results without double-counting a single transport net', () => {
  const invoice = { currency: 'EUR', totals: { checks: [{ key: 'netTotal', color: 'red', actual: 25000, expected: 23000 }] }, transports: [{ ta: '261000561', checks: [{ key: 'net', color: 'red', actual: 25000, expected: 23000 }] }] }
  const alerts = invoiceReviewAlerts(invoice)
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].kind, 'amount')
  assert.equal(alerts[0].actual, 25000)
  assert.equal(alerts[0].expected, 23000)
  assert.equal(alerts[0].ta, '261000561')
  assert.equal(invoice.totals.checks[0].color, 'red')
})

test('legacy collective invoices retain TA-specific amount mismatch alerts and ignore unresolved amounts', () => {
  const alerts = invoiceReviewAlerts({ currency: 'EUR', transports: [
    { ta: '261000561', checks: [{ key: 'net', color: 'red', actual: 10000, expected: 11000 }] },
    { ta: '261000562', checks: [{ key: 'net', color: 'red', actual: 10000, expected: 11000 }] },
    { ta: '261000563', checks: [{ key: 'net', color: 'yellow', actual: 10000, expected: null }] },
  ] })
  assert.deepEqual(alerts.map(alert => alert.ta), ['261000561', '261000562'])
})

test('declared alerts are authoritative and duplicate lines are collapsed without relying on prose', () => {
  const mismatch = { totals: { checks: [{ key: 'netTotal', color: 'red', actual: 2, expected: 1 }] } }
  assert.deepEqual(invoiceReviewAlerts({ ...mismatch, alerts: [] }), [])
  const alert = { kind: 'duplicate', color: 'red', externalNumber: 'RE4408', message: 'An arbitrary provider explanation' }
  assert.equal(invoiceReviewAlerts({ alerts: [alert, { ...alert, message: 'Different explanation for same invoice' }] }).length, 1)
})

test('malformed monetary alerts are not shown as confirmed numerical differences and zero is retained', () => {
  const alerts = invoiceReviewAlerts({ alerts: [
    { kind: 'amount', color: 'red', actual: null, expected: 23000 },
    { kind: 'amount', color: 'yellow', actual: 23000, expected: 22000 },
    { kind: 'duplicate', color: 'yellow' },
    { kind: 'amount', color: 'red', actual: 0, expected: 4370, currency: 'EUR', checkKey: 'vatTotal' },
  ] })
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].actual, 0)
  assert.equal(alerts[0].key, 'vatTotal')
})
