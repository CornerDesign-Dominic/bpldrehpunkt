import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchDycosTransportOrderHandler, hasDycosImportAccess, validateDycosRequest } from './dycosTransportOrders.js'
import { DycosFlowError } from './dycosFlowClient.js'
import { mapDycosOrder } from './dycosOrderMapping.js'
import { transportOrderHistoryRows } from '../src/lib/transportOrderHistoryPresentation.js'
import { shipmentTrackingLifecycle } from './shared/shipmentTrackingLifecycle.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'
import { isAutomaticImportedRouteCandidate } from './transportOrderRoutes.js'
import { resolveDycosPartnerConflictsHandler } from './dycosPartnerReview.js'
import { dycosConflictRows } from './shared/dycosPartnerConflicts.js'
import { createShipmentTrackingDocument, updateManualShipmentTrackingHandler } from './shipmentTracking.js'
import { transportOrderListProjection } from './transportOrderListProjection.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
// Fixed business identities below must start with an empty test database even
// when the same emulator is reused for several release checks.
if (enabled) initializeApp({ projectId: `demo-drehpunkt-dycos-${randomUUID().slice(0, 8)}` })
const nextTa = () => String(100000000 + Math.floor(Math.random() * 900000000))
const nextAccount = () => String(100000000000000 + Math.floor(Math.random() * 900000000000000))
const req = (uid, ta, requestId = randomUUID()) => ({ auth: { uid }, data: { taNummer: ta, requestId } })
const db = () => getFirestore()
const id = (ta) => `dycos-${ta}`
const payload = (ta, extras = {}) => ({
  ladeEntladestellen: [], kunde: null,
  tour: null, unternehmerstamm: null, fahrzeugart: null, auftragspreise: [],
  tourkosten: [], relation: null, zahlungsbedingungKunde: null,
  zahlungsbedingungUnternehmer: null, fakturaZeilen: [], fakturaKopf: [],
  LadeEntladestellen2: [], ...extras, auftrag: { ID: 123, Nummer: Number(ta), Ladedatum: '2026-01-01', ...extras.auftrag },
})
async function user(permissions = { dataImports: 'edit' }, active = true) {
  const uid = randomUUID()
  await db().doc(`users/${uid}`).set({ active, role: 'user', permissions, firstName: 'Schnittstellen', lastName: 'Test' })
  return uid
}
const dependencies = (fetchOrder, report = async () => {}) => ({ db: db(), fetchOrder, report })

test('emulator: refreshing the TA atomically follows only auto recipients, retains historical deliveries and does not duplicate recipient events on replay', { skip: !enabled }, async () => {
  const uid = await user(), ta = nextTa()
  let sentTo = 'old@example.test', calls = 0
  const source = dependencies(async () => { calls += 1; return payload(ta, { auftrag: { TourenID: 44 }, tour: { ID: 44, TAPerMailVersendetAn: sentTo } }) })
  await fetchDycosTransportOrderHandler(req(uid, ta), source)
  const ref = db().doc(`transportOrderTrackings/${id(ta)}`)
  const historicalDispatch = { dispatchId: 'sent-before-refresh', recipient: sentTo }
  await ref.set({ ...createShipmentTrackingDocument(id(ta), uid, 'Test', { carrierRecipientEmail: sentTo }), externalRuleDispatches: { 'old-rule': historicalDispatch } })
  await ref.collection('automaticMailDeliveries').doc('historical').set({ status: 'sent', recipient: sentTo })
  sentTo = 'new@example.test'
  const request = req(uid, ta)
  await fetchDycosTransportOrderHandler(request, source)
  let saved = (await ref.get()).data()
  assert.deepEqual(saved.recipients.carrier, { email: sentTo, source: 'transport-order-import' })
  assert.equal(saved.updatedBy, uid)
  assert.deepEqual(saved.externalRuleDispatches['old-rule'], historicalDispatch)
  assert.equal((await ref.collection('automaticMailDeliveries').doc('historical').get()).get('recipient'), 'old@example.test')
  let events = await ref.collection('events').get()
  assert.equal(events.size, 1)
  assert.equal(events.docs[0].get('eventType'), 'tracking_recipients_updated')
  assert.equal(events.docs[0].get('oldValue.recipients.carrier.email'), 'old@example.test')
  assert.equal(events.docs[0].get('newValue.recipients.carrier.email'), sentTo)
  assert.equal(events.docs[0].get('recordedBy'), uid)
  assert.equal(events.docs[0].get('source'), 'import')
  const beforeReplay = calls
  await fetchDycosTransportOrderHandler(request, source)
  assert.equal(calls, beforeReplay)
  await fetchDycosTransportOrderHandler(req(uid, ta), source)
  assert.equal((await ref.collection('events').get()).size, 1)
  sentTo = 'invalid new source'
  await fetchDycosTransportOrderHandler(req(uid, ta), source)
  saved = (await ref.get()).data()
  assert.deepEqual(saved.recipients.carrier, { email: '', source: 'transport-order-import' })
  assert.equal((await db().doc(`transportOrders/${id(ta)}`).get()).get('imported.dispatch.sentTo'), sentTo)
  sentTo = 'later@example.test'
  await fetchDycosTransportOrderHandler(req(uid, ta), source)
  assert.equal((await ref.get()).get('recipients.carrier.email'), sentTo)
  events = await ref.collection('events').get()
  assert.equal(events.size, 3)
})

