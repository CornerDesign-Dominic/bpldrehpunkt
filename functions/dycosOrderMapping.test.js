import assert from 'node:assert/strict'
import test from 'node:test'
import { DycosMappingError, dycosUnmappedImportPaths, mapDycosOrder, preserveDycosUnmappedFields } from './dycosOrderMapping.js'

function emptyOrder() {
  return {
    auftrag: { ID: 71, Nummer: 260000001 },
    ladeEntladestellen: [], kunde: null, tour: null, unternehmerstamm: null,
    fahrzeugart: null, auftragspreise: [], tourkosten: [], relation: null,
    zahlungsbedingungKunde: null, zahlungsbedingungUnternehmer: null,
    fakturaZeilen: [], fakturaKopf: [], LadeEntladestellen2: [],
  }
}
function sample() {
  const data = emptyOrder()
  data.auftrag = { ...data.auftrag, FrachtzahlerID: 11, TourenID: 13, RelationsID: 17, FahrzeugartID: 19, Gewicht: '24.000,5', Lademeter: '13,6', AnzahlKolli: '33,00', Referenznummer: 'REF-1' }
  data.kunde = { ID: 11, Firma: 'Beispielkunde', Debitorennummer: 10101, Zahlungsbedingung: 21, Strasse: 'Musterweg 1', PLZ: '10115', Ort: 'Berlin', Land: 'DE', IBAN: 'DO-NOT-COPY', LoginKpi: 'DO-NOT-COPY' }
  data.tour = { ID: 13, UnternehmerID: 15, LKWNummer: 'AA-X 1', Trailer: 'AA-Y 2', TAPerMailDatum: '1899-12-30T00:00:00Z' }
  data.unternehmerstamm = { ID: 15, Bezeichnung: 'Beispielunternehmer', Kreditorennummer: 70101, Zahlungsbedingung: 23, Strasse: 'Beispielweg 2', PLZ: '20095', Ort: 'Hamburg', Land: 'DE', Logenios_ApiKey: 'DO-NOT-COPY' }
  data.relation = { ID: 17, Nummer: 9, Bezeichnung: '02 Disposition' }
  data.fahrzeugart = { ID: 19, Bezeichnung: 'Sattelzug' }
  data.zahlungsbedingungKunde = { ID: 21, Bezeichnung: '30 Tage' }
  data.zahlungsbedingungUnternehmer = { ID: 23, Bezeichnung: '14 Tage' }
  data.ladeEntladestellen = [
    { ID: 33, AuftragsID: 71, Zeile_In_Auftrag: 3, Lade_Entladestelle: 'E', Firma: 'Entladung 1', Ankunft: '2026-11-03T08:00:00Z' },
    { ID: 31, AuftragsID: 71, Zeile_In_Auftrag: 1, Lade_Entladestelle: 'L', Firma: 'Ladung 1', Ort: 'Berlin', Ankunft: '2026-11-01T08:00:00Z' },
    { ID: 34, AuftragsID: 71, Zeile_In_Auftrag: 4, Lade_Entladestelle: 'E', Firma: 'Entladung 2', Ort: 'Hamburg', Ankunft: '2026-11-04T08:00:00Z' },
    { ID: 32, AuftragsID: 71, Zeile_In_Auftrag: 2, Lade_Entladestelle: 'L', Firma: 'Ladung 2', Ankunft: '2026-11-02T08:00:00Z' },
  ]
  data.LadeEntladestellen2 = [
    { ID: 41, LadeEntladestellenID: 31, Slotzeit: '1899-12-30T16:00:00Z' },
    { ID: 44, LadeEntladestellenID: 34, Slotzeit: '2021-01-01T11:00:00Z' },
  ]
  data.auftragspreise = [{ AuftragID: 71, Gesamt: 100.1, GesamtEUR: 0 }, { AuftragID: 71, Gesamt: '2,20', GesamtEUR: 0 }]
  data.tourkosten = [{ AuftragID: 71, TourenID: 13, Gesamt: '80,50' }, { AuftragID: 72, TourenID: 13, Gesamt: 500 }, { AuftragID: 0, TourenID: 13, Gesamt: 900 }]
  return data
}
const map = (payload) => mapDycosOrder(payload, '260000001')

test('a valid TA needs no business data and missing prices are numeric zero', () => {
  const result = map(emptyOrder())
  assert.equal(result.externalNumber, '260000001')
  assert.equal(result.customer.name, '')
  assert.equal(result.carrier.originalName, '')
  assert.deepEqual(result.financial, { revenueNet: 0, costNet: 0, currency: 'EUR', revenuePositions: [], costPositions: [] })
  assert.deepEqual(result.stops, [])
  assert.deepEqual(result.loading.window, { from: null, until: null })
  assert.equal(result.source.orderId, '71')
})

