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