test('emulator: manual confirmation of the same imported address and manual clearing remain protected from TA refreshes', { skip: !enabled }, async () => {
  const uid = await user({ dataImports: 'edit', transportOrders: 'edit' }), ta = nextTa()
  let sentTo = 'same@example.test'
  const source = dependencies(async () => payload(ta, { auftrag: { TourenID: 44 }, tour: { ID: 44, TAPerMailVersendetAn: sentTo } }))
  await fetchDycosTransportOrderHandler(req(uid, ta), source)
  const ref = db().doc(`transportOrderTrackings/${id(ta)}`)
  await ref.set(createShipmentTrackingDocument(id(ta), uid, 'Test', { carrierRecipientEmail: sentTo }))
  await updateManualShipmentTrackingHandler({ auth: { uid }, data: { orderId: id(ta), action: 'update_recipients', recipientChanges: { carrier: sentTo } } })
  assert.equal((await ref.get()).get('recipients.carrier.source'), 'manual')
  sentTo = 'changed@example.test'
  await fetchDycosTransportOrderHandler(req(uid, ta), source)
  assert.equal((await ref.get()).get('recipients.carrier.email'), 'same@example.test')
  await updateManualShipmentTrackingHandler({ auth: { uid }, data: { orderId: id(ta), action: 'update_recipients', recipientChanges: { carrier: null } } })
  await fetchDycosTransportOrderHandler(req(uid, ta), source)
  assert.deepEqual((await ref.get()).get('recipients.carrier'), { email: '', source: 'manual' })
  const events = await ref.collection('events').get()
  assert.equal(events.size, 2)
  assert.equal(events.docs.every(entry => entry.get('source') === 'manual'), true)
})

test('emulator: no legacy source is guessed, completed tracking is immutable and import permission revocation prevents recipient writes', { skip: !enabled }, async () => {
  const uid = await user(), ta = nextTa()
  const source = dependencies(async () => payload(ta, { auftrag: { TourenID: 44 }, tour: { ID: 44, TAPerMailVersendetAn: 'new@example.test' } }))
  await fetchDycosTransportOrderHandler(req(uid, ta), source)
  const ref = db().doc(`transportOrderTrackings/${id(ta)}`)
  for (const value of [
    { lifecycleStatus: 'active', recipients: { carrier: { email: 'legacy@example.test' } } },
    { lifecycleStatus: 'completed', recipients: { carrier: { email: 'completed@example.test', source: 'transport-order-import' } } },
  ]) {
    await ref.set(value)
    await fetchDycosTransportOrderHandler(req(uid, ta), source)
    assert.deepEqual((await ref.get()).data(), value)
  }
  await ref.set({ lifecycleStatus: 'active', recipients: { carrier: { email: 'old@example.test', source: 'transport-order-import' } } })
  const oldTracking = (await ref.get()).data()
  const oldOrder = (await db().doc(`transportOrders/${id(ta)}`).get()).data()
  const revoked = dependencies(async () => {
    await db().doc(`users/${uid}`).update({ 'permissions.dataImports': 'view' })
    return payload(ta, { auftrag: { TourenID: 44 }, tour: { ID: 44, TAPerMailVersendetAn: 'revoked@example.test' } })
  })
  await assert.rejects(fetchDycosTransportOrderHandler(req(uid, ta), revoked), { code: 'permission-denied' })
  assert.deepEqual((await ref.get()).data(), oldTracking)
  assert.deepEqual((await db().doc(`transportOrders/${id(ta)}`).get()).data(), oldOrder)
  assert.equal((await ref.collection('events').get()).size, 0)
})

