import assert from 'node:assert/strict'
import test from 'node:test'
import { mapInvoiceBillingHeaders } from './invoiceReviewBilling.js'
import { mapDycosOrder } from './dycosOrderMapping.js'

const head = (values = {}) => ({
  KopfID: 91, BelegNr: 'INTERNAL-91', Belegart: 7, BelegDatum: '30.10.26', ExterneBelegnummer: '555/26',
  AdressID: 6064, bUnternehmer: true, bProformabeleg: true, bRechnungskorrektur: false, Storniert: false,
  PDFDateinameMitPfadFakturaBelegOriginal: 'Z:\\private\\ProformaGutschriftUTN_91.pdf',
  Nettowert: '1000,00', Mwst: '190,00', Gesamt: '1190,00', WaehrungBezFW: 'EUR', ...values,
})
function source(overrides = {}) {
  return {
    auftrag: { ID: 71, Nummer: 261000889, TourenID: 81 }, kunde: null, tour: null, unternehmerstamm: null,
    fahrzeugart: null, relation: null, zahlungsbedingungKunde: null, zahlungsbedingungUnternehmer: null,
    ladeEntladestellen: [], LadeEntladestellen2: [], auftragspreise: [], tourkosten: [],
    fakturaZeilen: [{ AuftragID: 71, KopfID: 91 }], fakturaKopf: [head()], ...overrides,
  }
}
const project = payload => mapInvoiceBillingHeaders(payload, mapDycosOrder(payload, '261000889'))

test('billing projection only admits heads already associated by safe mapping with this exact transport order', () => {
  const payload = source({
    auftragspreise: [{ AuftragID: 71, RechKopfID: 92 }],
    tourkosten: [{ AuftragID: 71, TourenID: 81, RechKopfID: 93 }, { AuftragID: 72, TourenID: 81, RechKopfID: 94 }, { AuftragID: 0, TourenID: 81, RechKopfID: 95 }],
    fakturaKopf: [91,92,93,94,95,96].map(KopfID => head({ KopfID })),
  })
  assert.deepEqual(project(payload).billingDocuments.map(document => document.sourceId), ['91', '92', '93'])
  assert.deepEqual(mapInvoiceBillingHeaders(payload, { financial: { documents: [] } }).billingDocuments, [])
})

test('canonical persistent KopfID binds headers independent of padding and volatile connector identity', () => {
  const payload = source({ fakturaKopf: [head({ KopfID: '00091', ItemInternalId: 'first-transient' })] })
  const first = project(payload)
  assert.equal(first.billingDocuments.length, 1)
  assert.equal(first.billingDocuments[0].sourceId, '91')
  payload.fakturaKopf[0].ItemInternalId = 'changed-transient'
  assert.deepEqual(project(payload), first)
})

test('raw AdressID supplies carrier identity without inventing a TA or creditor-account identity', () => {
  const result = project(source()).billingDocuments[0]
  assert.equal(result.carrierSourceId, '6064')
  assert.equal(result.sourceId, '91')
  assert.equal(result.externalNumber, '555/26')
  assert.equal(result.eligible, true)
  for (const key of ['orderId', 'orderNumber', 'ta', 'creditorNumber', 'netCents', 'taxCents']) assert.ok(!(key in result), key)
})

test('Gesamt remains the entire original-currency header gross without allocating it to TA costs or net', () => {
  const payload = source({ tourkosten: [{ AuftragID: 71, TourenID: 81, RechKopfID: 91, Menge: 1, Preis: 200, Gesamt: 200 }] })
  const imported = mapDycosOrder(payload, '261000889')
  assert.equal(imported.financial.costPositions[0].amountNet, 200)
  const result = mapInvoiceBillingHeaders(payload, imported).billingDocuments[0]
  assert.equal(result.grossCents, 119000)
  assert.notEqual(result.grossCents, 20000)
  assert.notEqual(result.grossCents, 100000)
})

test('original-currency code is required and converted EUR columns cannot fabricate it', () => {
  const payload = source({ fakturaKopf: [head({ Nettowert: '100,00', Mwst: '0,00', Gesamt: '100,00', WaehrungBezFW: ' pln ', GesamtEUR: 23.1, GesamtKW: 23.1, WaehrungBezKW: 'EUR' })] })
  let result = project(payload).billingDocuments[0]
  assert.equal(result.currency, 'PLN')
  assert.equal(result.grossCents, 10000)
  for (const code of [undefined, null, '', '€', 'EURO']) {
    payload.fakturaKopf[0].WaehrungBezFW = code
    result = project(payload).billingDocuments[0]
    assert.equal(result.currency, null, String(code))
    assert.equal(result.grossCents, 10000)
  }
})

test('cancelled flag preserves true false and unknown instead of treating absence as active', () => {
  for (const [raw, expected] of [[true,true], [1,true], [false,false], [0,false], [undefined,null], [null,null]]) {
    const result = project(source({ fakturaKopf: [head({ Storniert: raw })] })).billingDocuments[0]
    assert.equal(result.cancelled, expected, String(raw))
  }
})

