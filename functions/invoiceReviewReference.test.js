import test from 'node:test'
import assert from 'node:assert/strict'
import { invoicePaymentReference, loadInvoiceReference } from './invoiceReviewReference.js'

test('payment references retain full contractual text and distinguish the actual deadline basis', () => {
  assert.deepEqual(invoicePaymentReference('30 Tage netto'), { text: '30 Tage netto', days: 30, dayType: 'calendar', basis: null, dueDate: null })
  assert.equal(invoicePaymentReference('30 Werktage ab Rechnungsdatum').dayType, 'working')
  assert.equal(invoicePaymentReference('30 Banktage ab Rechnungsdatum').dayType, 'bank')
  assert.equal(invoicePaymentReference('30 Kalendertage ab Rechnungsdatum').dayType, 'calendar')
  assert.equal(invoicePaymentReference('30').dayType, null)
  assert.equal(invoicePaymentReference('30 Tage ab Rechnungsdatum').basis, 'invoice_date')
  assert.equal(invoicePaymentReference('45 Tage nach Rechnungseingang').basis, 'receipt_date')
  assert.equal(invoicePaymentReference('45 Tage nach Eingang vollständiger Unterlagen').basis, 'documents_received')
  assert.equal(invoicePaymentReference('14 Tage nach Entladung').basis, 'delivery_date')
  assert.equal(invoicePaymentReference('14 Tage 2% Skonto, 30 Tage netto').days, 30)
  assert.equal(invoicePaymentReference('14 Tage Skonto oder 30 Tage nach Vereinbarung').days, null)
  assert.equal(invoicePaymentReference('nach Vereinbarung').days, null)
  assert.equal(invoicePaymentReference('30').days, 30)
})

test('only the explicitly linked carrier supplies verified country, VAT identity and payment terms', async () => {
  const paths = []
  const db = { doc(path) { paths.push(path); return { async get() { return { data: () => ({ address: { country: 'Polen' }, companyData: { vatId: 'PL123' }, paymentTermDays: '60 Tage nach Rechnungseingang' }) } } } } }
  const result = await loadInvoiceReference({ db, imported: { carrier: { partnerId: 'carrier-1', snapshot: { country: 'DE' } } } })
  assert.deepEqual(paths, ['businessPartners/carrier-1'])
  assert.equal(result.carrierVatId, 'PL123'); assert.equal(result.carrierCountry, 'PL')
  assert.equal(result.payment.days, 60); assert.equal(result.payment.basis, 'receipt_date')
  assert.deepEqual(result.financial, { vatCents: null, grossCents: null })
})

test('document references are qualified review indications, not invented booked amounts or duplicate invoice proof', async () => {
  const result = await loadInvoiceReference({ db: { doc: () => assert.fail('No unrelated database collections queried') }, imported: { carrier: { snapshot: { country: 'D' } }, financial: { costPositions: [
    { documentSourceId: '123', documentLineSourceId: '456', amountNet: 500 },
    { documentSourceId: '123', documentLineSourceId: '457', amountNet: 100 },
    { documentSourceId: '0', documentLineSourceId: '9' },
  ] } } })
  assert.equal(result.billingDataAvailable, false)
  assert.equal(result.billingEvidence.length, 1)
  assert.equal(result.billingEvidence[0].kind, 'document_reference')
  assert.match(result.billingEvidence[0].message, /Bitte prüfen/)
  assert.equal(result.carrierCountry, 'DE')
  assert.equal(result.payment.days, null)
  assert.deepEqual(result.financial, { vatCents: null, grossCents: null })
})

