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
  assert.deepEqual(result.financial, { revenueNet: 0, costNet: 0, currency: 'EUR', revenuePositions: [], costPositions: [], documents: [] })
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

test('transport details retain source descriptions and vehicle information without inventing dimensions', () => {
  const data = sample()
  data.auftrag.Ware = '  Handelsware\nauf Paletten  '
  data.fahrzeugart.Informationen = '  Seitlich beladbar  '
  data.ladeEntladestellen.find(row => row.ID === 31).Ware = '  Ware der ersten Station  '
  data.ladeEntladestellen.find(row => row.ID === 31).Masse = 'Ungeklärte Quellenangabe'
  const result = map(data)
  assert.equal(result.shipment.goodsDescription, 'Handelsware\nauf Paletten')
  assert.equal(result.shipment.vehicleInformation, 'Seitlich beladbar')
  assert.equal(result.stops[0].cargo.description, 'Ware der ersten Station')
  assert.equal(result.stops[1].cargo.description, null)
  assert.equal(result.stops[0].cargo.dimensions, undefined)
  assert.equal(JSON.stringify(result).includes('Ungeklärte Quellenangabe'), false)
})

test('hazardous goods is an explicit source tri-state and never inferred from goods text', () => {
  for (const [value, expected] of [[true, true], [false, false], [1, true], [0, false], [null, null], [undefined, null]]) {
    const data = sample()
    data.auftrag.Gefahrgut = value
    data.auftrag.Ware = 'ADR im unveränderten Warenfreitext'
    assert.equal(map(data).shipment.hazardousGoods, expected)
  }
})

test('volumetric station weight follows the supplementary station join and never replaces physical weights', () => {
  const data = sample()
  data.LadeEntladestellen2 = [
    { LadeEntladestellenID: 34, Volumengewicht_gesamt_kg: 0 },
    { LadeEntladestellenID: 31, Volumengewicht_gesamt_kg: '1.250,50' },
  ]
  const result = map(data)
  assert.deepEqual(result.stops.map(stop => stop.cargo.volumetricWeightKg), [1250.5, null, null, 0])
  assert.equal(result.shipment.weightKg, 24000.5)
  assert.equal(result.stops[0].cargo.weightKg, null)
  data.LadeEntladestellen2.reverse()
  assert.deepEqual(map(data), result)
  data.LadeEntladestellen2[0].Volumengewicht_gesamt_kg = null
  assert.equal(map(data).stops[0].cargo.volumetricWeightKg, null)
  for (const invalid of [-1, 'unbekannt', true, Number.POSITIVE_INFINITY]) {
    data.LadeEntladestellen2[0].Volumengewicht_gesamt_kg = invalid
    assert.throws(() => map(data), error => error instanceof DycosMappingError && error.field === 'LadeEntladestellen2.Volumengewicht_gesamt_kg')
  }
})

test('retired DyCoS distances are ignored, including malformed values, and never supply a calculated route', () => {
  const data = sample(), baseline = map(data)
  Object.assign(data.auftrag, { Gesamtkilometer: '100,50', Autobahnkilometer: 70, Leerkilometer: 0, KMGeroutet: false })
  Object.assign(data.tour, { Gesamtkilometer: 500, Autobahnkilometer: '300,25', Leerkilometer: 10, Geroutet: 1 })
  assert.deepEqual(map(data), baseline)
  Object.assign(data.auftrag, { Gesamtkilometer: -1, Autobahnkilometer: true, Leerkilometer: 'unbekannt', KMGeroutet: 'true' })
  Object.assign(data.tour, { Gesamtkilometer: Number.POSITIVE_INFINITY, Geroutet: 3 })
  const result = map(data)
  assert.deepEqual(result, baseline)
  assert.equal(Object.hasOwn(result, 'distances'), false)
  assert.equal(result.route, undefined)
  assert.equal(result.shipment.distanceKm, undefined)
})

test('missing optional transport fields remain unknown, including absent tour or vehicle lookups', () => {
  const result = map(emptyOrder())
  assert.equal(result.shipment.goodsDescription, null)
  assert.equal(result.shipment.vehicleInformation, null)
  assert.equal(result.shipment.hazardousGoods, null)
  assert.equal(Object.hasOwn(result, 'distances'), false)
})