test('emulator: keep decisions also survive partner enrichment through Auftrag aktualisieren', { skip: !enabled }, async () => {
  const uid = await user({ dataImports: 'edit', masterData: 'edit' }), ta = nextTa()
  const account = 10000000 + Math.floor(Math.random() * 90000000)
  let sourceName = 'Quelle A'
  const source = dependencies(async () => payload(ta, { auftrag: { FrachtzahlerID: account }, kunde: { ID: account, Debitorennummer: account, Firma: sourceName } }))
  await fetchDycosTransportOrderHandler(req(uid, ta), source)
  const order = await db().doc(`transportOrders/${id(ta)}`).get()
  const partnerId = order.get('imported.customer.partnerId'), ref = db().doc(`businessPartners/${partnerId}`)
  await ref.update({ companyName: 'Manuell' })
  await fetchDycosTransportOrderHandler(req(uid, ta), source)
  await resolveDycosPartnerConflictsHandler({ auth: { uid }, data: { partnerId, decision: 'keep', expectedRows: dycosConflictRows((await ref.get()).data()) } })
  const repeat = await fetchDycosTransportOrderHandler(req(uid, ta), source)
  assert.equal(repeat.partnerUpdates.conflicts, 0)
  assert.equal(dycosConflictRows((await ref.get()).data()).length, 0)
  sourceName = 'Quelle B'
  assert.equal((await fetchDycosTransportOrderHandler(req(uid, ta), source)).partnerUpdates.conflicts, 1)
})

test('request canonicalization prevents duplicate SQL identities and requires a bounded request ID', () => {
  for (const taNummer of ['00123', '-1', '1e4', '123.0', '2147483648', '', 123]) assert.throws(() => validateDycosRequest({ taNummer, requestId: randomUUID() }), { code: 'invalid-argument' })
  assert.equal(validateDycosRequest({ taNummer: '0', requestId: randomUUID() }).taNummer, '0')
  assert.equal(hasDycosImportAccess({ role: 'admin', permissions: { dataImports: 'view' } }), false)
  assert.equal(hasDycosImportAccess({ role: 'superadmin' }), true)
})

test('emulator: old orders, missing-date legacy numbers and changed preview identities create nothing', { skip: !enabled }, async () => {
  const uid = await user()
  for (const [ta, date, expectedSourceId] of [['270100991', '2025-12-31', 123], ['251200992', null, 123], ['260100993', '2026-01-01', 999]]) {
    const raw = payload(ta); raw.auftrag.Ladedatum = date
    await assert.rejects(fetchDycosTransportOrderHandler({ ...req(uid, ta), data: { taNummer: ta, requestId: randomUUID(), expectedSourceId } }, dependencies(async () => raw)), { code: 'failed-precondition' })
    assert.equal((await db().doc(`transportOrders/${id(ta)}`).get()).exists, false)
  }
  const ta = '270100994', raw = payload(ta); delete raw.auftrag.Ladedatum
  const firstRequest = { ...req(uid, ta), data: { taNummer: ta, requestId: randomUUID(), expectedSourceId: 123 } }
  const result = await fetchDycosTransportOrderHandler(firstRequest, dependencies(async () => raw))
  assert.equal(result.status, 'new'); assert.equal(result.sourceId, '123')
  assert.deepEqual(await fetchDycosTransportOrderHandler(firstRequest, dependencies(async () => assert.fail('receipt replay must not refetch'))), result)
})

test('emulator: import permission revoked during source read prevents the transaction from saving', { skip: !enabled }, async () => {
  const uid = await user(), ta = nextTa()
  await assert.rejects(fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => { await db().doc(`users/${uid}`).update({ 'permissions.dataImports': 'view' }); return payload(ta) })), { code: 'permission-denied' })
  assert.equal((await db().doc(`transportOrders/${id(ta)}`).get()).exists, false)
})