test('unsafe partner paths and merged partner records never become reference identities', async () => {
  const ignored = await loadInvoiceReference({ db: { doc: () => assert.fail('No arbitrary paths') }, imported: { carrier: { partnerId: '../secrets' } } })
  assert.equal(ignored.carrierVatId, null)
  const merged = await loadInvoiceReference({ db: { doc: () => ({ get: async () => ({ data: () => ({ mergedIntoPartnerId: 'other', companyData: { vatId: 'DE123' }, paymentTermDays: '30' }) }) }) }, imported: { carrier: { partnerId: 'old' } } })
  assert.equal(merged.carrierVatId, null); assert.equal(merged.payment.days, null)
})

test('read-only DyCoS references find one existing partner by exact creditor account only', async () => {
  const queries = []
  const carrier = { address: { country: 'PL' }, companyData: { vatId: 'PL456' }, paymentTermDays: '45 Tage ab Rechnungsdatum' }
  const db = { collection(name) {
    assert.equal(name, 'businessPartners')
    return {
      where(field, op, value) {
        queries.push([field, op, value])
        return { limit: () => ({ get: async () => ({ docs: [{ id: 'known-carrier', data: () => carrier }] }) }) }
      },
    }
  } }
  const result = await loadInvoiceReference({ db, imported: { carrier: { creditorNumber: '70101', originalName: 'Never used as identity' } } })
  assert.equal(result.carrierVatId, 'PL456'); assert.equal(result.payment.days, 45)
  assert.equal(result.partnerAmbiguous, false)
  assert.deepEqual(queries, [['creditorNumber', '==', '70101'], ['dycosReferences.creditorNumbers', 'array-contains', '70101']])
})

test('ambiguous creditor account matches leave partner-specific comparison data unknown', async () => {
  const db = { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: ['first', 'second'].map(id => ({ id, data: () => ({ companyData: { vatId: 'PL123' }, paymentTermDays: '30' }) })) }) }) }) }) }
  const result = await loadInvoiceReference({ db, imported: { carrier: { creditorNumber: '70101', snapshot: { country: 'DE' } } } })
  assert.equal(result.partnerAmbiguous, true); assert.equal(result.carrierVatId, null); assert.equal(result.payment.days, null)
  assert.equal(result.carrierCountry, 'DE')
})

const mappedCarrier = (fields = {}, sourceId = '6064') => ({ sourceKind: 'carrier', sourceId, fields: { companyName: 'Source carrier', companyData: { vatId: 'PL_SOURCE' }, paymentTermDays: '45 Tage nach Rechnungseingang', address: { country: 'PL' }, ...fields } })
const noLocalCarrier = { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }) }

test('authenticated exact DyCoS carrier supplies reference values without importing a missing local partner', async () => {
  const result = await loadInvoiceReference({ db: noLocalCarrier, imported: { carrier: { creditorNumber: '76062' }, source: { carrierId: '6064' } }, sourcePartner: mappedCarrier() })
  assert.equal(result.carrierName, 'Source carrier')
  assert.equal(result.carrierVatId, 'PL_SOURCE')
  assert.equal(result.carrierCountry, 'PL')
  assert.equal(result.payment.days, 45)
  assert.equal(result.payment.basis, 'receipt_date')
  assert.equal(result.referenceSources.carrierVatId, 'DyCoS')
  assert.equal(result.referenceSources.payment, 'DyCoS')
  assert.deepEqual(result.partnerReference, { partnerId: null, match: null, sourceCarrierId: '6064', sourcePartnerUsed: true })
})

