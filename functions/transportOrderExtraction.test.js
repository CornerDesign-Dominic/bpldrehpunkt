import test from 'node:test'
import assert from 'node:assert/strict'
import { extractTransportOrderFromLines } from './transportOrderExtraction.js'

test('extracts the first loading and last unloading station from the multi-stop reference layout', () => {
  const { data } = extractTransportOrderFromLines([
    'Brennpunkt Logistik GmbH · Reinshagenstr. 1 · D-42369 Wuppertal',
    'GBE SAS', 'Justine Durand Transportauftrag260400834', 'PARC DES ALIZES - ZI EST - ROUTE DU CANAL DE', 'TANCARVILLE', 'FR 76430 SANDOUVILLE', 'Telefon: +33 2 35 19 28 82',
    'LKW-Art Tautliner',
    '1. Ladestelle(n) J & W Stollenwerk OHG, Am Roßpfad 2, D - 52399 Merzenich', 'Termin 29.04.2026 -> 08:00 - 16:00 Uhr',
    '1. Entladestelle EDEKA Norbayern, Edekastr. 1, D - 95615 Marktredwitz', 'Termin 30.04.2026 -> 11:00 - 13:00 Uhr',
    '2. Entladestelle Fiedler Deckensysteme GmbH & Co. KG, Rathaushütte 1, D - 95615 Marktredwitz', 'Termin 04.05.2026 -> 08:00 - 14:00 Uhr', 'Frachtpreis: 1.300,00 EUR ohne MwSt.',
  ])

  assert.equal(data.orderNumber, '260400834')
  assert.equal(data.carrier.company, 'GBE SAS')
  assert.deepEqual(data.loadingPlace, { company: 'J & W Stollenwerk OHG', street: 'Am Roßpfad 2', postalCode: '52399', city: 'Merzenich', country: 'Deutschland', date: '2026-04-29' })
  assert.deepEqual(data.unloadingPlace, { company: 'Fiedler Deckensysteme GmbH & Co. KG', street: 'Rathaushütte 1', postalCode: '95615', city: 'Marktredwitz', country: 'Deutschland', date: '2026-05-04' })
})

test('extracts the carrier, single loading and unloading station from the second reference layout', () => {
  const { data } = extractTransportOrderFromLines([
    'Brennpunkt Logistik GmbH · Reinshagenstr. 1 · D-42369 Wuppertal',
    'Intermarc Srl', 'Herr Bogdan-Marian Vâlcea Transportauftrag260900168', 'STIRBEI VODA, nr30, et.5', 'RO 299423 Craiova', 'Telefon: +40 770 825 440',
    'LKW-Art Sprinter',
    '1. Ladestelle(n) A.S.T. Bochum GmbH, Kolkmannskamp 8, D - 44879 Bochum', 'Termin 02.09.2026 -> 07:00 - 15:00 Uhr',
    '1. Entladestelle Laut Lieferschein, laut Lieferschein, AT - 6425 Haiming', 'Termin 03.09.2026 -> 07:00 - 16:00 Uhr', 'Frachtpreis: 500,00 EUR ohne MwSt.',
  ])

  assert.equal(data.orderNumber, '260900168')
  assert.equal(data.carrier.company, 'Intermarc Srl')
  assert.deepEqual(data.loadingPlace, { company: 'A.S.T. Bochum GmbH', street: 'Kolkmannskamp 8', postalCode: '44879', city: 'Bochum', country: 'Deutschland', date: '2026-09-02' })
  assert.deepEqual(data.unloadingPlace, { company: 'Laut Lieferschein', street: '', postalCode: '6425', city: 'Haiming', country: 'Österreich', date: '2026-09-03' })
})
