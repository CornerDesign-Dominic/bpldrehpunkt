import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchDycosTransportOrderHandler } from './dycosTransportOrders.js'
import { findLiabilityTransportOrdersHandler, fetchLiabilityTransportOrderHandler, suggestLiabilityWordingHandler } from './liabilityWorkflow.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) initializeApp({ projectId: 'demo-drehpunkt-liability' })
const dependencies = () => ({ db: getFirestore(), report: async () => {} })
const payload = ta => ({
  auftrag: { ID: 123, Nummer: Number(ta), FrachtzahlerID: 33, TourenID: 44, Ladedatum: '2026-11-04T08:00' }, kunde: { ID: 33, Firma: 'Testkunde', Debitorennummer: '11223344' },
  tour: { ID: 44, UnternehmerID: 55 }, unternehmerstamm: { ID: 55, Bezeichnung: 'Testunternehmer', Kreditorennummer: '99887766', Strasse: 'Teststraße 3', PLZ: '12345', Ort: 'Teststadt', Land: 'DE' },
  fahrzeugart: null, auftragspreise: [], tourkosten: [], relation: null, zahlungsbedingungKunde: null, zahlungsbedingungUnternehmer: null,
  fakturaZeilen: [], fakturaKopf: [], LadeEntladestellen2: [],
  ladeEntladestellen: [{ ID: 101, AuftragsID: 123, Zeile_In_Auftrag: 1, Lade_Entladestelle: 'L', Firma: 'Lager A', Strasse: 'Weg 1', PLZ: '10001', Ort: 'Ladeort', Land: 'DE', Ankunft: '2026-11-04T08:00' }, { ID: 102, AuftragsID: 123, Zeile_In_Auftrag: 2, Lade_Entladestelle: 'L', Firma: 'Lager B', Strasse: 'Weg 2', PLZ: '10002', Ort: 'Ladeort', Land: 'DE', Ankunft: '2026-11-04T10:00' }, { ID: 103, AuftragsID: 123, Zeile_In_Auftrag: 3, Lade_Entladestelle: 'E', Firma: 'Ziel', Strasse: 'Weg 3', PLZ: '10003', Ort: 'Zielort', Land: 'DE', Ankunft: '2026-11-05T08:00' }],
})

test('emulator: template-only users import and persist TA/partners, replay safely and search reduced data; general import remains denied', { skip: !enabled }, async () => {
  const db = getFirestore()
  const uid = randomUUID()
  await db.doc(`users/${uid}`).set({ active: true, role: 'user', permissions: { templates: 'view', dataImports: 'none', transportOrders: 'none' } })
  const taNummer = String(100000000 + Math.floor(Math.random() * 900000000))
  const request = { auth: { uid }, data: { taNummer, requestId: randomUUID() } }
  let fetches = 0
  const deps = { ...dependencies(), fetchOrder: async () => { fetches++; return payload(taNummer) } }
  await assert.rejects(fetchDycosTransportOrderHandler(request, deps), { code: 'permission-denied' })
  // Template endpoint discards client attempts to select another import mode/session.
  request.data = { ...request.data, mode: 'refresh', importRunId: randomUUID(), selectionIndex: 0, expectedSourceId: 999, workflow: 'import' }
  const result = await fetchLiabilityTransportOrderHandler(request, deps)
  assert.equal(result.importStatus, 'new')
  assert.equal(result.order.stops.length, 3)
  assert.equal(result.order.carrier.company, 'Testunternehmer')
  assert.equal(result.order.carrier.street, 'Teststraße 3')
  const saved = await db.doc(`transportOrders/${result.order.id}`).get()
  assert.equal(saved.exists, true)
  assert.ok(saved.get('imported.customer.partnerId'))
  assert.ok(saved.get('imported.carrier.partnerId'))
  const replay = await fetchLiabilityTransportOrderHandler(request, deps)
  assert.equal(replay.order.id, result.order.id)
  assert.equal(fetches, 1)
  const found = await findLiabilityTransportOrdersHandler({ auth: { uid }, data: { taNummer } }, dependencies())
  assert.equal(found.orders.length, 1)
  assert.deepEqual(found.orders[0], result.order)
  assert.equal('financial' in found.orders[0], false)
  assert.equal('partnerId' in found.orders[0].carrier, false)
})

test('emulator: missing and disabled profiles and users without template access are denied on all three paths', { skip: !enabled }, async () => {
  const db = getFirestore()
  for (const profile of [null, { active: false, role: 'superadmin' }, { active: true, role: 'admin', permissions: { dataImports: 'edit', transportOrders: 'edit' } }]) {
    const uid = randomUUID()
    if (profile) await db.doc(`users/${uid}`).set(profile)
    const request = { auth: { uid }, data: { taNummer: '123', requestId: randomUUID(), incidentSummary: 'Test' } }
    const deps = { ...dependencies(), fetchOrder: async () => assert.fail('Must not call source'), environment: 'development', quota: async () => assert.fail('Must not claim quota') }
    await assert.rejects(findLiabilityTransportOrdersHandler(request, deps), { code: 'permission-denied' })
    await assert.rejects(fetchLiabilityTransportOrderHandler(request, deps), { code: 'permission-denied' })
    await assert.rejects(suggestLiabilityWordingHandler(request, deps), { code: 'permission-denied' })
  }
})

test('emulator: wording quota blocks the eleventh paid request per minute for template users', { skip: !enabled }, async () => {
  const db = getFirestore()
  const uid = randomUUID()
  await db.doc(`users/${uid}`).set({ active: true, role: 'user', permissions: { templates: 'edit' } })
  let operations = 0
  const deps = { ...dependencies(), environment: 'development', getInstructions: async () => '', runAi: async ({ operation }) => operation(), callAi: async () => { operations++; return { data: { incidentText: 'Es kam zu einer Beschädigung der Ware.' } } } }
  const request = { auth: { uid }, data: { incidentSummary: 'Ware beschädigt' } }
  for (let index = 0; index < 10; index++) await suggestLiabilityWordingHandler(request, deps)
  await assert.rejects(suggestLiabilityWordingHandler(request, deps), { code: 'resource-exhausted' })
  assert.equal(operations, 10)
})


test('emulator: template permission revoked during source fetch aborts the whole save', { skip: !enabled }, async () => {
  const db = getFirestore()
  const uid = randomUUID()
  await db.doc(`users/${uid}`).set({ active: true, role: 'user', permissions: { templates: 'view' } })
  const taNummer = String(100000000 + Math.floor(Math.random() * 900000000))
  const request = { auth: { uid }, data: { taNummer, requestId: randomUUID() } }
  const deps = { ...dependencies(), fetchOrder: async () => {
    await db.doc(`users/${uid}`).update({ permissions: { templates: 'none' } })
    return payload(taNummer)
  } }
  await assert.rejects(fetchLiabilityTransportOrderHandler(request, deps), { code: 'permission-denied' })
  assert.equal((await db.doc(`transportOrders/dycos-${taNummer}`).get()).exists, false)
})
