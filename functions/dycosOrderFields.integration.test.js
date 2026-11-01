import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchDycosTransportOrderHandler } from './dycosTransportOrders.js'
import { transportOrderHistoryRows } from '../src/lib/transportOrderHistoryPresentation.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) initializeApp({ projectId: 'demo-drehpunkt-order-fields' })

test('emulator: transport source details persist and refresh with distinct distances, false flags and station descriptions', { skip: !enabled }, async () => {
  const db = getFirestore(), uid = `transport-${randomUUID()}`, ta = `2610${String(Date.now()).slice(-5)}`
  await db.doc(`users/${uid}`).set({ active: true, role: 'user', permissions: { dataImports: 'edit' } })
  const payload = {
    auftrag: { ID: 71, Nummer: Number(ta), Ladedatum: '2026-10-01', TourenID: 13, FahrzeugartID: 19 },
    tour: { ID: 13 }, fahrzeugart: { ID: 19, Bezeichnung: 'Planensattel' },
    ladeEntladestellen: [{ ID: 31, AuftragsID: 71, Lade_Entladestelle: 'L', Zeile_In_Auftrag: 1 }],
    LadeEntladestellen2: [], kunde: null, unternehmerstamm: null, relation: null,
    zahlungsbedingungKunde: null, zahlungsbedingungUnternehmer: null,
    auftragspreise: [], tourkosten: [], fakturaZeilen: [], fakturaKopf: [],
  }
  const request = () => ({ auth: { uid }, data: { taNummer: ta, requestId: randomUUID() } })
  const deps = { db, fetchOrder: async () => structuredClone(payload), report: async () => {} }
  const created = await fetchDycosTransportOrderHandler(request(), deps)
  const ref = db.doc(`transportOrders/${created.orderId}`)
  await ref.update({ manual: { reference: 'retain-manual-data' }, routeNeedsRecalculation: false })
  Object.assign(payload.auftrag, { Ware: 'Auftragsware', Gefahrgut: false, Gesamtkilometer: 0, Autobahnkilometer: 0, Leerkilometer: 0, KMGeroutet: false })
  Object.assign(payload.tour, { Gesamtkilometer: 500, Autobahnkilometer: 300, Leerkilometer: 20, Geroutet: true })
  payload.fahrzeugart.Informationen = 'Seitlich beladbar'
  payload.ladeEntladestellen[0].Ware = 'Warenbeschreibung der Station'
  payload.LadeEntladestellen2 = [{ LadeEntladestellenID: 31, Volumengewicht_gesamt_kg: 1250 }]
  assert.equal((await fetchDycosTransportOrderHandler(request(), deps)).status, 'updated')
  const saved = (await ref.get()).data()
  assert.equal(saved.imported.shipment.goodsDescription, 'Auftragsware')
  assert.equal(saved.imported.shipment.hazardousGoods, false)
  assert.equal(saved.imported.shipment.vehicleInformation, 'Seitlich beladbar')
  assert.equal(saved.imported.stops[0].cargo.description, 'Warenbeschreibung der Station')
  assert.equal(saved.imported.stops[0].cargo.volumetricWeightKg, 1250)
  assert.equal(saved.imported.stops[0].cargo.weightKg, null)
  assert.equal(saved.imported.shipment.weightKg, null)
  assert.deepEqual(saved.imported.distances.order, { totalKm: 0, motorwayKm: 0, emptyKm: 0, routed: false })
  assert.deepEqual(saved.imported.distances.tour, { totalKm: 500, motorwayKm: 300, emptyKm: 20, routed: true })
  assert.equal(saved.routeNeedsRecalculation, false)
  assert.equal(saved.manual.reference, 'retain-manual-data')
  const history = await ref.collection('history').get()
  assert.ok(history.docs.some(entry => entry.get('field') === 'shipment.hazardousGoods' && entry.get('oldValue') === null && entry.get('newValue') === false))
  assert.ok(history.docs.some(entry => entry.get('field') === 'distances.order.totalKm' && entry.get('oldValue') === null && entry.get('newValue') === 0))
  assert.ok(history.docs.some(entry => entry.get('field') === 'stops' && entry.get('newValue')[0].cargo.volumetricWeightKg === 1250))
  assert.equal((await fetchDycosTransportOrderHandler(request(), deps)).status, 'unchanged')
  assert.equal((await ref.collection('history').get()).size, history.size)
  const confirmed = (await ref.get()).data()
  payload.auftrag.Gefahrgut = 'false'
  await assert.rejects(fetchDycosTransportOrderHandler(request(), deps), { code: 'unavailable' })
  assert.deepEqual((await ref.get()).data(), confirmed)
})

