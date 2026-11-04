import test from 'node:test'
import assert from 'node:assert/strict'
import { liabilityDocumentLocations, liabilityStopNeedsReview } from './liabilityLetterContent.js'
import { createLiabilityDocumentData } from './liabilityDocumentData.js'
import { renderLiabilityLetterPdf } from '../lib/liabilityLetterPdfRenderer.js'
import { DEFAULT_COMPANY_DATA } from '../lib/companyDataModel.js'

test('selected stops preserve order and dates without including unselected legacy locations', () => {
  const data = {
    ...createLiabilityDocumentData(), loadingCompany: 'Nicht ausgewählt',
    selectedStops: [
      { id: 'unloading-2', type: 'unloading', company: 'Empfänger', street: 'Zielstraße 2', postalCode: '20095', city: 'Hamburg', country: 'DE', date: '2026-11-04' },
      { id: 'loading-2', type: 'loading', company: 'Versender', date: '2026-11-03' },
    ],
  }
  assert.deepEqual(liabilityDocumentLocations(data).map(({ heading, address }) => ({ heading, address })), [
    { heading: '04.11.2026 Entladestelle:', address: 'Empfänger, Zielstraße 2, 20095 Hamburg, DE' },
    { heading: '03.11.2026 Ladestelle:', address: 'Versender' },
  ])
})

test('explicit empty stop selection never falls back to legacy data', () => {
  assert.deepEqual(liabilityDocumentLocations({ loadingCompany: 'Nicht ausgewählt', selectedStops: [] }), [])
})

test('legacy manual document remains usable with flat address fields', () => {
  const data = { ...createLiabilityDocumentData(), loadingCompany: 'Lager', loadingZip: '10115', loadingCity: 'Berlin', loadingDate: '2026-11-02', unloadingCompany: 'Empfänger' }
  const locations = liabilityDocumentLocations(data)
  assert.equal(locations[0].heading, '02.11.2026 Ladestelle:')
  assert.equal(locations[0].address, 'Lager, 10115 Berlin')
  assert.equal(locations[1].address, 'Empfänger')
})

test('legacy imported full address text is preserved even with only a separate city', () => {
  const [location] = liabilityDocumentLocations({ selectedStops: [{ id: 'csv-loading', type: 'loading', originalText: 'Lager, Hafenstraße 1, DE 20095 Hamburg', city: 'Hamburg' }] })
  assert.equal(location.address, 'Lager, Hafenstraße 1, DE 20095 Hamburg')
})

test('PDF includes every selected location using the same text as the preview helper', () => {
  const written = []
  class PdfStub {
    setFont() {} setFontSize() {} setDrawColor() {} setLineWidth() {} line() {} addImage() {} addPage() {} setPage() {}
    splitTextToSize(value) { return String(value).split('\n') }
    text(value) { written.push(value) }
  }
  const data = { ...createLiabilityDocumentData(), selectedStops: Array.from({ length: 16 }, (_, index) => ({ id: String(index), type: index % 2 ? 'unloading' : 'loading', company: `Auswahl ${index}`, date: '2026-11-04' })) }
  renderLiabilityLetterPdf({ JsPdf: PdfStub, documentData: data, headerImage: '', company: DEFAULT_COMPANY_DATA })
  for (const location of liabilityDocumentLocations(data)) {
    assert.ok(written.includes(location.heading))
    assert.ok(written.includes(location.address))
  }
  assert.ok(written.some(value => String(value).startsWith('Seite ')), 'multiple locations paginate')
  assert.ok(!written.some(value => /Erste Ladestelle|Letzte Entladestelle/.test(String(value))))
})

test('incomplete selected structured locations require review, legacy full address still works', () => {
  assert.equal(liabilityStopNeedsReview({ company: 'Firma', date: '2026-11-04' }), true)
  assert.equal(liabilityStopNeedsReview({ company: 'Firma', street: 'Weg 1', postalCode: '12345', city: 'Ort', country: 'DE', date: '2026-11-04' }), false)
  assert.equal(liabilityStopNeedsReview({ originalText: 'Firma, Weg 1, 12345 Ort, DE', date: '2026-11-04' }), false)
  assert.equal(liabilityStopNeedsReview({ originalText: '   ', date: '2026-11-04' }), true)
  assert.equal(liabilityStopNeedsReview({ originalText: 'Firma, Weg 1, 12345 Ort, DE' }), true)
})
