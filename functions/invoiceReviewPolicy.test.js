import test from 'node:test'
import assert from 'node:assert/strict'
import { compareInvoiceTransport, invoiceTotals, invoiceHeaderChecks, invoicePaymentChecks, invoiceFactoringChecks, recipientAddressCheck, invoiceNotices, sameInvoiceCompany, compareInvoiceIssuer, sameInvoiceVatId, compareInvoiceVatId } from './invoiceReviewPolicy.js'
const value = value => ({ value, quote: value })
const bill = (patch = {}) => ({ number: value('RG-1'), date: value('2026-10-01'), issuer: value('Carrier GmbH'), issuerVatId: value('DE123456789'), issuerCountry: value('Deutschland'), recipient: value('Brennpunkt Logistik GmbH'), recipientVatId: value('DE987654321'), recipientAddress: value('Reinshagenstraße 1, 42369 Wuppertal'), currency: value('EUR'), netTotal: value('500,00'), vatTotal: value('95,00'), grossTotal: value('595,00'), transports: [{ ta: value('260000001'), net: value('500,00') }], ...patch })
const imported = { carrier: { originalName: 'Carrier GmbH' }, financial: { currency: 'EUR', costPositions: [{ amountNet: 500 }] }, loading: { city: 'Berlin' }, unloading: { city: 'Hamburg' } }
const reference = { ta: '260000001', imported, carrierVatId: 'DE123456789', carrierCountry: 'DE', financial: { vatCents: 9500, grossCents: 59500 }, payment: { days: 30, basis: 'invoice_date', dayType: 'calendar', text: '30 Tage ab Rechnungsdatum' }, billingEvidence: [] }
const company = { legalName: 'Brennpunkt Logistik GmbH', vatId: 'DE987654321' }

test('net, VAT and gross compare exact database cents; missing references are yellow, never implicit zero', () => {
  const complete = invoiceTotals(bill(), { references: [reference] })
  assert.deepEqual(complete.checks.map(check => check.key), ['netTotal', 'vatTotal', 'grossTotal'])
  for (const key of ['netTotal', 'vatTotal', 'grossTotal']) assert.equal(complete.checks.find(check => check.key === key).color, 'green')
  for (const key of ['positionSum', 'taxSum']) assert.equal(complete.detailChecks.find(check => check.key === key).color, 'green')
  const missing = invoiceTotals(bill({ vatTotal: value('') }), { references: [{ ...reference, financial: { vatCents: null, grossCents: null } }] })
  assert.equal(missing.checks.find(check => check.key === 'vatTotal').color, 'yellow')
  assert.equal(missing.checks.find(check => check.key === 'grossTotal').color, 'yellow')
  const wrong = invoiceTotals(bill({ netTotal: value('501,00') }), { references: [reference] })
  assert.equal(wrong.checks.find(check => check.key === 'netTotal').color, 'red')
})

test('foreign positive VAT is a red business review rule only with supported country evidence', () => {
  const foreign = invoiceTotals(bill(), { references: [{ ...reference, carrierCountry: 'PL' }] })
  assert.equal(foreign.detailChecks.find(check => check.key === 'foreignVat').color, 'red')
  assert.match(foreign.detailChecks.find(check => check.key === 'foreignVat').message, /Betriebliche Prüfregel/)
  const unknown = invoiceTotals(bill({ issuerCountry: value('') }), { references: [{ ...reference, carrierCountry: null }] })
  assert.equal(unknown.detailChecks.find(check => check.key === 'foreignVat').color, 'yellow')
})