test('emulator: station fixed appointment persists true, false and missing values without duplicate refresh effects', { skip: !enabled }, async () => {
  const db = getFirestore(), uid = `fixed-${randomUUID()}`, ta = `2610${String(Date.now()).slice(-5)}`
  await db.doc(`users/${uid}`).set({ active: true, role: 'user', permissions: { dataImports: 'edit' } })
  const payload = {
    auftrag: { ID: 71, Nummer: Number(ta), Ladedatum: '2026-10-01' },
    ladeEntladestellen: [
      { ID: 31, AuftragsID: 71, Lade_Entladestelle: 'L', Zeile_In_Auftrag: 1 },
      { ID: 32, AuftragsID: 71, Lade_Entladestelle: 'E', Zeile_In_Auftrag: 2 },
    ],
    LadeEntladestellen2: [{ LadeEntladestellenID: 32, Fixtermin: false }, { LadeEntladestellenID: 31, Fixtermin: true }],
    kunde: null, tour: null, unternehmerstamm: null, fahrzeugart: null, relation: null,
    zahlungsbedingungKunde: null, zahlungsbedingungUnternehmer: null,
    auftragspreise: [], tourkosten: [], fakturaZeilen: [], fakturaKopf: [],
  }
  const request = () => ({ auth: { uid }, data: { taNummer: ta, requestId: randomUUID() } })
  const deps = { db, fetchOrder: async () => structuredClone(payload), report: async () => {} }
  const created = await fetchDycosTransportOrderHandler(request(), deps)
  const ref = db.doc(`transportOrders/${created.orderId}`)
  let saved = (await ref.get()).get('imported')
  assert.deepEqual(saved.stops.map(stop => stop.fixedAppointment), [true, false])
  assert.equal(saved.loading.fixedAppointment, true)
  assert.equal(saved.unloading.fixedAppointment, false)
  payload.LadeEntladestellen2[1].Fixtermin = false
  assert.equal((await fetchDycosTransportOrderHandler(request(), deps)).status, 'updated')
  saved = (await ref.get()).get('imported')
  assert.equal(saved.loading.fixedAppointment, false)
  const history = await ref.collection('history').get()
  assert.ok(history.docs.some(entry => entry.get('field') === 'stops' && entry.get('oldValue')[0].fixedAppointment === true && entry.get('newValue')[0].fixedAppointment === false))
  const replay = request()
  assert.equal((await fetchDycosTransportOrderHandler(replay, deps)).status, 'unchanged')
  assert.equal((await fetchDycosTransportOrderHandler(replay, deps)).status, 'unchanged')
  assert.equal((await ref.collection('history').get()).size, history.size)
  payload.LadeEntladestellen2 = []
  assert.equal((await fetchDycosTransportOrderHandler(request(), deps)).status, 'updated')
  saved = (await ref.get()).get('imported')
  assert.deepEqual(saved.stops.map(stop => stop.fixedAppointment), [null, null])
  assert.equal(saved.loading.fixedAppointment, null)
  payload.LadeEntladestellen2 = [{ LadeEntladestellenID: 31, Fixtermin: 2 }]
  await assert.rejects(fetchDycosTransportOrderHandler(request(), deps), { code: 'unavailable' })
  assert.deepEqual((await ref.get()).get('imported'), saved)
})