test('mapped orders enter the existing routing/tracking model only with its required source data', () => {
  const ta = '260900123'
  const raw = payload(ta, {
    ladeEntladestellen: [
      { ID: 1, AuftragsID: 123, Lade_Entladestelle: 'L', Zeile_In_Auftrag: 1, Land: 'DE', Ort: 'Hamburg', Ankunft: '2026-11-03T08:00:00Z' },
      { ID: 2, AuftragsID: 123, Lade_Entladestelle: 'E', Zeile_In_Auftrag: 2, Land: 'DE', Ort: 'Berlin', Ankunft: '2026-11-04T08:00:00Z' },
    ],
    LadeEntladestellen2: [{ LadeEntladestellenID: 1, Slotzeit: '1899-12-30T16:00:00Z' }, { LadeEntladestellenID: 2, Slotzeit: '1899-12-30T11:00:00Z' }],
  })
  const imported = mapDycosOrder(raw, ta)
  const evaluate = (data) => shipmentTrackingLifecycle({ earliestLoading: data.loading.window.from, latestUnloading: data.unloading.window.until, operatingHours: DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, now: '2026-11-02T09:00:00' })
  assert.equal(evaluate(imported).phase, 'in_progress')
  const order = { source: 'dycos', importMeta: { source: 'dycos', channel: 'power-automate', importRunId: 'test' }, imported }
  assert.equal(isAutomaticImportedRouteCandidate(order), true)
  const sparse = mapDycosOrder(payload(ta), ta)
  assert.equal(evaluate(sparse).startAt, null)
  assert.equal(isAutomaticImportedRouteCandidate({ ...order, imported: sparse }), false)
})

test('emulator: authorization precedes all source access, including inactive and missing profiles', { skip: !enabled }, async () => {
  let calls = 0
  const deps = dependencies(async () => { calls++; return {} })
  await assert.rejects(fetchDycosTransportOrderHandler({ data: {} }, deps), { code: 'unauthenticated' })
  for (const uid of [await user({ dataImports: 'view' }), await user({ dataImports: 'edit' }, false), randomUUID()]) await assert.rejects(fetchDycosTransportOrderHandler(req(uid, nextTa()), deps), { code: 'permission-denied' })
  assert.equal(calls, 0)
})

test('emulator: sparse TA imports atomically, replay avoids another source call, unchanged re-fetch preserves manual and case data', { skip: !enabled }, async () => {
  const uid = await user(); const ta = nextTa(); const request = req(uid, ta); let calls = 0
  const deps = dependencies(async () => { calls++; return payload(ta) })
  const first = await fetchDycosTransportOrderHandler(request, deps)
  assert.equal(first.status, 'new')
  const ref = db().doc(`transportOrders/${id(ta)}`)
  const original = (await ref.get()).data()
  assert.deepEqual(original.listQuery, transportOrderListProjection(original), 'the current DyCoS writer must commit query projection atomically')
  assert.equal(original.imported.financial.revenueNet, 0)
  assert.equal(original.imported.carrier.partnerId, '')
  assert.deepEqual(original.imported.stops, [])
  const creationHistory = await ref.collection('history').get()
  assert.equal(creationHistory.size, 1)
  assert.equal(creationHistory.docs[0].get('eventType'), 'transport_order_created')
  assert.equal(creationHistory.docs[0].get('recordedBy'), uid)
  assert.equal(creationHistory.docs[0].get('oldValue'), undefined)
  await ref.update({ manual: { note: 'Disposition bleibt' }, tracking: { status: 'Unterwegs' }, relatedCaseIds: ['case-example'] })
  assert.deepEqual(await fetchDycosTransportOrderHandler(request, deps), first)
  assert.equal(calls, 1)
  const repeat = await fetchDycosTransportOrderHandler(req(uid, ta), deps)
  assert.equal(repeat.status, 'unchanged')
  assert.equal(calls, 2)
  const updated = (await ref.get()).data()
  assert.deepEqual(updated.manual, { note: 'Disposition bleibt' })
  assert.deepEqual(updated.relatedCaseIds, ['case-example'])
  assert.equal(updated.tracking.status, 'Unterwegs')
  await assert.rejects(fetchDycosTransportOrderHandler(req(uid, nextTa(), request.data.requestId), deps), { code: 'invalid-argument' })
  assert.equal(calls, 2)
})