test('different currencies never produce a false red amount comparison; secondary contradictions remain visible without contributing to main checks', () => {
  const invoice = bill({ currency: value('PLN') })
  const row = { ...invoice.transports[0], licensePlate: value('OTHER'), loadingCity: value('Anderer Ort') }
  const result = compareInvoiceTransport({ rows: [row], invoice, imported, company, carrierVatId: reference.carrierVatId })
  assert.equal(result.checks.find(check => check.key === 'net').color, 'yellow')
  assert.equal(result.checks.find(check => check.key === 'currency').color, 'red')
  assert.equal(result.checks.find(check => check.key === 'licensePlate-0').color, 'gray')
  assert.equal(result.checks.find(check => check.key === 'unloadingCity-0').color, 'gray')
  const totals = invoiceTotals(invoice, { references: [reference] })
  for (const key of ['netTotal', 'vatTotal', 'grossTotal']) assert.equal(totals.checks.find(check => check.key === key).color, 'yellow')
})

test('current address tolerates two spelling errors, address contradictions are red and incomplete addresses yellow', () => {
  assert.equal(recipientAddressCheck(bill()).color, 'green')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagnstrasse 1, 42369 Wuppertal') })).color, 'green')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagenstr. 1, D-42369 Wuppertal') })).color, 'green')
  const old = recipientAddressCheck(bill({ recipientAddress: value('Heinz-Fangmann-Straße, 42369 Wuppertal') }))
  assert.equal(old.color, 'red'); assert.match(old.message, /Frühere/)
  assert.match(recipientAddressCheck(bill({ recipientAddress: value('Heinz-Fangmann-Str. 1, D-42369 Wuppertal') })).message, /Frühere/)
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Rosenthalstraße 22, 42369 Wuppertal') })).color, 'red')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagenstraße 1, 99999 Berlin') })).color, 'red')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagenstraße 1, 42369 Wuppertal, Polen') })).color, 'red')
})

test('recipient country labels and attached German postal prefixes do not invalidate the correct address', () => {
  for (const country of ['Deutschland', 'Germany', 'Niemcy', 'Allemagne', 'Alemania', 'Germania', 'Duitsland', 'Германия']) {
    for (const prefix of ['', 'DE', 'DE-', 'D-', 'DEU ']) {
      const actual = `Brennpunkt Logistik GmbH Reinshagenstr. 1 ${prefix}42369 Wuppertal, ${country}`
      const check = recipientAddressCheck(bill({ recipientAddress: value(actual) }))
      assert.equal(check.color, 'green', actual)
      assert.equal(check.actual, actual)
    }
  }
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('REINSHAGENSTR. 1 DE42287 WUPPERTAL DEUTSCHLAND') })).color, 'red')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagenstr. 2 DE42369 Wuppertal Germany') })).color, 'red')
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
  assert.equal(invoicePaymentChecks(bill({ paymentTerms: value('Rechnung zahlbar innerhalb 30 Tagen'), paymentDays: value('30') }), [reference])[0].color, 'green')
  assert.equal(invoicePaymentChecks(bill({ paymentTerms: value('30 Tage ab Rechnungsdatum'), paymentDays: value('30') }), [{ ...reference, payment: { ...reference.payment, dayType: null } }])[0].color, 'yellow')
})

test('one payment row prefers explicit days and independently displays the invoice-date arithmetic without a payment method', () => {
  const invoice = bill({ date: value('2026-05-14'), dueDate: value('2026-06-28'), paymentTerms: value('Überweisung'), paymentDays: { value: '45', quote: '45 Tage' } })
  const refs = [{ ...reference, payment: { days: 45, dayType: 'calendar', basis: null, text: '45 Tage Netto; Überweisung' } }]
  const checks = invoicePaymentChecks(invoice, refs)
  assert.equal(checks.length, 1); assert.equal(checks[0].key, 'paymentTerms')
  assert.equal(checks[0].color, 'green'); assert.equal(checks[0].paymentDays, 45); assert.equal(checks[0].derivedDays, 45)
  assert.equal(checks[0].actual, '45 Tage · aus Datumsangaben: 45 Tage')
  assert.equal(checks[0].expected, '45 Tage')
  assert.match(checks[0].sourceText, /2026-05-14.*2026-06-28.*45 Tage/)
  assert.ok(!JSON.stringify(checks).includes('Überweisung'))
  assert.equal(invoicePaymentChecks(invoice, [reference])[0].color, 'red')
})