test('legacy preservation retains only its established fields and never substitutes previous transport source values', () => {
  const previous = {
    shipment: { goodsDescription: 'Alte Ware', hazardousGoods: true, vehicleInformation: 'Alter Hinweis', weightKg: 100 },
    distances: { order: { totalKm: 500, routed: true } },
  }
  const next = map(emptyOrder())
  const preserved = preserveDycosUnmappedFields(previous, next)
  assert.equal(preserved.imported.shipment.weightKg, 100)
  assert.equal(preserved.imported.shipment.goodsDescription, null)
  assert.equal(preserved.imported.shipment.hazardousGoods, null)
  assert.equal(preserved.imported.shipment.vehicleInformation, null)
  assert.equal(Object.hasOwn(preserved.imported, 'distances'), false)
  assert.deepEqual(preserved.preservedPaths, ['shipment.weightKg'])
  assert.equal(next.shipment.weightKg, null)
  assert.equal(preserved.imported.source.system, 'dycos')
  assert.equal(preserved.imported.source.schemaVersion, 2)
})

test('invalid transport detail inputs are rejected without string or boolean coercion', () => {
  for (const mutate of [
    data => { data.auftrag.Ware = 12 },
    data => { data.auftrag.Gefahrgut = 'false' },
    data => { data.auftrag.Gefahrgut = 2 },
    data => { data.fahrzeugart.Informationen = {} },
    data => { data.ladeEntladestellen[0].Ware = false },
  ]) {
    const data = sample(); mutate(data)
    assert.throws(() => map(data), DycosMappingError)
  }
})

test('uses only slot clock and its associated station arrival date without timezone shifting', () => {
  const result = map(sample())
  assert.equal(result.loading.window.from, '2026-11-01T08:00')
  assert.equal(result.loading.window.until, '2026-11-01T16:00')
  assert.equal(result.unloading.window.until, '2026-11-04T11:00')
  assert.equal(result.stops[3].slotUntilTime, '11:00')
  assert.equal(result.dispatch.sentAt, null)
})

test('joins fixed appointments by station ID, preserving true and false independently from slot times', () => {
  const data = sample()
  data.LadeEntladestellen2 = [
    { LadeEntladestellenID: 34, Fixtermin: false, Slotzeit: '2026-11-04T11:00:00Z' },
    { LadeEntladestellenID: 32, Fixtermin: true },
    { LadeEntladestellenID: 31, Fixtermin: true, Slotzeit: null },
    { LadeEntladestellenID: 33, Fixtermin: false },
  ]
  const result = map(data)
  assert.deepEqual(result.stops.map(stop => [stop.sourceId, stop.fixedAppointment]), [['31', true], ['32', true], ['33', false], ['34', false]])
  assert.equal(result.loading.fixedAppointment, true)
  assert.equal(result.loading.window.until, null)
  assert.equal(result.unloading.fixedAppointment, false)
  assert.equal(result.unloading.window.until, '2026-11-04T11:00')
  const reordered = structuredClone(data)
  reordered.ladeEntladestellen.reverse()
  reordered.LadeEntladestellen2.reverse()
  assert.deepEqual(map(reordered), result)
  assert.deepEqual(map(data), result)
})

test('normalizes numeric fixed appointments without coercing false into a missing value', () => {
  const data = sample()
  data.LadeEntladestellen2[0].Fixtermin = 0
  data.LadeEntladestellen2[1].Fixtermin = 1
  const result = map(data)
  assert.equal(result.stops[0].fixedAppointment, false)
  assert.equal(result.loading.fixedAppointment, false)
  assert.equal(result.stops[3].fixedAppointment, true)
  assert.equal(result.unloading.fixedAppointment, true)
})