test('emulator: confirmed contact, station and document fields persist, refresh audibly and retain manual data', { skip: !enabled }, async () => {
  const db = getFirestore(), uid = `fields-${randomUUID()}`, ta = `2606${String(Date.now()).slice(-5)}`
  await db.doc(`users/${uid}`).set({ active: true, firstName: 'Test', lastName: 'Import', permissions: { dataImports: 'edit' } })
  const payload = {
    auftrag: { ID: 71, Nummer: Number(ta), Ladedatum: '2026-06-01', ImAuftrag: 'Kundenkontakt: customer@example.test', Referenznummer: 'Ortsangabe bleibt gültig', DispoBemerkung: 'Erste Zeile\nZweite Zeile' },
    ladeEntladestellen: [{ ID: 31, AuftragsID: 71, Lade_Entladestelle: 'L', Zeile_In_Auftrag: 1, Bemerkung: 'Seitlich beladen', Zustellinformation: 'Ladereferenz: ALT', Ankunft: '2026-06-01T08:00:00Z' }],
    LadeEntladestellen2: [], kunde: null, tour: null, unternehmerstamm: null, fahrzeugart: null, relation: null, zahlungsbedingungKunde: null, zahlungsbedingungUnternehmer: null,
    auftragspreise: [], tourkosten: [], fakturaZeilen: [{ AuftragID: 71, KopfID: 91 }],
    fakturaKopf: [{ KopfID: 91, BelegNr: '20001', ExterneBelegnummer: 'EXT-ALT', BelegDatum: '23.06.26', bUnternehmer: true, bProformabeleg: true, Storniert: false, TextStorno: 'PROFORMA-Gutschrift', PDFDateinameMitPfadFakturaBelegOriginal: 'Z:\\PRIVATE-SERVER\\ProformaGutschriftUTN_20001_91.pdf', IBAN: 'NOT-AN-ORDER-FIELD' }],
  }
  const request = () => ({ auth: { uid }, data: { taNummer: ta, requestId: randomUUID() } })
  const dependencies = { db, fetchOrder: async () => structuredClone(payload), report: async () => {} }
  const first = await fetchDycosTransportOrderHandler(request(), dependencies)
  assert.equal(first.status, 'new')
  const ref = db.doc(`transportOrders/${first.orderId}`)
  const created = (await ref.get()).data()
  assert.equal(created.imported.contacts.customerForOrder, payload.auftrag.ImAuftrag)
  assert.equal(created.imported.loading.reference, 'Ladereferenz: ALT')
  assert.equal(created.imported.dispositionNote, payload.auftrag.DispoBemerkung)
  assert.equal(created.imported.financial.documents[0].businessType, 'carrier_invoice')
  assert.equal(created.imported.financial.documents[0].externalNumber, 'EXT-ALT')
  assert.doesNotMatch(JSON.stringify(created.imported), /PRIVATE-SERVER|NOT-AN-ORDER-FIELD/)
  assert.equal((await ref.collection('history').get()).size, 1)
  await ref.update({ manual: { note: 'Manuell gepflegt' } })
  payload.auftrag.DispoBemerkung = 'Geänderte Dispositionsbemerkung'
  payload.ladeEntladestellen[0].Zustellinformation = 'Ladereferenz: NEU'
  payload.fakturaKopf[0].ExterneBelegnummer = 'EXT-NEU'
  assert.equal((await fetchDycosTransportOrderHandler(request(), dependencies)).status, 'updated')
  const updated = (await ref.get()).data()
  assert.equal(updated.manual.note, 'Manuell gepflegt')
  const history = await ref.collection('history').get()
  const entries = history.docs.map(entry => ({ id: entry.id, ...entry.data() }))
  const rows = transportOrderHistoryRows(updated, entries)
  const changes = rows.flatMap(row => row.changes || [])
  assert.ok(changes.some(change => change.path === 'dispositionNote' && change.oldValue === 'Erste Zeile Zweite Zeile'))
  assert.ok(changes.some(change => change.path === 'loading.reference' && change.newValue === 'Ladereferenz: NEU'))
  assert.ok(changes.some(change => change.path.endsWith('.externalNumber') && change.oldValue === 'EXT-ALT' && change.newValue === 'EXT-NEU'))
  assert.ok(entries.filter(entry => entry.field).every(entry => entry.recordedBy === uid && entry.recordedByName === 'Test Import'))
  assert.equal((await fetchDycosTransportOrderHandler(request(), dependencies)).status, 'unchanged')
  assert.equal((await ref.collection('history').get()).size, history.size)
})