test('explicit days and contradictory due dates stay in the same row and cannot produce a false green', () => {
  const invoice = bill({ date: value('2026-05-14'), dueDate: value('2026-06-27'), paymentDays: value('45'), paymentTerms: value('45 Tage ab Rechnungsdatum') })
  const refs = [{ ...reference, payment: { days: 45, basis: 'invoice_date', dayType: 'calendar' } }]
  const check = invoicePaymentChecks(invoice, refs)[0]
  assert.equal(check.color, 'yellow'); assert.match(check.actual, /45 Tage.*44 Tage/); assert.match(check.message, /widersprechen/)
  assert.equal(invoicePaymentChecks(invoice, [reference])[0].color, 'red')
  assert.equal(invoicePaymentChecks({ ...invoice, dueDate: value('2026-05-13') }, refs)[0].color, 'yellow')
})

test('date corroboration never changes an explicit receipt basis or equates workdays with calendar days', () => {
  const invoice = bill({ date: value('2026-05-14'), dueDate: value('2026-06-28'), paymentDays: value('45'), paymentTerms: value('45 Tage ab Rechnungseingang'), paymentBasis: value('Rechnungseingang') })
  const unknown = [{ ...reference, payment: { days: 45, dayType: 'calendar', basis: null } }]
  assert.equal(invoicePaymentChecks(invoice, unknown)[0].color, 'green')
  assert.equal(invoicePaymentChecks(invoice, [{ ...reference, payment: { days: 45, dayType: 'calendar', basis: 'invoice_date' } }])[0].color, 'red')
  assert.equal(invoicePaymentChecks(invoice, [{ ...reference, payment: { days: 45, dayType: 'calendar', basis: 'receipt_date' } }])[0].color, 'green')
  const working = { ...invoice, paymentTerms: value('45 Werktage ab Rechnungsdatum'), paymentBasis: value('Rechnungsdatum') }
  assert.equal(invoicePaymentChecks(working, unknown)[0].color, 'red')
  assert.equal(invoicePaymentChecks(working, [{ ...reference, payment: { days: 45, dayType: 'working', basis: 'invoice_date' } }])[0].color, 'green')
  assert.equal(invoicePaymentChecks(bill({ dueDate: value('2026-10-31') }), [{ ...reference, payment: { ...reference.payment, dayType: 'working' } }])[0].color, 'yellow')
})

test('payment date arithmetic accepts only actual valid invoice and due dates, never delivery or KSeF dates', () => {
  const refs = [{ ...reference, payment: { days: 45, dayType: 'calendar', basis: null } }]
  const derived = invoicePaymentChecks(bill({ date: value('2026-05-14'), dueDate: value('2026-06-28') }), refs)[0]
  assert.equal(derived.color, 'green'); assert.equal(derived.paymentDays, null); assert.equal(derived.derivedDays, 45)
  for (const date of ['', '2026-02-30', '2026-05-14T00:00:00Z']) {
    const check = invoicePaymentChecks(bill({ date: value(date), deliveryDate: value('2026-05-14'), ksefDate: value('2026-05-14'), dueDate: value('2026-06-28') }), refs)[0]
    assert.equal(check.color, 'yellow'); assert.equal(check.derivedDays, null)
  }
  assert.equal(invoicePaymentChecks(bill({ date: value('2026-05-14'), dueDate: value('2026-02-30') }), refs)[0].derivedDays, null)
})