test('unclassified carrier documents remain undecided while customer documents are ineligible', () => {
  const unknown = project(source({ fakturaKopf: [head({ PDFDateinameMitPfadFakturaBelegOriginal: 'Z:\\Unknown_91.pdf' })] })).billingDocuments[0]
  assert.equal(unknown.eligible, null)
  for (const correction of [undefined, null]) {
    assert.equal(project(source({ fakturaKopf: [head({ bRechnungskorrektur: correction })] })).billingDocuments[0].eligible, null)
  }
  const customer = project(source({ fakturaKopf: [head({ bUnternehmer: false, bProformabeleg: false, PDFDateinameMitPfadFakturaBelegOriginal: 'Z:\\Rechnung_91.pdf' })] })).billingDocuments[0]
  assert.equal(customer.eligible, false)
  assert.equal(customer.carrierSourceId, null)
  const corrected = project(source({ fakturaKopf: [head({ bRechnungskorrektur: true })] })).billingDocuments[0]
  assert.equal(corrected.eligible, false)
})

test('contradictory header arithmetic removes gross comparison value instead of silently choosing an amount', () => {
  const payload = source({ fakturaKopf: [head({ Nettowert: '100,00', Mwst: '19,00', Gesamt: '118,00' })] })
  assert.equal(project(payload).billingDocuments[0].grossCents, null)
  payload.fakturaKopf[0].Gesamt = '119,00'
  assert.equal(project(payload).billingDocuments[0].grossCents, 11900)
  delete payload.fakturaKopf[0].Nettowert
  assert.equal(project(payload).billingDocuments[0].grossCents, 11900)
  delete payload.fakturaKopf[0].Gesamt
  assert.equal(project(payload).billingDocuments[0].grossCents, null)
})

test('private billing projection omits raw rows bank details internal paths and credentials', () => {
  const payload = source({ fakturaKopf: [head({ IBAN: 'PRIVATE_BANK', Bankkonto: 'PRIVATE_ACCOUNT', APISecret: 'PRIVATE_SECRET', Authorization: 'PRIVATE_TOKEN', Raw: { private: 'PRIVATE_NESTED' }, ItemInternalId: 'PRIVATE_VOLATILE' })] })
  const result = project(payload)
  assert.deepEqual(Object.keys(result).sort(), ['billingDataAvailable', 'billingDocuments'])
  assert.deepEqual(Object.keys(result.billingDocuments[0]).sort(), ['cancelled', 'carrierSourceId', 'currency', 'eligible', 'externalNumber', 'grossCents', 'sourceId'])
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|private|IBAN|Bankkonto|APISecret|Authorization|ItemInternalId|PDFDateiname|Raw/)
})

test('billing availability distinguishes an explicitly empty header list from an unavailable list', () => {
  const imported = { financial: { documents: [] } }
  assert.deepEqual(mapInvoiceBillingHeaders({ fakturaKopf: [] }, imported), { billingDocuments: [], billingDataAvailable: true })
  assert.deepEqual(mapInvoiceBillingHeaders({}, imported), { billingDocuments: [], billingDataAvailable: false })
})

test('external reference comes only from the authoritative header even if mapped position references exist or conflict', () => {
  const payload = source({ tourkosten: [{ AuftragID: 71, TourenID: 81, RechKopfID: 91, ExterneBelegNr: 'POSITION-REFERENCE' }] })
  delete payload.fakturaKopf[0].ExterneBelegnummer
  let imported = mapDycosOrder(payload, '261000889')
  assert.equal(imported.financial.documents[0].externalNumber, 'POSITION-REFERENCE')
  assert.equal(mapInvoiceBillingHeaders(payload, imported).billingDocuments[0].externalNumber, null)
  payload.fakturaKopf[0].ExterneBelegnummer = '  HEADER-REFERENCE  '
  imported = mapDycosOrder(payload, '261000889')
  assert.equal(imported.financial.documents[0].externalNumber, null)
  assert.ok(imported.financial.documents[0].warningCodes.includes('DOCUMENT_NUMBER_CONFLICT'))
  assert.equal(mapInvoiceBillingHeaders(payload, imported).billingDocuments[0].externalNumber, 'HEADER-REFERENCE')
})

test('same invoice number on distinct persistent header identities retains both records', () => {
  const payload = source({ fakturaZeilen: [{ AuftragID: 71, KopfID: 91 }, { AuftragID: 71, KopfID: 92 }], fakturaKopf: [head(), head({ KopfID: 92, Storniert: true })] })
  const result = project(payload).billingDocuments
  assert.equal(result.length, 2)
  assert.deepEqual(result.map(document => document.sourceId), ['91', '92'])
  assert.deepEqual(result.map(document => document.externalNumber), ['555/26', '555/26'])
  assert.deepEqual(result.map(document => document.cancelled), [false, true])
})