test('local linked fields take precedence and only missing fields are complemented from the exact source', async () => {
  const local = { companyName: 'Local carrier', companyData: { vatId: 'DE_LOCAL' }, paymentTermDays: '30 Tage ab Rechnungsdatum', address: { country: 'DE' } }
  const db = { doc: () => ({ get: async () => ({ data: () => local }) }) }
  const args = { db, imported: { carrier: { partnerId: 'local' }, source: { carrierId: '6064' } }, sourcePartner: mappedCarrier() }
  let result = await loadInvoiceReference(args)
  assert.equal(result.carrierName, 'Local carrier')
  assert.equal(result.carrierVatId, 'DE_LOCAL')
  assert.equal(result.payment.days, 30)
  assert.equal(result.carrierCountry, 'DE')
  assert.deepEqual(result.referenceSources, { carrierName: 'Drehpunkt', carrierVatId: 'Drehpunkt', carrierCountry: 'Drehpunkt', payment: 'Drehpunkt' })
  assert.equal(result.partnerReference.sourcePartnerUsed, false)
  local.companyData.vatId = ''
  local.paymentTermDays = ''
  result = await loadInvoiceReference(args)
  assert.equal(result.carrierName, 'Local carrier')
  assert.equal(result.carrierVatId, 'PL_SOURCE')
  assert.equal(result.payment.days, 45)
  assert.equal(result.referenceSources.carrierName, 'Drehpunkt')
  assert.equal(result.referenceSources.carrierVatId, 'DyCoS')
  assert.equal(local.companyData.vatId, '')
  assert.equal(local.paymentTermDays, '')
})

test('wrong source entity or carrier ID cannot supply partner comparison data', async () => {
  for (const sourcePartner of [mappedCarrier({}, '6065'), { ...mappedCarrier(), sourceKind: 'customer' }]) {
    const result = await loadInvoiceReference({ db: noLocalCarrier, imported: { carrier: { creditorNumber: '76062' }, source: { carrierId: '6064' } }, sourcePartner })
    assert.equal(result.carrierVatId, null)
    assert.equal(result.payment.days, null)
    assert.equal(result.partnerReference.sourcePartnerUsed, false)
  }
})

test('absent creditor account permits only an exact carrier source-reference lookup', async () => {
  const calls = []
  const local = { companyName: 'Exact source identity', companyData: { vatId: 'DE_EXACT' }, paymentTermDays: '14 Tage nach Entladung' }
  const db = { collection: name => { assert.equal(name, 'businessPartners'); return { where: (field, operator, value) => {
    calls.push([field, operator, value])
    return { limit: () => ({ get: async () => ({ docs: [{ id: 'by-source', data: () => local }] }) }) }
  } } } }
  const result = await loadInvoiceReference({ db, imported: { carrier: {}, source: { carrierId: '6064' } }, sourcePartner: mappedCarrier() })
  assert.deepEqual(calls, [['dycosImport.sourceReferences', 'array-contains', { entity: 'carrier', id: '6064' }]])
  assert.equal(result.carrierVatId, 'DE_EXACT')
  assert.equal(result.payment.days, 14)
  assert.equal(result.partnerReference.match, 'dycosSourceReference')
  assert.equal(result.partnerReference.partnerId, 'by-source')
})

test('ambiguous local source identities block remote field fallback without picking either record', async () => {
  const db = { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: ['first', 'second'].map(id => ({ id, data: () => ({ companyName: id, companyData: { vatId: 'DE_BAD' }, paymentTermDays: '30' }) })) }) }) }) }) }
  const result = await loadInvoiceReference({ db, imported: { carrier: {}, source: { carrierId: '6064' } }, sourcePartner: mappedCarrier() })
  assert.equal(result.partnerAmbiguous, true)
  assert.equal(result.carrierName, null)
  assert.equal(result.carrierVatId, null)
  assert.equal(result.payment.days, null)
  assert.equal(result.partnerReference.sourcePartnerUsed, false)
})

test('available creditor account never silently falls through to a different source-reference lookup', async () => {
  const calls = []
  const db = { collection: () => ({ where: (field, operator, value) => { calls.push([field, operator, value]); return { limit: () => ({ get: async () => ({ docs: [] }) }) } } }) }
  await loadInvoiceReference({ db, imported: { carrier: { creditorNumber: '76062' }, source: { carrierId: '6064' } }, sourcePartner: mappedCarrier() })
  assert.deepEqual(calls.map(call => call[0]), ['creditorNumber', 'dycosReferences.creditorNumbers'])
})
