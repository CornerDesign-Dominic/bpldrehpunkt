import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchDycosTransportOrderHandler, hasDycosImportAccess, validateDycosRequest } from './dycosTransportOrders.js'
import { DycosFlowError } from './dycosFlowClient.js'
import { importTransportOrdersHandler } from './transportOrderImports.js'
import { mapDycosOrder } from './dycosOrderMapping.js'
import { shipmentTrackingLifecycle } from './shared/shipmentTrackingLifecycle.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'
import { isAutomaticImportedRouteCandidate } from './transportOrderRoutes.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) initializeApp({ projectId: 'demo-drehpunkt-dycos' })
const nextTa = () => String(100000000 + Math.floor(Math.random() * 900000000))
const nextAccount = () => String(100000000000000 + Math.floor(Math.random() * 900000000000000))
const req = (uid, ta, requestId = randomUUID()) => ({ auth: { uid }, data: { taNummer: ta, requestId } })
const db = () => getFirestore()
const id = (ta) => `dycos-${ta}`
const payload = (ta, extras = {}) => ({
  auftrag: { ID: 123, Nummer: Number(ta) }, ladeEntladestellen: [], kunde: null,
  tour: null, unternehmerstamm: null, fahrzeugart: null, auftragspreise: [],
  tourkosten: [], relation: null, zahlungsbedingungKunde: null,
  zahlungsbedingungUnternehmer: null, fakturaZeilen: [], fakturaKopf: [],
  LadeEntladestellen2: [], ...extras,
})
async function user(permissions = { dataImports: 'edit' }, active = true) {
  const uid = randomUUID()
  await db().doc(`users/${uid}`).set({ active, role: 'user', permissions, firstName: 'Schnittstellen', lastName: 'Test' })
  return uid
}
const dependencies = (fetchOrder, report = async () => {}) => ({ db: db(), fetchOrder, report })

test('request canonicalization prevents duplicate SQL identities and requires a bounded request ID', () => {
  for (const taNummer of ['00123', '-1', '1e4', '123.0', '2147483648', '', 123]) assert.throws(() => validateDycosRequest({ taNummer, requestId: randomUUID() }), { code: 'invalid-argument' })
  assert.equal(validateDycosRequest({ taNummer: '0', requestId: randomUUID() }).taNummer, '0')
  assert.equal(hasDycosImportAccess({ role: 'admin', permissions: { dataImports: 'view' } }), false)
  assert.equal(hasDycosImportAccess({ role: 'superadmin' }), true)
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
  assert.equal(original.imported.financial.revenueNet, 0)
  assert.equal(original.imported.carrier.partnerId, '')
  assert.deepEqual(original.imported.stops, [])
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
  const response = payload(ta, { auftrag: { ID: 123, Nummer: Number(ta), TourenID: 44 }, tour: { ID: 44, UnternehmerID: 55 }, unternehmerstamm: { ID: 55, Bezeichnung: 'Neuer Quellname', Kreditorennummer: creditor } })
  const result = await fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => response))
  assert.equal(result.status, 'updated')
  const order = (await orderRef.get()).data()
  assert.equal(order.imported.carrier.partnerId, partnerRef.id)
  assert.equal(order.imported.carrier.originalName, 'Neuer Quellname')
  assert.equal(order.imported.loading.reference, 'Alte Referenz')
  assert.equal(order.imported.contacts.carrierStandardEmail, 'dispo@example.test')
  assert.equal(order.importMeta.fileName, undefined)
  assert.deepEqual(order.importMeta.preservedLegacyFields.sort(), ['contacts.carrierStandardEmail', 'loading.reference'])
  const row = { rowNumber: 2, externalNumber: ta, imported: { externalNumber: ta, customer: { debtorNumber: '100', name: 'Kunde' }, carrier: { originalName: 'Neuer Quellname' } } }
  await assert.rejects(importTransportOrdersHandler({ auth: { uid }, data: { fileName: 'alt.csv', rows: [row] } }), { code: 'failed-precondition' })
  assert.equal((await orderRef.get()).get('imported.source.orderId'), '123')
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

test('emulator: a late CSV commit cannot overwrite a concurrently completed API import', { skip: !enabled }, async () => {
  const uid = await user(); const ta = nextTa(); const creditor = nextAccount(); const debtor = nextAccount()
  const orderRef = db().doc(`transportOrders/${id(ta)}`)
  await orderRef.set({ externalNumber: ta, imported: { customer: { debtorNumber: debtor, name: 'Kunde' }, carrier: { originalName: creditor } }, importMeta: { source: 'dycos', fileName: 'old.csv' } })
  const response = payload(ta)
  const database = db(); const originalBatch = database.batch
  const csvRow = { rowNumber: 2, externalNumber: ta, imported: { externalNumber: ta, customer: { debtorNumber: debtor, name: 'Kunde' }, carrier: { originalName: creditor } } }
  let intercepted = false
  database.batch = function () {
    const batch = originalBatch.call(this)
    const commit = batch.commit.bind(batch)
    batch.commit = async () => {
      if (!intercepted) {
        intercepted = true
        await fetchDycosTransportOrderHandler(req(uid, ta), dependencies(async () => response))
      }
      return commit()
    }
    return batch
  }
  try {
    await assert.rejects(importTransportOrdersHandler({ auth: { uid }, data: { fileName: 'late.csv', rows: [csvRow] } }), (error) => error.code === 9 || error.code === 'failed-precondition')
  } finally { database.batch = originalBatch }
  assert.equal(intercepted, true)
  const result = (await orderRef.get()).data()
  assert.equal(result.importMeta.channel, 'power-automate')
  assert.equal(result.imported.source.orderId, '123')
  assert.equal(result.imported.customer.name, '')
  assert.equal((await database.doc(`businessPartners/dycos-debtor-${debtor}`).get()).exists, false)
})