test('invoice-date arithmetic cannot establish a receipt or document-based day count even when the database uses that basis', () => {
  for (const [basisText, basis] of [['Rechnungseingang', 'receipt_date'], ['Eingang vollständiger Belege', 'documents_received']]) {
    const invoice = bill({ dueDate: value('2026-10-31'), paymentBasis: value(basisText), paymentTerms: value(`Zahlbar ab ${basisText}`) })
    const refs = [{ ...reference, payment: { days: 30, basis, dayType: 'calendar' } }]
    const check = invoicePaymentChecks(invoice, refs)[0]
    assert.equal(check.color, 'yellow'); assert.equal(check.paymentDays, null); assert.equal(check.derivedDays, 30)
    assert.match(check.actual, /aus Datumsangaben: 30 Tage/)
    const agreedDue = invoicePaymentChecks(invoice, [{ ...refs[0], payment: { ...refs[0].payment, dueDate: '2026-10-31' } }])[0]
    assert.equal(agreedDue.color, 'green')
  }
})

test('missing reference terms, mixed bases and missing day types prevent a complete positive payment comparison', () => {
  const invoice = bill({ paymentDays: value('30'), paymentTerms: value('30 Tage') })
  assert.equal(invoicePaymentChecks(invoice, [reference, { ...reference, payment: null }])[0].color, 'yellow')
  assert.equal(invoicePaymentChecks(invoice, [reference, { ...reference, payment: { ...reference.payment, basis: 'receipt_date' } }])[0].color, 'yellow')
  assert.equal(invoicePaymentChecks(invoice, [{ ...reference, payment: { ...reference.payment, dayType: null } }])[0].color, 'yellow')
  const unknown = [{ ...reference, payment: { days: 30, dayType: 'calendar', basis: null } }]
  assert.equal(invoicePaymentChecks(invoice, unknown)[0].color, 'green')
  for (const phrase of ['45 dni', '45 jours']) assert.equal(invoicePaymentChecks(bill({ paymentDays: value('45'), paymentTerms: value(phrase) }), [{ ...reference, payment: { days: 45, dayType: 'calendar', basis: null } }])[0].color, 'green')
  assert.equal(invoicePaymentChecks(bill({ paymentDays: value('45'), paymentTerms: value('45 dni roboczych') }), [{ ...reference, payment: { days: 45, dayType: 'calendar', basis: null } }])[0].color, 'red')
})

