import assert from 'node:assert/strict'
import test from 'node:test'
import { mapDycosOrder, DycosMappingError } from './dycosOrderMapping.js'

function payload() {
  return { auftrag: { ID: 71, Nummer: 260000001, TourenID: 81 }, kunde: null, tour: null, unternehmerstamm: null, fahrzeugart: null, relation: null, zahlungsbedingungKunde: null, zahlungsbedingungUnternehmer: null,
    ladeEntladestellen: [], LadeEntladestellen2: [], auftragspreise: [], tourkosten: [], fakturaZeilen: [{ AuftragID: 71, KopfID: 91 }],
    fakturaKopf: [{ KopfID: 91, BelegNr: '00115726', Belegart: 7, BelegDatum: '23.06.26', ExterneBelegnummer: '1099/06/2026', bUnternehmer: true, bProformabeleg: true, bRechnungskorrektur: false, Storniert: false, StornoRechungNr: 0,
      TextStorno: 'PROFORMA-Gutschrift zu UTN-Rechnung Nr. 1099/06/2026', PDFDateinameMitPfadFakturaBelegOriginal: 'Z:\\private\\ProformaGutschriftUTN_00115726_91_260623131951.pdf', PDFDateiname: 'INV_26_06_001099.pdf', IBAN: 'NEVER_COPY', ItemInternalId: 'volatile' }] }
}
const map = source => mapDycosOrder(source, '260000001')

test('external carrier invoice remains distinct from internal proforma booking and has no invented cancellation', () => {
  const result = map(payload()), doc = result.financial.documents[0]
  assert.deepEqual(doc, { id: 'dycos-document-91', sourceId: '91', side: 'carrier', businessType: 'carrier_invoice', issuer: 'partner', internalType: 'proforma_credit_note', internalNumber: '00115726', externalNumber: '1099/06/2026', date: '2026-06-23', currency: 'EUR', proforma: true, cancelled: false, cancellationReference: null, sourceDocumentCode: 7,
    originalDocumentSourceId: null, originalDocumentNumber: null, cancellationDate: null,
    internalFileName: 'ProformaGutschriftUTN_00115726_91_260623131951.pdf', externalFileName: 'INV_26_06_001099.pdf', warningCodes: [] })
  assert.doesNotMatch(JSON.stringify(doc), /NEVER_COPY|private|volatile|TextStorno|IBAN/)
})

test('own customer invoice and external customer credit note classify from original document and flags', () => {
  const source = payload(), doc = source.fakturaKopf[0]
  Object.assign(doc, { bUnternehmer: false, bProformabeleg: false, Belegart: 3, PDFDateinameMitPfadFakturaBelegOriginal: 'Z:\\Rechnung_63369_91_260615075906.pdf', ExterneBelegnummer: null })
  const invoice = map(source).financial.documents[0]
  assert.equal(invoice.businessType, 'customer_invoice')
  assert.equal(invoice.issuer, 'us')
  Object.assign(doc, { bProformabeleg: true, PDFDateinameMitPfadFakturaBelegOriginal: 'Z:\\ProformaRechnung_63369_91_260615075906.pdf' })
  const credit = map(source).financial.documents[0]
  assert.equal(credit.businessType, 'customer_credit_note')
  assert.equal(credit.issuer, 'partner')
  assert.equal(credit.internalType, 'proforma_invoice')
})

test('only exact order references admit document headers, including through prices and assigned tour costs', () => {
  const source = payload()
  source.auftragspreise = [{ AuftragID: 71, RechKopfID: 92 }]
  source.tourkosten = [{ AuftragID: 71, TourenID: 81, RechKopfID: 93 }, { AuftragID: 72, TourenID: 81, RechKopfID: 94 }, { AuftragID: 0, TourenID: 81, RechKopfID: 95 }]
  source.fakturaKopf.push(...[92, 93, 94, 95, 96].map(KopfID => ({ ...source.fakturaKopf[0], KopfID })))
  assert.deepEqual(map(source).financial.documents.map(doc => doc.sourceId), ['91', '92', '93'])
})

