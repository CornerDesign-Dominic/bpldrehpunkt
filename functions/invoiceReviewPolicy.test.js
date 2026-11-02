import test from 'node:test'
import assert from 'node:assert/strict'
import { compareInvoiceTransport, invoiceTotals, invoiceHeaderChecks, invoicePaymentChecks, recipientAddressCheck, invoiceNotices } from './invoiceReviewPolicy.js'
const value = value => ({ value, quote: value })
const bill = (patch = {}) => ({ number: value('RG-1'), date: value('2026-10-01'), issuer: value('Carrier GmbH'), issuerVatId: value('DE123456789'), issuerCountry: value('Deutschland'), recipient: value('Brennpunkt Logistik GmbH'), recipientVatId: value('DE987654321'), recipientAddress: value('Reinshagenstraße, 42369 Wuppertal'), currency: value('EUR'), netTotal: value('500,00'), vatTotal: value('95,00'), grossTotal: value('595,00'), transports: [{ ta: value('260000001'), net: value('500,00') }], ...patch })
const imported = { carrier: { originalName: 'Carrier GmbH' }, financial: { currency: 'EUR', costPositions: [{ amountNet: 500 }] }, loading: { city: 'Berlin' }, unloading: { city: 'Hamburg' } }
const reference = { ta: '260000001', imported, carrierVatId: 'DE123456789', carrierCountry: 'DE', financial: { vatCents: 9500, grossCents: 59500 }, payment: { days: 30, basis: 'invoice_date', dayType: 'calendar', text: '30 Tage ab Rechnungsdatum' }, billingEvidence: [] }
const company = { legalName: 'Brennpunkt Logistik GmbH', vatId: 'DE987654321' }

test('net, VAT and gross compare exact database cents; missing references are yellow, never implicit zero', () => {
  const complete = invoiceTotals(bill(), { references: [reference] })
  for (const key of ['netTotal', 'vatTotal', 'grossTotal', 'positionSum', 'taxSum']) assert.equal(complete.checks.find(check => check.key === key).color, 'green')
  const missing = invoiceTotals(bill({ vatTotal: value('') }), { references: [{ ...reference, financial: { vatCents: null, grossCents: null } }] })
  assert.equal(missing.checks.find(check => check.key === 'vatTotal').color, 'yellow')
  assert.equal(missing.checks.find(check => check.key === 'grossTotal').color, 'yellow')
  const wrong = invoiceTotals(bill({ netTotal: value('501,00') }), { references: [reference] })
  assert.equal(wrong.checks.find(check => check.key === 'netTotal').color, 'red')
})

test('foreign positive VAT is a red business review rule only with supported country evidence', () => {
  const foreign = invoiceTotals(bill(), { references: [{ ...reference, carrierCountry: 'PL' }] })
  assert.equal(foreign.checks.find(check => check.key === 'foreignVat').color, 'red')
  assert.match(foreign.checks.find(check => check.key === 'foreignVat').message, /Betriebliche Prüfregel/)
  const unknown = invoiceTotals(bill({ issuerCountry: value('') }), { references: [{ ...reference, carrierCountry: null }] })
  assert.equal(unknown.checks.find(check => check.key === 'foreignVat').color, 'yellow')
})

test('different currencies never produce a false red amount comparison; secondary facts remain blue', () => {
  const invoice = bill({ currency: value('PLN') })
  const row = { ...invoice.transports[0], licensePlate: value('OTHER'), loadingCity: value('Anderer Ort') }
  const result = compareInvoiceTransport({ rows: [row], invoice, imported, company, carrierVatId: reference.carrierVatId })
  assert.equal(result.checks.find(check => check.key === 'net').color, 'yellow')
  assert.equal(result.checks.find(check => check.key === 'currency').color, 'blue')
  assert.equal(result.checks.find(check => check.key === 'licensePlate-0').color, 'blue')
  assert.equal(result.checks.find(check => check.key === 'unloadingCity-0').color, 'gray')
  const totals = invoiceTotals(invoice, { references: [reference] })
  for (const key of ['netTotal', 'vatTotal', 'grossTotal']) assert.equal(totals.checks.find(check => check.key === key).color, 'yellow')
})