test('factoring is one primary evidenced check; company names and unevidenced flags alone never establish assignment', () => {
  for (const invoice of [bill(), bill({ factoringCompany: value('Factor GmbH') }), bill({ factoring: { value: 'Ja', quote: '' }, factoringCompany: value('Factor GmbH') }), bill({ factoring: value('Nein') })]) {
    const checks = invoiceFactoringChecks(invoice)
    assert.equal(checks.length, 1); assert.equal(checks[0].key, 'factoring'); assert.equal(checks[0].color, 'green')
    assert.equal(checks[0].actual, 'Kein Hinweis gefunden'); assert.equal(checks[0].found, false); assert.equal(checks[0].sourceText, '')
  }
  const clause = 'Die Forderung wurde an Factor GmbH abgetreten.'
  const check = invoiceFactoringChecks(bill({ factoring: { value: 'Forderungsabtretung', quote: clause }, factoringCompany: value('Factor GmbH') }))[0]
  assert.equal(check.color, 'yellow'); assert.equal(check.found, true); assert.equal(check.company, 'Factor GmbH')
  assert.equal(check.sourceText, clause); assert.equal(check.secondary, undefined); assert.match(check.actual, /Factor GmbH/)
  assert.match(invoiceFactoringChecks(bill({ factoring: value(clause) }))[0].actual, /Forderungsabtretung gefunden/)
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

test('known legal forms and proprietor suffix normalize without accepting arbitrary name prefixes', () => {
  assert.equal(sameInvoiceCompany('MAKO TSL SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ', 'Mako TSL sp. z o.o'), true)
  assert.equal(sameInvoiceCompany('Günhanlog Inh. Fatih Günhan', 'Günhanlog'), true)
  assert.equal(sameInvoiceCompany('Günhanlog Inh. Fatih Günhan', 'Günhanlogistik'), false)
  assert.equal(sameInvoiceCompany('Günhanlog Inh. Fatih Günhan', 'Günhanlog Inh. Anderer Name'), false)
  assert.equal(sameInvoiceCompany('Carrier GmbH', 'Carrier AG'), false)
  assert.equal(sameInvoiceCompany('', ''), false)
  const checks = invoiceHeaderChecks(bill({ issuer: value('Günhanlog Inh. Fatih Günhan') }), company, [{ ...reference, imported: { ...imported, carrier: { originalName: 'Günhanlog' } } }])
  assert.equal(checks.find(check => check.key === 'issuer').color, 'green')
  assert.equal(checks.find(check => check.key === 'number').color, 'gray')
})

test('missing currency prevents green database amounts but leaves arithmetic independently verifiable', () => {
  const invoice = bill({ currency: value('') })
  const transport = compareInvoiceTransport({ rows: invoice.transports, invoice, imported, company })
  assert.equal(transport.checks.find(check => check.key === 'net').color, 'yellow')
  assert.equal(transport.checks.find(check => check.key === 'currency').color, 'yellow')
  const totals = invoiceTotals(invoice, { references: [reference] })
  for (const key of ['netTotal', 'vatTotal', 'grossTotal']) assert.equal(totals.checks.find(check => check.key === key).color, 'yellow')
  assert.equal(totals.detailChecks.find(check => check.key === 'taxSum').color, 'green')
})

test('secondary dates expose real contradictions while missing transport detail stays optional', () => {
  const invoice = bill()
  const result = compareInvoiceTransport({ rows: [{ ...invoice.transports[0], loadingDate: value('2026-10-27') }], invoice, imported: { ...imported, loading: { window: { from: '2028-10-27' } } }, company })
  const date = result.checks.find(check => check.key === 'loadingDate-0')
  assert.equal(date.color, 'red')
  assert.equal(date.secondary, true)
  assert.equal(result.checks.find(check => check.key === 'unloadingDate-0').color, 'gray')
})

test('address uses company house number and postal code without tolerating numeric contradictions', () => {
  const configured = { street: 'Reinshagenstraße 1', postalCode: '42369', city: 'Wuppertal' }
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagenstr. 1, 42287 Wuppertal') }), configured).color, 'red')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagenstr. 2, 42369 Wuppertal') }), configured).color, 'red')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagenstraße, 42369 Wuppertal') }), configured).color, 'yellow')
  assert.equal(recipientAddressCheck(bill({ recipientAddress: value('Reinshagenstraße 1') }), configured).color, 'yellow')
})

test('header delivery date corroborates unloading only for a single transport', () => {
  const invoice = bill({ deliveryDate: value('2026-10-19') })
  const order = { ...imported, unloading: { window: { until: '2026-10-19T15:00:00' } } }
  const result = compareInvoiceTransport({ rows: invoice.transports, invoice, imported: order, company })
  assert.equal(result.checks.find(check => check.key === 'deliveryDate-0').color, 'green')
  assert.equal(result.checks.find(check => check.key === 'deliveryDate-0').secondary, true)
  assert.equal(result.checks.find(check => check.key === 'loadingDate-0').actual, null)
  const collection = { ...invoice, transports: [...invoice.transports, { ta: value('260000002'), net: value('100,00') }] }
  assert.equal(compareInvoiceTransport({ rows: invoice.transports, invoice: collection, imported: order, company }).checks.some(check => check.key === 'deliveryDate-0'), false)
})