test('emulator: Auftrag aktualisieren records actual changes with actor; unchanged refresh adds no history', { skip: !enabled }, async () => {
  const uid = await user(); const ta = nextTa()
  const raw = payload(ta, { auftrag: { ID: 123, Nummer: Number(ta), Gewicht: 1000 } })
  const deps = dependencies(async () => raw)
  await fetchDycosTransportOrderHandler(req(uid, ta), deps)
  raw.auftrag.Gewicht = 1200
  assert.equal((await fetchDycosTransportOrderHandler(req(uid, ta), deps)).status, 'updated')
  const ref = db().doc(`transportOrders/${id(ta)}`)
  const history = await ref.collection('history').get()
  const rows = transportOrderHistoryRows((await ref.get()).data(), history.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
  assert.equal(rows.length, 2)
  const changed = rows.find((entry) => !entry.creation)
  assert.equal(changed.recordedBy, uid)
  assert.equal(changed.recordedByName, 'Schnittstellen Test')
  assert.deepEqual(changed.changes.map((entry) => [entry.path, entry.oldValue, entry.newValue]), [['shipment.weightKg', 1000, 1200]])
  assert.equal((await fetchDycosTransportOrderHandler(req(uid, ta), deps)).status, 'unchanged')
  assert.equal((await ref.collection('history').get()).size, history.size)
})

test('emulator: source nonexistence and technical/mapping failures create no empty orders; diagnostics contain no source content', { skip: !enabled }, async () => {
  const uid = await user(); const events = []
  for (const kind of ['missing', 'technical', 'mapping']) {
    const ta = nextTa()
    const fetchOrder = async () => {
      if (kind === 'missing') throw new DycosFlowError('ta_not_found', 'fetch')
      if (kind === 'technical') throw new Error('private URL and token must not leak')
      return payload(nextTa())
    }
    await assert.rejects(fetchDycosTransportOrderHandler(req(uid, ta), dependencies(fetchOrder, async (event) => events.push(event))), { code: kind === 'missing' ? 'not-found' : 'unavailable' })
    assert.equal((await db().doc(`transportOrders/${id(ta)}`).get()).exists, false)
    assert.equal((await db().doc(`dycosImportLocks/${id(ta)}`).get()).exists, false)
  }
  assert.equal(events.length, 2)
  assert.equal(events[0].actorId, uid)
  assert.equal(events[1].stage, 'mapping')
  assert.equal(JSON.stringify(events).includes('private URL'), false)
})

test('emulator: parallel calls for one TA are fenced; a change during fetch cannot be overwritten', { skip: !enabled }, async () => {
  const uid = await user(); const ta = nextTa()
  let enter; let finish
  const entered = new Promise((resolve) => { enter = resolve })
  const pending = new Promise((resolve) => { finish = resolve })
  const first = fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => { enter(); await pending; return payload(ta) }))
  await entered
  await assert.rejects(fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => assert.fail('parallel SQL call'))), { code: 'aborted' })
  finish(); await first
  const ref = db().doc(`transportOrders/${id(ta)}`)
  await assert.rejects(fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => { await ref.update({ 'manual.note': 'Zwischenzeitliche Änderung' }); return payload(ta) })), { code: 'aborted' })
  assert.equal((await ref.get()).get('manual.note'), 'Zwischenzeitliche Änderung')
})

test('emulator: exact creditor identity overrides similar names; unresolved legacy CSV fields survive migration', { skip: !enabled }, async () => {
  const uid = await user(); const ta = nextTa(); const creditor = nextAccount()
  const partnerRef = db().collection('businessPartners').doc()
  await partnerRef.set({ id: partnerRef.id, companyName: 'Eigener Partnername', creditorNumber: creditor, status: 'active' })
  const orderRef = db().doc(`transportOrders/${id(ta)}`)
  await orderRef.set({ externalNumber: ta, imported: { carrier: { originalName: 'Alt' }, loading: { reference: 'Alte Referenz' }, contacts: { carrierStandardEmail: 'dispo@example.test' } }, manual: { note: 'Notiz' }, importMeta: { fileName: 'original.csv' } })
  const response = payload(ta, { auftrag: { ID: 123, Nummer: Number(ta), TourenID: 44 }, tour: { ID: 44, UnternehmerID: 55 }, unternehmerstamm: { ID: 55, Bezeichnung: 'Neuer Quellname', Kreditorennummer: creditor }, ladeEntladestellen: [{ ID: 1, AuftragsID: 123, Zeile_In_Auftrag: 1, Lade_Entladestelle: 'L', Zustellinformation: 'Neue Quellenreferenz' }] })
  const result = await fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => response))
  assert.equal(result.status, 'updated')
  const order = (await orderRef.get()).data()
  assert.equal(order.imported.carrier.partnerId, partnerRef.id)
  assert.equal(order.imported.carrier.originalName, 'Neuer Quellname')
  assert.equal(order.imported.loading.reference, 'Neue Quellenreferenz')
  assert.equal(order.imported.contacts.carrierStandardEmail, 'dispo@example.test')
  assert.equal(order.importMeta.fileName, undefined)
  assert.deepEqual(order.importMeta.preservedLegacyFields.sort(), ['contacts.carrierStandardEmail'])
  assert.equal((await orderRef.get()).get('imported.source.orderId'), '123')
})