test('repeated identical connector rows for one canonical KopfID do not multiply a single booking', () => {
  const payload = source({ fakturaKopf: [head(), head()] })
  const imported = mapDycosOrder(payload, '261000889')
  assert.equal(imported.financial.documents.length, 1)
  const result = mapInvoiceBillingHeaders(payload, imported).billingDocuments
  assert.equal(result.length, 1)
  assert.equal(result[0].sourceId, '91')
})

test('conflicting gross values on repeated KopfID remain visible instead of silently selecting the first connector row', () => {
  const payload = source({ fakturaKopf: [head(), head({ Nettowert: '1010,00', Mwst: '190,00', Gesamt: '1200,00' })] })
  const imported = mapDycosOrder(payload, '261000889')
  assert.equal(imported.financial.documents.length, 1)
  const result = mapInvoiceBillingHeaders(payload, imported).billingDocuments
  assert.equal(result.length, 2)
  assert.deepEqual(result.map(document => document.sourceId), ['91', '91'])
  assert.deepEqual(result.map(document => document.grossCents), [119000, 120000])
})

test('missing referenced own-order billing headers make data incomplete across all three reference collections', () => {
  for (const [collection, linkField] of [['fakturaZeilen', 'KopfID'], ['tourkosten', 'RechKopfID'], ['auftragspreise', 'RechKopfID']]) {
    const payload = source({ fakturaZeilen: [], fakturaKopf: [], [collection]: [{ AuftragID: 71, TourenID: 81, [linkField]: 91 }] })
    const imported = mapDycosOrder(payload, '261000889')
    assert.equal(imported.financial.documents.length, 0)
    assert.equal(mapInvoiceBillingHeaders(payload, imported).billingDataAvailable, false, collection)
  }
})

test('all own-order references must resolve to both an actual raw header and a linked mapped document', () => {
  const payload = source({ fakturaZeilen: [{ AuftragID: 71, KopfID: 91 }, { AuftragID: 71, KopfID: 92 }], fakturaKopf: [head()] })
  let imported = mapDycosOrder(payload, '261000889')
  assert.equal(imported.financial.documents.length, 1)
  assert.equal(mapInvoiceBillingHeaders(payload, imported).billingDataAvailable, false)
  payload.fakturaKopf.push(head({ KopfID: 92 }))
  imported = mapDycosOrder(payload, '261000889')
  assert.equal(mapInvoiceBillingHeaders(payload, imported).billingDataAvailable, true)
  imported.financial.documents = imported.financial.documents.filter(document => document.sourceId !== '92')
  assert.equal(mapInvoiceBillingHeaders(payload, imported).billingDataAvailable, false)
})

test('a previously linked mapped head missing from raw headers cannot claim complete current data', () => {
  const payload = source()
  const imported = mapDycosOrder(payload, '261000889')
  payload.fakturaKopf = []
  payload.fakturaZeilen = []
  const result = mapInvoiceBillingHeaders(payload, imported)
  assert.equal(result.billingDataAvailable, false)
  assert.deepEqual(result.billingDocuments, [])
})

test('unrelated order and unassigned tour references do not require unrelated raw headers', () => {
  const payload = source({
    fakturaZeilen: [{ AuftragID: 71, KopfID: 91 }, { AuftragID: 72, KopfID: 92 }],
    tourkosten: [{ AuftragID: 72, TourenID: 81, RechKopfID: 93 }, { AuftragID: 0, TourenID: 81, RechKopfID: 94 }],
    auftragspreise: [{ AuftragID: 72, RechKopfID: 95 }],
  })
  // The overall order mapper correctly rejects unrelated FakturaZeilen. This
  // private projection still has to bind its own completeness check to order 71.
  const imported = mapDycosOrder(source(), '261000889')
  const result = mapInvoiceBillingHeaders(payload, imported)
  assert.equal(result.billingDataAvailable, true)
  assert.deepEqual(result.billingDocuments.map(document => document.sourceId), ['91'])
})

test('an explicitly empty set of own-order references and headers is complete', () => {
  const payload = source({ fakturaZeilen: [], fakturaKopf: [], tourkosten: [], auftragspreise: [] })
  const imported = mapDycosOrder(payload, '261000889')
  assert.deepEqual(mapInvoiceBillingHeaders(payload, imported), { billingDocuments: [], billingDataAvailable: true })
})

test('overlong external numbers sharing a 240-character prefix are unknown rather than truncated equal numbers', () => {
  const prefix = 'A'.repeat(237) + '123'
  const payload = source({ fakturaZeilen: [{ AuftragID: 71, KopfID: 91 }, { AuftragID: 71, KopfID: 92 }], fakturaKopf: [head({ ExterneBelegnummer: prefix + '1' }), head({ KopfID: 92, ExterneBelegnummer: prefix + '2' })] })
  const result = project(payload)
  assert.equal(result.billingDocuments.length, 2)
  assert.deepEqual(result.billingDocuments.map(document => document.externalNumber), [null, null])
  payload.fakturaKopf[0].ExterneBelegnummer = prefix
  assert.equal(project(payload).billingDocuments[0].externalNumber, prefix)
})