test('foreign zero-tax rule supplies a transparent VAT and derived gross comparison without inventing database tax', () => {
  const invoice = bill({ vatTotal: value('0,00'), grossTotal: value('500,00') })
  const result = invoiceTotals(invoice, { references: [{ ...reference, carrierCountry: 'RS', financial: { vatCents: null, grossCents: null } }] })
  assert.deepEqual(result.checks.map(check => check.key), ['netTotal', 'vatTotal', 'grossTotal'])
  const vat = result.checks.find(check => check.key === 'vatTotal'), gross = result.checks.find(check => check.key === 'grossTotal')
  assert.equal(vat.color, 'green'); assert.equal(vat.expected, 0); assert.equal(vat.comparisonOrigin, 'business_rule')
  assert.equal(gross.color, 'green'); assert.equal(gross.expected, 50000); assert.equal(gross.comparisonOrigin, 'reference_calculation')
  assert.equal(result.detailChecks.find(check => check.key === 'databaseVatTotal').expected, null)
  assert.equal(result.detailChecks.find(check => check.key === 'databaseGrossTotal').expected, null)
  assert.ok(result.detailChecks.every(check => check.secondary === true))
})

test('domestic missing tax reference stays yellow and gross can independently verify invoice arithmetic', () => {
  const result = invoiceTotals(bill(), { references: [{ ...reference, financial: { vatCents: null, grossCents: null } }] })
  assert.equal(result.checks.find(check => check.key === 'vatTotal').color, 'yellow')
  const gross = result.checks.find(check => check.key === 'grossTotal')
  assert.equal(gross.color, 'green'); assert.equal(gross.comparisonOrigin, 'invoice_arithmetic')
  assert.equal(gross.expected, 59500)
})

test('internal amount contradictions propagate into consolidated rows and OCR uncertainty remains yellow', () => {
  const invoice = bill({ transports: [{ ta: value('260000001'), net: value('490,00') }], grossTotal: value('600,00') })
  const result = invoiceTotals(invoice, { references: [reference] })
  const net = result.checks.find(check => check.key === 'netTotal'), gross = result.checks.find(check => check.key === 'grossTotal')
  assert.equal(net.color, 'red'); assert.equal(net.expected, 49000); assert.equal(net.comparisonOrigin, 'invoice_positions')
  assert.equal(gross.color, 'red'); assert.equal(gross.expected, 59500); assert.equal(gross.comparisonOrigin, 'invoice_arithmetic')
  assert.equal(result.detailChecks.find(check => check.key === 'databaseNetTotal').color, 'green')
  const uncertain = invoiceTotals({ ...invoice, amountUncertainKeys: ['netTotal', 'grossTotal'] }, { references: [reference] })
  assert.equal(uncertain.checks.find(check => check.key === 'netTotal').color, 'yellow')
  assert.equal(uncertain.checks.find(check => check.key === 'grossTotal').color, 'yellow')
})

test('foreign business contradiction is not hidden by a matching positive database VAT amount', () => {
  const result = invoiceTotals(bill(), { references: [{ ...reference, carrierCountry: 'PL' }] })
  const vat = result.checks.find(check => check.key === 'vatTotal')
  assert.equal(vat.color, 'red'); assert.equal(vat.expected, 0); assert.equal(vat.comparisonOrigin, 'business_rule')
  assert.equal(result.detailChecks.find(check => check.key === 'databaseVatTotal').color, 'green')
  const negative = invoiceTotals(bill({ vatTotal: value('-10,00'), grossTotal: value('490,00') }), { references: [{ ...reference, carrierCountry: 'PL', financial: { vatCents: null, grossCents: null } }] })
  assert.equal(negative.checks.find(check => check.key === 'vatTotal').color, 'yellow')
  assert.equal(negative.checks.find(check => check.key === 'vatTotal').expected, null)
})