test('flags and filename disagreement never chooses a false issuer; unknown correction or cancellation remains unclassified', () => {
  const source = payload()
  source.fakturaKopf[0].bProformabeleg = false
  let result = map(source), doc = result.financial.documents[0]
  assert.equal(doc.businessType, 'unknown')
  assert.equal(doc.issuer, 'unknown')
  assert.equal(doc.internalType, 'unknown')
  assert.ok(result.source.warningCodes.includes('DOCUMENT_SOURCE_CONFLICT'))
  Object.assign(source.fakturaKopf[0], { bProformabeleg: true, bRechnungskorrektur: true })
  doc = map(source).financial.documents[0]
  assert.equal(doc.businessType, 'unknown')
  assert.ok(doc.warningCodes.includes('DOCUMENT_TYPE_UNCONFIRMED'))
  Object.assign(source.fakturaKopf[0], { bRechnungskorrektur: false, Storniert: true, StornoRechungNr: 123, PDFDateinameMitPfadFakturaBelegOriginal: 'StornoGutschrift_91.pdf' })
  doc = map(source).financial.documents[0]
  assert.equal(doc.cancelled, true)
  assert.equal(doc.cancellationReference, '123')
  assert.equal(doc.businessType, 'unknown')
})

test('sparse headers preserve nulls and invalid or technical document dates get a warning, not a fabricated date', () => {
  const source = payload()
  source.fakturaKopf = [{ KopfID: 91 }]
  let doc = map(source).financial.documents[0]
  for (const field of ['internalNumber', 'externalNumber', 'date', 'proforma', 'cancelled', 'cancellationReference', 'internalFileName', 'externalFileName', 'sourceDocumentCode']) assert.equal(doc[field], null)
  for (const value of ['31.02.26', '1899-12-30T00:00:00Z', 'n/a']) {
    source.fakturaKopf[0].BelegDatum = value
    doc = map(source).financial.documents[0]
    assert.equal(doc.date, null)
    assert.ok(doc.warningCodes.includes('DOCUMENT_DATE_UNCONFIRMED'))
  }
})

test('document IDs and ordering ignore connector metadata, source ordering and exact duplicate headers', () => {
  const source = payload()
  source.fakturaZeilen.push({ AuftragID: 71, KopfID: 92 })
  source.fakturaKopf.push({ ...source.fakturaKopf[0], KopfID: 92 })
  const expected = map(source).financial.documents
  source.fakturaKopf.reverse().forEach(row => { row.ItemInternalId = 'changed' })
  source.fakturaKopf.push({ ...source.fakturaKopf[0] })
  assert.deepEqual(map(source).financial.documents, expected)
  source.fakturaKopf.at(-1).BelegNr = 'CONFLICT'
  assert.throws(() => map(source), DycosMappingError)
})

test('assigned cost external number fills a missing header value, while conflicting structured numbers stay unresolved', () => {
  const source = payload()
  source.fakturaKopf[0].ExterneBelegnummer = null
  source.tourkosten = [{ AuftragID: 71, TourenID: 81, RechKopfID: 91, ExterneBelegNr: '1099/06/2026' }, { AuftragID: 72, TourenID: 81, RechKopfID: 91, ExterneBelegNr: 'FOREIGN' }]
  assert.equal(map(source).financial.documents[0].externalNumber, '1099/06/2026')
  source.fakturaKopf[0].ExterneBelegnummer = 'DIFFERENT'
  const result = map(source)
  assert.equal(result.financial.documents[0].externalNumber, null)
  assert.ok(result.financial.documents[0].warningCodes.includes('DOCUMENT_NUMBER_CONFLICT'))
  assert.ok(result.source.warningCodes.includes('DOCUMENT_NUMBER_CONFLICT'))
})

