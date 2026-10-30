import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { searchDycosTransportOrdersHandler } from './dycosOrderSearch.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) { assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):/); initializeApp({ projectId: 'demo-drehpunkt-dycos-search' }) }
const empty = () => ({ schemaVersion: 1, pageSize: 15, hasMore: false, nextNachId: null, auftraege: [], kunden: [], touren: [], unternehmer: [], stationen: [], relationen: [] })
const data = { ladeDatumVon: '2026-01-01', ladeDatumBis: '2026-01-02' }
const request = (uid, input = data) => ({ auth: { uid }, data: input })
async function user(permissions = { dataImports: 'edit' }, active = true) { const uid = randomUUID(); await getFirestore().doc(`users/${uid}`).set({ active, role: 'user', permissions, firstName: 'Test' }); return uid }
const deps = (fetchSearch, report = async () => {}) => ({ db: getFirestore(), fetchSearch, report })

test('emulator: search rejects missing, inactive and view-only identities before source access', { skip: !enabled }, async () => {
  let calls = 0; const dependencies = deps(async () => { calls++; return empty() })
  await assert.rejects(searchDycosTransportOrdersHandler({ data }, dependencies), { code: 'unauthenticated' })
  for (const uid of [await user({ dataImports: 'view' }), await user(undefined, false), randomUUID()]) await assert.rejects(searchDycosTransportOrdersHandler(request(uid), dependencies), { code: 'permission-denied' })
  const uid = await user()
  await assert.rejects(searchDycosTransportOrdersHandler(request(uid, { ...data, ladeDatumVon: '2025-12-31' }), dependencies), { code: 'invalid-argument' })
  assert.equal(calls, 0)
})

test('emulator: preview marks existing orders and never creates partner/order data', { skip: !enabled }, async () => {
  const uid = await user(); const ta = 261100001
  const payload = { ...empty(), auftraege: [{ ID: 1, Nummer: ta, Ladedatum: '2026-01-01', RelationsID: null, TourenID: null, FrachtzahlerID: null }] }
  await getFirestore().doc(`transportOrders/dycos-${ta}`).set({ manual: { preserved: true } })
  const result = await searchDycosTransportOrdersHandler(request(uid), deps(async () => payload))
  assert.equal(result.orders[0].existing, true); assert.equal(result.orders[0].customer, '')
  assert.deepEqual((await getFirestore().doc(`transportOrders/dycos-${ta}`).get()).data(), { manual: { preserved: true } })
  assert.equal((await getFirestore().collection('businessPartners').get()).size, 0)
})

test('emulator: parallel searches are bounded and revoked rights prevent preview disclosure', { skip: !enabled }, async () => {
  const uid = await user(); let entered, finish
  const enteredPromise = new Promise(resolve => { entered = resolve }), pending = new Promise(resolve => { finish = resolve })
  const first = searchDycosTransportOrdersHandler(request(uid), deps(async () => { entered(); await pending; return empty() }))
  await enteredPromise
  await assert.rejects(searchDycosTransportOrdersHandler(request(uid), deps(async () => assert.fail('source must not be called'))), { code: 'aborted' })
  await getFirestore().doc(`users/${uid}`).update({ 'permissions.dataImports': 'none' }); finish()
  await assert.rejects(first, { code: 'permission-denied' })
})

test('emulator: source/mapping failures are diagnosed without raw content; quota survives lock cleanup', { skip: !enabled }, async () => {
  const uid = await user(); const reports = []
  await assert.rejects(searchDycosTransportOrdersHandler(request(uid), deps(async () => { throw new Error('private URL/token') }, async event => reports.push(event))), { code: 'unavailable' })
  assert.equal(reports[0].stage, 'search'); assert.equal(JSON.stringify(reports).includes('private URL'), false)
  await searchDycosTransportOrdersHandler(request(uid, { modus: 'relationen' }), deps(async () => ({ schemaVersion: 1, relationen: [{ ID: 8, Bezeichnung: '06 Test' }] })))
  await getFirestore().doc(`dycosSearchQuotas/${uid}`).update({ count: 20, windowStart: Date.now() })
  await assert.rejects(searchDycosTransportOrdersHandler(request(uid), deps(async () => assert.fail('quota must precede source access'))), { code: 'resource-exhausted' })
})