test('authoritative VAT identity resolves substantive company name differences without arbitrary PP or city stripping', () => {
  const invoice = bill({ issuer: value('S CROWN PP 2020 DOO'), issuerVatId: value('RS109442000') })
  const name = 'DOO S CROWN2020 Prijepolje'
  assert.equal(sameInvoiceCompany(invoice.issuer.value, name), false)
  const issuer = compareInvoiceIssuer(invoice, name, 'RS109442000')
  assert.equal(issuer.color, 'green'); assert.equal(issuer.matchedBy, 'vatId')
  assert.equal(issuer.actual, invoice.issuer.value); assert.equal(issuer.expected, name)
  assert.equal(compareInvoiceIssuer(invoice, name, null).color, 'red')
  assert.equal(compareInvoiceIssuer(invoice, invoice.issuer.value, 'RS999999999').color, 'red')
  const checks = invoiceHeaderChecks(invoice, company, [{ ...reference, carrierName: name, carrierVatId: 'RS109442000' }])
  assert.equal(checks.find(check => check.key === 'issuer').matchedBy, 'vatId')
})

test('VAT country prefixes normalize only with independently verified carrier country', () => {
  assert.equal(sameInvoiceVatId('RS112058906', '112058906', 'RS'), true)
  assert.equal(sameInvoiceVatId('112058906', 'RS112058906', 'RS'), true)
  assert.equal(sameInvoiceVatId('RS112058906', '112058906'), false)
  assert.equal(sameInvoiceVatId('DE112058906', '112058906', 'RS'), false)
  assert.equal(sameInvoiceVatId('DE112058906', 'RS112058906', 'RS'), false)
  assert.equal(sameInvoiceVatId('RS112058907', '112058906', 'RS'), false)
  assert.equal(compareInvoiceVatId('issuerVatId', 'USt-ID', 'RS112058906', '112058906').color, 'yellow')
  const invoice = bill({ issuer: value('S CROWN PP 2020 DOO'), issuerVatId: value('RS112058906') })
  const partnerReference = { ...reference, carrierName: 'DOO S CROWN2020 Prijepolje', carrierVatId: '112058906', carrierCountry: 'RS' }
  const header = invoiceHeaderChecks(invoice, company, [partnerReference])
  const issuer = header.find(check => check.key === 'issuer'), vat = header.find(check => check.key === 'issuerVatId')
  assert.equal(issuer.color, 'green'); assert.equal(issuer.matchedBy, 'vatId')
  assert.equal(vat.color, 'green'); assert.equal(vat.actual, 'RS112058906'); assert.equal(vat.expected, '112058906')
  assert.equal(vat.normalization, 'verified_country_prefix'); assert.equal(vat.normalizationCountry, 'RS')
  const transport = compareInvoiceTransport({ rows: invoice.transports, invoice, imported, company, carrierName: partnerReference.carrierName, carrierVatId: partnerReference.carrierVatId, carrierCountry: 'RS' })
  assert.equal(transport.checks.find(check => check.key === 'issuer').color, 'green')
  assert.equal(transport.checks.find(check => check.key === 'issuerVatId').color, 'green')
  assert.equal(compareInvoiceIssuer(bill(), 'Carrier GmbH', 'DE123456789').matchedBy, 'name_and_vatId')
})


test('matching explicit 45-day terms are green without a repeated deadline basis, but real contradictions remain', () => {
  const invoice = bill({ paymentDays: value('45'), paymentTerms: value('45 Tage') })
  for (const basis of [null, 'invoice_date', 'receipt_date', 'documents_received']) {
    const refs = [{ ...reference, payment: { days: 45, dayType: 'calendar', basis } }]
    const check = invoicePaymentChecks(invoice, refs)[0]
    assert.equal(check.color, 'green')
    assert.ok(!check.message)
    assert.equal(invoicePaymentChecks({ ...invoice, paymentDays: value('30'), paymentTerms: value('30 Tage') }, refs)[0].color, 'red')
  }
  const refs = [{ ...reference, payment: { days: 45, dayType: 'calendar', basis: 'receipt_date' } }]
  assert.equal(invoicePaymentChecks({ ...invoice, paymentBasis: value('Rechnungsdatum') }, refs)[0].color, 'red')
  assert.equal(invoicePaymentChecks({ ...invoice, paymentDays: value(''), paymentTerms: value('') }, refs)[0].color, 'yellow')
})