test('maps numbers, identities, first loading and last unloading by station sequence', () => {
  const result = map(sample())
  assert.deepEqual(result.stops.map((stop) => stop.sourceId), ['31', '32', '33', '34'])
  assert.equal(result.loading.city, 'Berlin')
  assert.equal(result.unloading.city, 'Hamburg')
  assert.equal(result.customer.debtorNumber, '10101')
  assert.equal(result.carrier.creditorNumber, '70101')
  assert.equal(result.carrier.snapshot.street, 'Beispielweg 2')
  assert.equal(result.relation, '02 Disposition')
  assert.equal(result.shipment.weightKg, 24000.5)
  assert.equal(result.shipment.loadingMeters, 13.6)
  assert.equal(result.shipment.packages, 33)
  assert.equal(result.shipment.licensePlate, 'AA-X 1 / AA-Y 2')
  assert.equal(result.source.carrierId, '15')
})

test('uses only slot clock and its associated station arrival date without timezone shifting', () => {
  const result = map(sample())
  assert.equal(result.loading.window.from, '2026-11-01T08:00')
  assert.equal(result.loading.window.until, '2026-11-01T16:00')
  assert.equal(result.unloading.window.until, '2026-11-04T11:00')
  assert.equal(result.stops[3].slotUntilTime, '11:00')
  assert.equal(result.dispatch.sentAt, null)
})

test('slot without station date retains clock without inventing a timestamp', () => {
  const data = sample()
  data.ladeEntladestellen.find((row) => row.ID === 31).Ankunft = null
  const result = map(data)
  assert.deepEqual(result.loading.window, { from: null, until: null })
  assert.equal(result.stops[0].slotUntilTime, '16:00')
})

test('unconfirmed midnight and overnight slot semantics retain raw clock with explicit warnings', () => {
  const data = sample()
  data.LadeEntladestellen2[0].Slotzeit = '1899-12-30T00:00:00Z'
  data.LadeEntladestellen2[1].Slotzeit = '1899-12-30T07:00:00Z'
  const result = map(data)
  assert.equal(result.loading.window.until, null)
  assert.equal(result.unloading.window.until, null)
  assert.equal(result.stops[0].slotUntilTime, '00:00')
  assert.deepEqual(result.source.warningCodes, ['SLOT_MIDNIGHT_UNCONFIRMED', 'SLOT_OVERNIGHT_UNCONFIRMED', 'TOUR_COSTS_NOT_ASSIGNED_TO_ORDER'])
})

test('sums source Gesamt positions and excludes unrelated or unassigned tour costs', () => {
  const result = map(sample())
  assert.equal(result.financial.revenueNet, 102.3)
  assert.equal(result.financial.costNet, 80.5)
  assert.equal(result.financial.revenuePositions.length, 2)
  assert.equal(result.financial.costPositions.length, 1)
  assert.ok(result.source.warningCodes.includes('TOUR_COSTS_NOT_ASSIGNED_TO_ORDER'))
})

test('unknown source columns, credentials and bank information do not enter snapshots', () => {
  const result = map(sample())
  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes('DO-NOT-COPY'), false)
  assert.equal(serialized.includes('IBAN'), false)
  assert.equal(serialized.includes('LoginKpi'), false)
  assert.equal(serialized.includes('ApiKey'), false)
})

test('rejects wrong TA, partial response and malformed source values without empty success', () => {
  for (const mutate of [
    (data) => { data.auftrag.Nummer = 260000002 },
    (data) => { delete data.tour },
    (data) => { data.tourkosten = null },
    (data) => { data.auftrag.Gewicht = 'twenty' },
    (data) => { data.auftrag.Gewicht = true },
    (data) => { data.auftrag.AnzahlKolli = '1,25' },
    (data) => { data.ladeEntladestellen[0].Ankunft = '2026-02-30T08:00:00Z' },
    (data) => { data.LadeEntladestellen2[0].Slotzeit = '1899-12-30T25:00:00Z' },
    (data) => { data.auftragspreise[0].Gesamt = 'invalid' },
  ]) {
    const data = sample(); mutate(data)
    assert.throws(() => map(data), DycosMappingError)
  }
})

test('rejects cross-order and inconsistent SQL joins', () => {
  for (const mutate of [
    (data) => { data.kunde.ID = 12 },
    (data) => { data.tour.ID = 12 },
    (data) => { data.unternehmerstamm.ID = 12 },
    (data) => { data.fahrzeugart.ID = 12 },
    (data) => { data.relation.ID = 12 },
    (data) => { data.zahlungsbedingungKunde.ID = 12 },
    (data) => { data.ladeEntladestellen[0].AuftragsID = 72 },
    (data) => { data.ladeEntladestellen[0].ID = 31 },
    (data) => { data.LadeEntladestellen2[0].LadeEntladestellenID = 999 },
    (data) => { data.LadeEntladestellen2.push({ ...data.LadeEntladestellen2[0] }) },
    (data) => { data.auftragspreise[0].AuftragID = 72 },
    (data) => { data.tourkosten[0].TourenID = 14 },
    (data) => { data.fakturaZeilen.push({ AuftragID: 72 }) },
  ]) {
    const data = sample(); mutate(data)
    assert.throws(() => map(data), DycosMappingError)
  }
})