test('emulator: customer cancellation persists the original link and audited status without collapsing identical invoice numbers', { skip: !enabled }, async () => {
  const db = getFirestore(), uid = `cancellation-${randomUUID()}`, ta = `2610${String(Date.now()).slice(-5)}`
  await db.doc(`users/${uid}`).set({ active: true, permissions: { dataImports: 'edit' } })
  const original = { KopfID: 101, BelegNr: '66966', BelegNrID: 66966, Belegart: 2, TextRechnung: 'RECHNUNG', BelegDatum: '26.10.26', bUnternehmer: false, bProformabeleg: false, Storniert: false, PDFDateinameMitPfadFakturaBelegOriginal: 'Rechnung_66966_101.pdf' }
  const payload = { auftrag: { ID: 71, Nummer: Number(ta), Ladedatum: '2026-10-01' }, ladeEntladestellen: [], LadeEntladestellen2: [], kunde: null, tour: null, unternehmerstamm: null, fahrzeugart: null, relation: null, zahlungsbedingungKunde: null, zahlungsbedingungUnternehmer: null, auftragspreise: [], tourkosten: [], fakturaZeilen: [{ AuftragID: 71, KopfID: 101 }], fakturaKopf: [original] }
  const request = () => ({ auth: { uid }, data: { taNummer: ta, requestId: randomUUID() } })
  const dependencies = { db, fetchOrder: async () => structuredClone(payload), report: async () => {} }
  const created = await fetchDycosTransportOrderHandler(request(), dependencies)
  const ref = db.doc(`transportOrders/${created.orderId}`)
  Object.assign(original, { Storniert: true, StornoRechungNr: 66966, StornoRechnungDatum: '27.10.2026' })
  payload.fakturaZeilen.push({ AuftragID: 71, KopfID: 102 })
  payload.fakturaKopf.push({ KopfID: 102, BelegNr: '66966', BelegNrID: 66966, Belegart: 5, TextRechnung: 'STORNO-RECHNUNG', TextStorno: '66966', BelegDatum: '27.10.26', bUnternehmer: false, bProformabeleg: false, Storniert: false, PDFDateinameMitPfadFakturaBelegOriginal: 'Stornorechnung_66966_102.pdf' })
  const updated = await fetchDycosTransportOrderHandler(request(), dependencies)
  assert.equal(updated.status, 'updated')
  assert.deepEqual(updated.warningCodes, [])
  const order = (await ref.get()).data(), docs = order.imported.financial.documents
  assert.equal(docs.length, 2)
  assert.equal(docs[0].cancelled, true)
  assert.equal(docs[0].cancellationDate, '2026-10-27')
  assert.equal(docs[1].cancelled, false)
  assert.equal(docs[1].businessType, 'customer_invoice_cancellation')
  assert.equal(docs[1].originalDocumentSourceId, docs[0].sourceId)
  assert.equal(docs[1].originalDocumentNumber, docs[0].internalNumber)
  const history = await ref.collection('history').get()
  const changes = transportOrderHistoryRows(order, history.docs.map(entry => ({ id: entry.id, ...entry.data() }))).flatMap(row => row.changes || [])
  assert.ok(changes.some(change => change.path.endsWith('.cancelled') && change.oldValue === false && change.newValue === true))
  assert.ok(changes.some(change => change.path.endsWith('.originalDocumentNumber') && change.newValue === '66966'))
  assert.equal((await fetchDycosTransportOrderHandler(request(), dependencies)).status, 'unchanged')
  assert.equal((await ref.collection('history').get()).size, history.size)
})