test('emulator: CSV totals survive enrichment and line items/stations persist idempotently without cargo-only route resets', { skip: !enabled }, async () => {
  const uid = await user(); const ta = nextTa(); const ref = db().doc(`transportOrders/${id(ta)}`)
  await ref.set({ externalNumber: ta, imported: { shipment: { weightKg: 1000, packages: 10, loadingMeters: 5 } }, manual: { note: 'Bleibt' } })
  const raw = payload(ta, {
    auftrag: { ID: 123, Nummer: Number(ta), BearbeiterErfassung: 'AW' },
    auftragspreise: [{ AuftragID: 123, AuftragPos: 1, LeistungText: 'Fracht', Gesamt: 100 }],
    ladeEntladestellen: [{ ID: 1, AuftragsID: 123, Zeile_In_Auftrag: 1, Lade_Entladestelle: 'L', Gewicht: '500,00', Kolli: 5, Lademeter: '2,5', Palettentausch: true }],
  })
  const deps = dependencies(async () => raw)
  assert.equal((await fetchDycosTransportOrderHandler(req(uid, ta), deps)).status, 'updated')
  const first = (await ref.get()).data()
  assert.equal(first.imported.shipment.weightKg, 1000)
  assert.equal(first.imported.shipment.packages, 10)
  assert.equal(first.imported.stops[0].cargo.weightKg, 500)
  assert.equal(first.imported.stops[0].palletExchange, true)
  assert.equal(first.imported.financial.revenuePositions[0].amountNet, 100)
  assert.equal(first.imported.source.createdBy, 'AW')
  assert.equal(first.manual.note, 'Bleibt')
  const historyCount = (await ref.collection('history').get()).size
  assert.equal((await fetchDycosTransportOrderHandler(req(uid, ta), deps)).status, 'unchanged')
  assert.equal((await ref.collection('history').get()).size, historyCount)
  await ref.update({ routeNeedsRecalculation: false })
  raw.ladeEntladestellen[0].Gewicht = 600
  raw.ladeEntladestellen[0].Palettentausch = false
  assert.equal((await fetchDycosTransportOrderHandler(req(uid, ta), deps)).status, 'updated')
  const next = (await ref.get()).data()
  assert.equal(next.imported.stops[0].cargo.weightKg, 600)
  assert.equal(next.imported.shipment.weightKg, 1000)
  assert.equal(next.routeNeedsRecalculation, false)
  assert.ok((await ref.collection('history').get()).size > historyCount)
})

test('emulator: ambiguous account identity rolls back order, run and planned partner creation', { skip: !enabled }, async () => {
  const uid = await user(); const ta = nextTa(); const creditor = nextAccount(); const debtor = nextAccount()
  for (let i = 0; i < 2; i++) await db().collection('businessPartners').add({ companyName: `Duplikat ${i}`, creditorNumber: creditor })
  const response = payload(ta, { auftrag: { ID: 123, Nummer: Number(ta), FrachtzahlerID: 33, TourenID: 44 }, kunde: { ID: 33, Firma: 'Neuer Kunde', Debitorennummer: debtor }, tour: { ID: 44, UnternehmerID: 55 }, unternehmerstamm: { ID: 55, Bezeichnung: 'Unternehmer', Kreditorennummer: creditor } })
  await assert.rejects(fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => response)), { code: 'failed-precondition' })
  assert.equal((await db().doc(`transportOrders/${id(ta)}`).get()).exists, false)
  assert.equal((await db().doc(`businessPartners/dycos-debtor-${encodeURIComponent(debtor)}`).get()).exists, false)
  assert.equal((await db().collection('transportOrderImportRuns').where('externalNumber', '==', ta).get()).empty, true)
})

test('emulator: diagnostic failure cannot mask the original safe source error', { skip: !enabled }, async () => {
  const uid = await user(); const ta = nextTa()
  await assert.rejects(fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => { throw new DycosFlowError('source_auth', 'authenticate') }, async () => { throw new Error('diagnostic storage failed') })), (error) => error.code === 'unavailable' && !error.message.includes('diagnostic storage failed'))
})