test('missing fixed appointment data remains null and is never inferred from times or notes', () => {
  const data = sample()
  data.LadeEntladestellen2[0].Fixtermin = null
  data.ladeEntladestellen[0].Bemerkung = 'Fixtermin 08:00 Uhr'
  const result = map(data)
  assert.deepEqual(result.stops.map(stop => stop.fixedAppointment), [null, null, null, null])
  assert.equal(result.loading.fixedAppointment, null)
  assert.equal(result.unloading.fixedAppointment, null)
  const empty = map(emptyOrder())
  assert.equal(empty.loading.fixedAppointment, null)
  assert.equal(empty.unloading.fixedAppointment, null)
})

test('rejects unconfirmed fixed appointment values instead of guessing a boolean', () => {
  for (const invalid of ['true', 'false', '0', '1', 2, -1, 0.5, {}, []]) {
    const data = sample()
    data.LadeEntladestellen2[0].Fixtermin = invalid
    assert.throws(() => map(data), error => error instanceof DycosMappingError && error.field === 'LadeEntladestellen2.Fixtermin')
  }
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
  assert.equal(result.imported.loading.reference, null)
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
  assert.deepEqual(result.stops[0].cargo, { description: null, volumetricWeightKg: null, weightKg: 1600, packages: 9, loadingMeters: 6.5 })
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


test('confirmed station delivery information replaces old reference while notes and disposition stay separate', () => {
  const source = sample()
  source.auftrag.DispoBemerkung = 'Disposition: Ansprechpartner prüfen'
  const station = source.ladeEntladestellen.find(row => row.ID === 31)
  station.Zustellinformation = '(L1) Abholung lt. Lieferschein'
  station.Bemerkung = '(L1) Seitlich laden'
  station.LieferscheinNr = 'LS-123'
  const result = preserveDycosUnmappedFields({ loading: { reference: 'OLD' } }, map(source))
  assert.equal(result.imported.loading.reference, '(L1) Abholung lt. Lieferschein')
  assert.equal(result.imported.loading.note, '(L1) Seitlich laden')
  assert.equal(result.imported.dispositionNote, 'Disposition: Ansprechpartner prüfen')
  assert.equal(result.imported.stops.find(row => row.sourceId === '31').deliveryNoteNumber, 'LS-123')
  assert.equal(result.preservedPaths.includes('loading.reference'), false)
})

test('referenced station addresses resolve exact SQL identity and feed first/last summaries', () => {
  const source = sample()
  const loading = source.ladeEntladestellen.find(row => row.ID === 31)
  Object.assign(loading, { AdressID: 15150, Firma: null, Strasse: '', PLZ: ' ', Ort: null, Land: '' })
  const lastUnloading = source.ladeEntladestellen.find(row => row.ID === 34)
  Object.assign(lastUnloading, { AdressID: source.kunde.ID, Firma: '', Strasse: '', PLZ: '', Ort: '', Land: '' })
  source.stationAddresses = [{ ID: 15150, Firma: 'LGH Hamburg', Strasse: 'Bredowstr. 10', PLZ: '22113', Ort: 'Hamburg', Land: 'D', IBAN: 'DO-NOT-COPY', EMailZentrale: 'DO-NOT-COPY' }]
  const result = map(source)
  assert.deepEqual(result.stops[0].address, { company: 'LGH Hamburg', street: 'Bredowstr. 10', postalCode: '22113', city: 'Hamburg', country: 'D' })
  assert.equal(result.stops[0].addressSourceId, '15150')
  assert.equal(result.stops[0].addressSource, 'reference')
  assert.equal(result.loading.city, 'Hamburg')
  assert.equal(result.loading.originalText, 'LGH Hamburg, Bredowstr. 10, D 22113 Hamburg')
  assert.deepEqual(result.stops[3].address, { company: 'Beispielkunde', street: 'Musterweg 1', postalCode: '10115', city: 'Berlin', country: 'DE' })
  assert.equal(result.unloading.city, 'Berlin')
  assert.equal(JSON.stringify(result).includes('DO-NOT-COPY'), false)
})

test('same-payload customer is used only for the exact referenced SQL ID, never its debtor number', () => {
  const source = sample()
  const loading = source.ladeEntladestellen.find(row => row.ID === 31)
  Object.assign(loading, { Firma: '', Ort: '', AdressID: source.kunde.Debitorennummer })
  const result = map(source)
  assert.deepEqual(result.stops[0].address, { company: null, street: null, postalCode: null, city: null, country: null })
  assert.equal(result.stops[0].addressSource, 'unresolved-reference')
  assert.ok(result.source.warningCodes.includes('STATION_ADDRESS_REFERENCE_UNRESOLVED'))
  loading.AdressID = source.kunde.ID
  const exact = map(source)
  assert.equal(exact.stops[0].address.company, 'Beispielkunde')
  assert.equal(exact.stops[0].addressSource, 'reference')
})

test('explicit address lookup wins over a same-ID customer copy without merging address blocks', () => {
  const source = sample()
  Object.assign(source.ladeEntladestellen.find(row => row.ID === 31), { Firma: '', Ort: '', AdressID: source.kunde.ID })
  source.stationAddresses = [{ ID: source.kunde.ID, Firma: 'Geprüfte Station', Strasse: null, PLZ: null, Ort: null, Land: null }]
  const result = map(source)
  assert.deepEqual(result.stops[0].address, { company: 'Geprüfte Station', street: null, postalCode: null, city: null, country: null })
})

test('partial inline station addresses are preserved as a whole and never fieldwise enriched', () => {
  const source = sample()
  Object.assign(source.ladeEntladestellen.find(row => row.ID === 31), { AdressID: 15150, Firma: 'Abweichende Ladestelle', Ort: '' })
  source.stationAddresses = [{ ID: 15150, Firma: 'Stammadresse', Strasse: 'Andere Straße 1', PLZ: '22113', Ort: 'Hamburg', Land: 'D' }]
  const result = map(source)
  assert.deepEqual(result.stops[0].address, { company: 'Abweichende Ladestelle', street: null, postalCode: null, city: null, country: null })
  assert.equal(result.stops[0].addressSourceId, '15150')
  assert.equal(result.stops[0].addressSource, 'inline')
  assert.equal(result.source.warningCodes.includes('STATION_ADDRESS_REFERENCE_UNRESOLVED'), false)
})

test('missing or empty referenced rows are explicit warnings; legacy no-reference shape stays unchanged', () => {
  const source = sample()
  const legacy = map(source)
  assert.equal(Object.hasOwn(legacy.stops[0], 'addressSource'), false)
  assert.equal(Object.hasOwn(legacy.stops[0], 'addressSourceId'), false)
  Object.assign(source.ladeEntladestellen.find(row => row.ID === 31), { AdressID: 15150, Firma: '', Ort: '' })
  source.stationAddresses = []
  const unresolved = map(source)
  assert.ok(unresolved.source.warningCodes.includes('STATION_ADDRESS_REFERENCE_UNRESOLVED'))
  source.stationAddresses = [{ ID: 15150, Firma: '', Strasse: '', PLZ: null, Ort: null, Land: null }]
  const empty = map(source)
  assert.ok(empty.source.warningCodes.includes('STATION_ADDRESS_REFERENCE_EMPTY'))
  assert.equal(empty.stops[0].addressSource, 'reference')
})

test('optional station address extension rejects malformed, duplicate and unrelated source identities', () => {
  for (const invalid of [null, {}, [null], Array.from({ length: 2001 }, () => ({}))]) {
    const source = sample(); source.stationAddresses = invalid
    assert.throws(() => map(source), error => error instanceof DycosMappingError && error.field === 'stationAddresses')
  }
  for (const [rows, field] of [
    [[{ ID: 99 }], 'stationAddresses.unrelatedAddress'],
    [[{ ID: 0 }], 'stationAddresses.ID'],
    [[{ ID: 15150 }, { ID: '15150' }], 'stationAddresses.duplicateAddress'],
    [[{ ID: 15150, Firma: {} }], 'stationAddresses.Firma'],
  ]) {
    const source = sample(); source.ladeEntladestellen[0].AdressID = 15150; source.stationAddresses = rows
    assert.throws(() => map(source), error => error instanceof DycosMappingError && error.field === field)
  }
  const invalidReference = sample(); invalidReference.ladeEntladestellen[0].AdressID = -1
  assert.throws(() => map(invalidReference), error => error instanceof DycosMappingError && error.field === 'ladeEntladestellen.AdressID')
})