test('current address tolerates two spelling errors, old and future/foreign addresses remain yellow', () => {
  assert.equal(recipientAddressCheck(bill()).color, 'green')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagnstrasse 1, 42369 Wuppertal') })).color, 'green')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagenstr. 1, D-42369 Wuppertal') })).color, 'green')
  const old = recipientAddressCheck(bill({ recipientAddress: value('Heinz-Fangmann-Straße, 42369 Wuppertal') }))
  assert.equal(old.color, 'yellow'); assert.match(old.message, /Frühere/)
  assert.match(recipientAddressCheck(bill({ recipientAddress: value('Heinz-Fangmann-Str. 1, D-42369 Wuppertal') })).message, /Frühere/)
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Rosenthalstraße 22, 42369 Wuppertal') })).color, 'yellow')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagenstraße 1, 99999 Berlin') })).color, 'yellow')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagenstraße 1, 42369 Wuppertal, Polen') })).color, 'yellow')
})

test('wanted VAT IDs missing are yellow, invoice date missing is gray, invoice number missing is yellow', () => {
  const checks = invoiceHeaderChecks(bill({ issuerVatId: value(''), recipientVatId: value(''), date: value(''), number: value('') }), company, [reference])
  for (const key of ['issuerVatId', 'recipientVatId', 'number']) assert.equal(checks.find(check => check.key === key).color, 'yellow')
  assert.equal(checks.find(check => check.key === 'date').color, 'gray')
})

test('payment compares identical bases, derives explicit due dates, and does not guess receipt/document deadlines', () => {
  let invoice = bill({ paymentDays: value('30'), paymentTerms: value('30 Tage ab Rechnungsdatum'), paymentBasis: value('Rechnungsdatum') })
  assert.equal(invoicePaymentChecks(invoice, [reference])[0].color, 'green')
  assert.equal(invoicePaymentChecks({ ...invoice, paymentDays: value('14') }, [reference])[0].color, 'red')
  invoice = bill({ dueDate: value('2026-10-31') })
  assert.equal(invoicePaymentChecks(invoice, [reference])[0].color, 'green')
  assert.equal(invoicePaymentChecks(invoice, [{ ...reference, payment: { ...reference.payment, basis: 'documents_received' } }])[0].color, 'yellow')
  assert.equal(invoicePaymentChecks(bill({ paymentDays: value('30') }), [{ ...reference, payment: { ...reference.payment, basis: null } }])[0].color, 'yellow')
  assert.equal(invoicePaymentChecks(invoice, [{ ...reference, payment: { ...reference.payment, dayType: 'working' } }])[0].color, 'yellow')
  assert.equal(invoicePaymentChecks(bill({ paymentTerms: value('Rechnung zahlbar innerhalb 30 Tagen'), paymentDays: value('30') }), [reference])[0].color, 'yellow')
  assert.equal(invoicePaymentChecks(bill({ paymentTerms: value('30 Tage ab Rechnungsdatum'), paymentDays: value('30') }), [{ ...reference, payment: { ...reference.payment, dayType: null } }])[0].color, 'yellow')
})

test('important notices are concise, based on real billing evidence, and report both over- and undercharges', () => {
  const headerChecks = [recipientAddressCheck(bill({ recipientAddress: value('Heinz-Fangmann-Straße, 42369 Wuppertal') }))]
  for (const actual of [49000, 51000]) {
    const notices = invoiceNotices({ headerChecks, paymentChecks: [{ key: 'paymentTerms', color: 'red' }], transports: [{ ta: '260000001', checks: [{ key: 'net', color: 'red', actual, expected: 50000 }] }], references: [{ ...reference, billingEvidence: [{ message: 'Kostenposition mit einem DyCoS-Beleg verknüpft. Dublette oder Zahlungsanfrage prüfen.' }] }] })
    assert.deepEqual(notices.map(notice => notice.kind), ['address', 'payment', 'cost', 'billing'])
    assert.match(notices.find(notice => notice.kind === 'cost').message, actual > 50000 ? /Mehr/ : /Weniger/)
    assert.ok(notices.every(notice => notice.color === 'yellow'))
  }
})