test('emulator: a deterministic partner ID cannot override contradictory account identity', { skip: !enabled }, async () => {
  const uid = await user(); const ta = nextTa(); const creditor = nextAccount()
  await db().doc(`businessPartners/dycos-creditor-${creditor}`).set({ companyName: 'Geänderte Identität', creditorNumber: nextAccount(), status: 'active' })
  const response = payload(ta, { auftrag: { ID: 123, Nummer: Number(ta), TourenID: 44 }, tour: { ID: 44, UnternehmerID: 55 }, unternehmerstamm: { ID: 55, Bezeichnung: 'Quelle', Kreditorennummer: creditor } })
  await assert.rejects(fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => response)), { code: 'failed-precondition' })
  assert.equal((await db().doc(`transportOrders/${id(ta)}`).get()).exists, false)
})

test('emulator: rich partner data fills empty fields, preserves manual values and is auditable without leaking into TA snapshots', { skip: !enabled }, async () => {
  const uid = await user({ dataImports: 'edit', masterData: 'edit' }); const ta = nextTa(); const creditor = nextAccount()
  const ref = db().doc(`businessPartners/dycos-creditor-${creditor}`)
  await ref.set({ id: ref.id, creditorNumber: creditor, companyName: 'Manueller Name', status: 'active', contact: { phone: 'manuell', website: '' }, creditLimit: 9000, contacts: [] })
  const response = payload(ta, {
    auftrag: { ID: 123, Nummer: Number(ta), TourenID: 44 }, tour: { ID: 44, UnternehmerID: 55 },
    unternehmerstamm: { ID: 55, Bezeichnung: 'SQL Name', Kreditorennummer: creditor, Internet: 'www.example.test', USTID: 'DE123', Steuernummer: '123', TimoComNummer: '12345', Ansprechpartner: 'Disposition', TelefonAnsp: '030 123', EMailAnsp: 'person@example.test', Kreditlimit: 100, Transporeon_Kennwort: 'NEVER_COPY', IBAN: 'DE89370400440532013000', SWIFT: 'COBADEFFXXX' },
    zahlungsbedingungUnternehmer: null,
  })
  const deps = dependencies(async () => response)
  const first = await fetchDycosTransportOrderHandler(req(uid, ta), deps)
  assert.equal(first.partnerUpdates.enriched, 1)
  assert.ok(first.warningCodes.includes('PARTNER_MASTER_DATA_CONFLICTS'))
  const partner = (await ref.get()).data()
  assert.equal(partner.companyName, 'Manueller Name')
  assert.equal(partner.contact.phone, 'manuell')
  assert.equal(partner.contact.website, 'https://www.example.test')
  assert.equal(partner.creditLimit, 9000)
  assert.equal(partner.companyData.vatId, 'DE123')
  assert.equal(partner.bankData.bic, 'COBADEFFXXX')
  assert.equal(partner.contacts[0].email, 'person@example.test')
  assert.equal(partner.dycosImport.conflicts[0].path, 'companyName')
  assert.doesNotMatch(JSON.stringify(partner), /NEVER_COPY/)
  const order = (await db().doc(`transportOrders/${id(ta)}`).get()).data()
  assert.doesNotMatch(JSON.stringify(order.imported), /NEVER_COPY|DE89370400440532013000/)
  const savedHistory = await ref.collection('history').get()
  const historyBefore = savedHistory.size
  const changes = savedHistory.docs.flatMap((entry) => entry.get('metadata.changes') || [])
  const websiteChange = changes.find((entry) => entry.path === 'contact.website')
  assert.deepEqual([websiteChange.oldValue, websiteChange.newValue], [null, 'https://www.example.test'])
  assert.equal(changes.some((entry) => entry.path === 'companyName'), false)
  assert.equal(savedHistory.docs[0].get('createdByUserId'), uid)
  const repeat = await fetchDycosTransportOrderHandler(req(uid, ta), deps)
  assert.equal(repeat.partnerUpdates.enriched, 0)
  assert.equal((await ref.collection('history').get()).size, historyBefore)
  assert.equal((await ref.get()).get('contacts').length, partner.contacts.length)
})