function cancellationPayload() {
  const source = payload()
  source.fakturaZeilen = [{ AuftragID: 71, KopfID: 101 }, { AuftragID: 71, KopfID: 102 }]
  source.fakturaKopf = [
    { KopfID: 101, BelegNr: '66966', BelegNrID: 66966, Belegart: 2, TextRechnung: 'RECHNUNG', BelegDatum: '26.10.26', Storniert: true, StornoRechungNr: 66966, StornoRechnungDatum: '27.10.2026', bUnternehmer: false, bProformabeleg: false, bRechnungskorrektur: false, PDFDateinameMitPfadFakturaBelegOriginal: 'Z:\\Rechnung_66966_101_261026102326.pdf' },
    { KopfID: 102, BelegNr: '66966', BelegNrID: 66966, Belegart: 5, TextRechnung: 'STORNO-RECHNUNG', TextStorno: '66966', BelegDatum: '27.10.26', Storniert: false, StornoRechungNr: 0, bUnternehmer: false, bProformabeleg: false, bRechnungskorrektur: false, PDFDateinameMitPfadFakturaBelegOriginal: 'Z:\\Stornorechnung_66966_102_261027112505.pdf' },
  ]
  return source
}

test('customer cancellation keeps both identical-number documents and links only the cancelled original by stable KopfID', () => {
  const source = cancellationPayload(), docs = map(source).financial.documents
  assert.equal(docs.length, 2)
  const [original, cancellation] = docs
  assert.equal(original.cancelled, true)
  assert.equal(original.businessType, 'customer_invoice')
  assert.equal(original.cancellationDate, '2026-10-27')
  assert.equal(cancellation.cancelled, false)
  assert.equal(cancellation.businessType, 'customer_invoice_cancellation')
  assert.equal(cancellation.internalType, 'invoice_cancellation')
  assert.equal(cancellation.issuer, 'us')
  assert.equal(cancellation.originalDocumentSourceId, '101')
  assert.equal(cancellation.originalDocumentNumber, '66966')
  assert.equal(cancellation.cancellationDate, null)
  assert.deepEqual(cancellation.warningCodes, [])
  source.fakturaKopf.reverse()
  source.fakturaZeilen.reverse()
  assert.deepEqual(map(source).financial.documents, docs)
})

test('missing, ambiguous, unrelated or contradictory original reference never picks a cancellation target', () => {
  for (const mutate of [
    source => { source.fakturaZeilen = [{ AuftragID: 71, KopfID: 102 }] },
    source => { source.fakturaKopf[0].BelegNrID = 999 },
    source => { source.fakturaKopf[0].Storniert = false },
    source => { source.fakturaKopf[0].StornoRechungNr = 999 },
    source => { source.fakturaKopf[0].StornoRechnungDatum = '28.10.2026' },
    source => { source.fakturaKopf[1].TextStorno = '999' },
    source => { delete source.fakturaKopf[1].BelegNrID },
    source => { source.fakturaKopf.push({ ...source.fakturaKopf[0], KopfID: 103 }); source.fakturaZeilen.push({ AuftragID: 71, KopfID: 103 }) },
  ]) {
    const source = cancellationPayload()
    mutate(source)
    const result = map(source), cancellation = result.financial.documents.find(doc => doc.sourceId === '102')
    assert.equal(cancellation.businessType, 'customer_invoice_cancellation')
    assert.equal(cancellation.originalDocumentSourceId, null)
    assert.equal(cancellation.originalDocumentNumber, null)
    assert.ok(cancellation.warningCodes.includes('DOCUMENT_CANCELLATION_UNCONFIRMED'))
    assert.ok(result.source.warningCodes.includes('DOCUMENT_CANCELLATION_UNCONFIRMED'))
  }
})

test('customer cancellation requires matching code, title, filename and flags; carrier cancellations remain unconfirmed', () => {
  for (const mutate of [
    row => { row.Belegart = 7 }, row => { row.TextRechnung = 'RECHNUNG' }, row => { row.bUnternehmer = true },
    row => { row.bProformabeleg = true }, row => { row.Storniert = true }, row => { row.bRechnungskorrektur = true },
    row => { row.PDFDateinameMitPfadFakturaBelegOriginal = 'Gutschrift_66966_102.pdf' },
  ]) {
    const source = cancellationPayload()
    mutate(source.fakturaKopf[1])
    const cancellation = map(source).financial.documents.find(doc => doc.sourceId === '102')
    assert.equal(cancellation.businessType, 'unknown')
    assert.equal(cancellation.issuer, 'unknown')
    assert.equal(cancellation.originalDocumentSourceId, null)
    assert.ok(cancellation.warningCodes.includes('DOCUMENT_SOURCE_CONFLICT'))
  }
})