test('preserves only explicitly unmapped CSV fields while updating actual API data', () => {
  const previous = { loading: { reference: 'LD-OLD', city: 'Old city' }, unloading: { reference: 'ED-OLD' }, contacts: { carrierForOrder: 'carrier@example.invalid', carrierStandardEmail: 'standard@example.invalid', customerForOrder: 'old customer text', customerStandardEmail: 'customer@example.invalid' }, financial: { revenueNet: 999 } }
  const next = map(emptyOrder())
  const result = preserveDycosUnmappedFields(previous, next)
  assert.deepEqual(result.preservedPaths, dycosUnmappedImportPaths)
  assert.equal(result.imported.loading.reference, 'LD-OLD')
  assert.equal(result.imported.loading.city, null)
  assert.equal(result.imported.contacts.customerForOrder, null)
  assert.equal(result.imported.financial.revenueNet, 0)
  assert.equal(next.loading.reference, null)
  assert.equal(previous.financial.revenueNet, 999)
})

test('TA zero remains a valid requested identity if the response matches', () => {
  const data = emptyOrder(); data.auftrag.Nummer = 0
  assert.equal(mapDycosOrder(data, '0').externalNumber, '0')
})

test('line items retain source totals, duplicates and stable IDs without connector metadata or foreign tour costs', () => {
  const data = sample()
  const line = { AuftragID: 71, AuftragPos: 2, LeistungText: 'Fracht', Menge: '2,5', Einheit: 'km', Preis: '10,00', Gesamt: '24,00', RechKopfID: 90, FakturaPosID: 91, ItemInternalId: 'volatile' }
  data.auftragspreise = [line, { ...line }, { AuftragID: 71, AuftragPos: 1, Gesamt: null }]
  const result = map(data)
  const positions = result.financial.revenuePositions
  assert.equal(result.financial.revenueNet, 48)
  assert.equal(positions[0].unitPriceNet, 0)
  assert.equal(positions[0].amountNet, 0)
  assert.equal(positions[0].quantity, null)
  assert.equal(positions[1].quantity, 2.5)
  assert.equal(positions[1].unitPriceNet, 10)
  assert.equal(positions[1].amountNet, 24)
  assert.equal(positions[1].documentSourceId, '90')
  assert.equal(new Set(positions.map((entry) => entry.id)).size, 3)
  assert.equal(JSON.stringify(positions).includes('volatile'), false)
  data.auftragspreise.reverse().forEach((entry) => { entry.ItemInternalId = 'another-request' })
  assert.deepEqual(map(data).financial.revenuePositions, positions)
  assert.equal(result.financial.costPositions.length, 1)
  assert.equal(result.financial.costPositions[0].amountNet, 80.5)
})

test('station cargo remains per station, pallet exchange is tri-state and creator stays a source code', () => {
  const data = sample()
  data.auftrag.BearbeiterErfassung = ' AW '
  Object.assign(data.ladeEntladestellen[1], { Gewicht: '1.600,00', Kolli: '9', Lademeter: '6,5', Palettentausch: true })
  data.ladeEntladestellen[0].Palettentausch = false
  const result = map(data)
  assert.deepEqual(result.stops[0].cargo, { weightKg: 1600, packages: 9, loadingMeters: 6.5 })
  assert.equal(result.stops[0].palletExchange, true)
  assert.equal(result.stops[1].palletExchange, null)
  assert.equal(result.stops[2].palletExchange, false)
  assert.equal(result.source.createdBy, 'AW')
  assert.equal(result.shipment.weightKg, 24000.5)
  for (const invalid of [{ Kolli: '1,5' }, { Gewicht: -1 }, { Palettentausch: 'maybe' }]) {
    const invalidData = sample()
    Object.assign(invalidData.ladeEntladestellen[1], invalid)
    assert.throws(() => map(invalidData), DycosMappingError)
  }
})

test('missing API totals preserve CSV quantities without allocating them to stops; explicit zero wins', () => {
  const previous = { shipment: { weightKg: 24000, packages: 33, loadingMeters: 13.6 } }
  const data = sample()
  delete data.auftrag.Gewicht
  delete data.auftrag.AnzahlKolli
  data.auftrag.Lademeter = 0
  const result = preserveDycosUnmappedFields(previous, map(data))
  assert.deepEqual(result.preservedPaths, ['shipment.weightKg', 'shipment.packages'])
  assert.equal(result.imported.shipment.weightKg, 24000)
  assert.equal(result.imported.shipment.packages, 33)
  assert.equal(result.imported.shipment.loadingMeters, 0)
  assert.equal(result.imported.stops[0].cargo.weightKg, null)
  assert.equal(previous.shipment.loadingMeters, 13.6)
})