test('emulator: brand new partner gets complete mapped data in the same transaction; missing master-data permission does not enrich', { skip: !enabled }, async () => {
  const debtor = nextAccount(); const ta = nextTa()
  const response = payload(ta, { auftrag: { ID: 123, Nummer: Number(ta), FrachtzahlerID: 33 }, kunde: { ID: 33, Firma: 'Kunde', Debitorennummer: debtor, TelefonZentrale: '040 123', EMailZentrale: 'office@example.test', USTID: 'DE999', Erfassungsdatum: '2020-01-01T00:00:00Z', KundeSchicktGutschrift: true } })
  const uid = await user({ dataImports: 'edit', masterData: 'edit' })
  await fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => response))
  const partner = (await db().doc(`businessPartners/dycos-debtor-${debtor}`).get()).data()
  assert.equal(partner.contact.phone, '040 123')
  assert.equal(partner.contact.email, 'office@example.test')
  assert.equal(partner.contact.fax, '')
  assert.equal(partner.companyData.vatId, 'DE999')
  assert.equal(partner.companyData.taxNumber, '')
  assert.equal(partner.dycosCreatedAt, '2020-01-01')
  assert.equal(partner.creditNoteProcedure, true)
  const creationHistory = await db().doc(`businessPartners/dycos-debtor-${debtor}`).collection('history').get()
  assert.equal(creationHistory.size, 1)
  assert.equal(creationHistory.docs[0].get('action'), 'created')
  assert.equal(creationHistory.docs[0].get('createdByUserId'), uid)
  assert.equal(creationHistory.docs[0].get('metadata.changes'), undefined)
  const limited = await user({ dataImports: 'edit', masterData: 'view' }); const otherTa = nextTa(); const otherDebtor = nextAccount()
  const other = { ...response, auftrag: { ...response.auftrag, Nummer: Number(otherTa) }, kunde: { ...response.kunde, Debitorennummer: otherDebtor } }
  const result = await fetchDycosTransportOrderHandler(req(limited, otherTa), dependencies(async () => other))
  const minimal = (await db().doc(`businessPartners/dycos-debtor-${otherDebtor}`).get()).data()
  assert.equal(minimal.companyData.vatId, '')
  assert.equal(minimal.contact.phone, '')
  assert.equal(minimal.dycosImport, undefined)
  assert.ok(result.warningCodes.includes('PARTNER_MASTER_DATA_PERMISSION_REQUIRED'))
})

test('emulator: conflicting customer/carrier data on a shared partner is not resolved by write order', { skip: !enabled }, async () => {
  const uid = await user({ dataImports: 'edit', masterData: 'edit' }); const ta = nextTa(); const debtor = nextAccount(); const creditor = nextAccount()
  const ref = db().collection('businessPartners').doc()
  await ref.set({ id: ref.id, companyName: 'Gemeinsamer Partner', debtorNumber: debtor, creditorNumber: creditor, contacts: [] })
  const response = payload(ta, {
    auftrag: { ID: 123, Nummer: Number(ta), FrachtzahlerID: 33, TourenID: 44 }, kunde: { ID: 33, Firma: 'Gemeinsamer Partner', Debitorennummer: debtor, Zahlungsbedingung: 1, USTID: 'DE123' },
    tour: { ID: 44, UnternehmerID: 55 }, unternehmerstamm: { ID: 55, Bezeichnung: 'Gemeinsamer Partner', Kreditorennummer: creditor, Zahlungsbedingung: 2, USTID: 'DE123' },
    zahlungsbedingungKunde: { ID: 1, Bezeichnung: '14 Tage netto' }, zahlungsbedingungUnternehmer: { ID: 2, Bezeichnung: '30 Tage netto' },
  })
  const result = await fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => response))
  const partner = (await ref.get()).data()
  assert.equal(partner.paymentTermDays, undefined)
  assert.equal(partner.companyData.vatId, 'DE123')
  assert.equal(result.partnerUpdates.enriched, 1)
  assert.equal(result.partnerUpdates.conflicts, 1)
  assert.equal(partner.dycosImport.conflicts[0].path, 'paymentTermDays')
})

test('emulator: optional partner data without an account identity does not create an unlinked placeholder or block the TA', { skip: !enabled }, async () => {
  const uid = await user({ dataImports: 'edit', masterData: 'edit' }); const ta = nextTa(); const name = `Ohne Kontonummer ${randomUUID()}`
  const response = payload(ta, { auftrag: { ID: 123, Nummer: Number(ta), FrachtzahlerID: 33 }, kunde: { ID: 33, Firma: name, USTID: 'DE777' } })
  const result = await fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => response))
  assert.equal(result.status, 'new')
  assert.ok(result.warningCodes.includes('PARTNER_MASTER_DATA_IDENTITY_MISSING'))
  assert.equal((await db().doc(`transportOrders/${id(ta)}`).get()).get('imported.customer.partnerId'), '')
  assert.equal((await db().collection('businessPartners').where('companyName', '==', name).get()).empty, true)
})
