import test from 'node:test'
import assert from 'node:assert/strict'
import { invoiceCheckColor, invoiceCheckCounts, invoicePrimarySections, invoiceTransportChecks, formatInvoiceCheckValue } from './invoiceReviewPresentation.js'

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
