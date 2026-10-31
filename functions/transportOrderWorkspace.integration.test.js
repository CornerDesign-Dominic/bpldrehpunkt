import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { initializeApp as adminApp } from 'firebase-admin/app'
import { getFirestore as adminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, terminate, setLogLevel } from 'firebase/firestore'
import { refreshTransportOrderWorkspaceHandler, listTransportOrderRecordsPageHandler } from './transportOrderWorkspace.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const projectId = 'demo-order-workspace'
if (enabled) { assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(localhost|127\.0\.0\.1):/); adminApp({ projectId }) }
const db = () => adminFirestore()
async function setup(permissions = { transportOrders: 'view', dataImports: 'edit', masterData: 'edit' }) {
  const uid = randomUUID(), orderId = `dycos-${Math.floor(261000000 + Math.random() * 900000)}`, partnerId = randomUUID()
  await db().doc(`users/${uid}`).set({ active: true, role: 'user', permissions, firstName: 'Workspace', lastName: 'Test' })
  await db().doc(`businessPartners/${partnerId}`).set({ companyName: 'Synthetic' })
  await db().doc(`transportOrders/${orderId}`).set({ externalNumber: orderId.slice(6), imported: { customer: { partnerId } }, importMeta: { lastImportedAt: new Date() } })
  const request = (scope = 'all', requestId = randomUUID()) => ({ auth: { uid }, data: { orderId, scope, requestId } })
  return { uid, orderId, partnerId, request }
}

test('emulator: concurrent identical requests reserve once, persist partial outcomes and replay without another source call', { skip: !enabled }, async () => {
  const s = await setup(), req = s.request(); let release, entered
  const started = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { release = resolve })
  let orderCalls = 0, partnerCalls = 0
  const deps = { fetchOrder: async () => { orderCalls++; entered(); await gate; return { status: 'updated' } }, refreshPartner: async () => { partnerCalls++; throw Object.assign(new Error('protected source body'), { code: 'unavailable' }) } }
  const first = refreshTransportOrderWorkspaceHandler(req, deps)
  await started
  await assert.rejects(refreshTransportOrderWorkspaceHandler(req, deps), { code: 'aborted' })
  release()
  const result = await first
  assert.equal(result.status, 'partial'); assert.equal(orderCalls, 1); assert.equal(partnerCalls, 1)
  const history = await db().doc(`transportOrders/${s.orderId}/refreshes/${result.recordId}`).get()
  assert.equal(history.get('actorName'), 'Workspace Test')
  assert.equal(history.get('result.order.status'), 'updated')
  assert.equal(JSON.stringify(history.data()).includes('protected source body'), false)
  assert.deepEqual(await refreshTransportOrderWorkspaceHandler(req, deps), result)
  assert.equal(orderCalls, 1); assert.equal(partnerCalls, 1)
  assert.equal((await db().collection(`transportOrders/${s.orderId}/refreshes`).get()).size, 1)
})

test('emulator: scope rights are enforced before a source call or refresh receipt is created', { skip: !enabled }, async () => {
  const s = await setup({ transportOrders: 'view', dataImports: 'edit' }); let calls = 0
  await assert.rejects(refreshTransportOrderWorkspaceHandler(s.request(), { fetchOrder: async () => { calls++; return {} } }), { code: 'permission-denied' })
  assert.equal(calls, 0)
  assert.equal((await db().collection(`transportOrders/${s.orderId}/refreshes`).get()).size, 0)
  await db().doc(`users/${s.uid}`).update({ active: false })
  await assert.rejects(listTransportOrderRecordsPageHandler({ auth: { uid: s.uid }, data: {} }), { code: 'permission-denied' })
})

test('emulator: records list contains orders without station dates and returns a bounded cursor page', { skip: !enabled }, async () => {
  const s = await setup()
  const response = await listTransportOrderRecordsPageHandler({ auth: { uid: s.uid }, data: { search: s.orderId.slice(6), pageSize: 25 } })
  assert.equal(response.orders.length, 1); assert.equal(response.orders[0].id, s.orderId)
  assert.equal(response.hasMore, false)
})

test('emulator rules: refresh outcomes are visible only to order readers and immutable for every browser role', { skip: !enabled }, async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
  const response = await fetch(`http://${address}/emulator/v1/projects/${projectId}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) })
  assert.equal(response.status, 200, await response.text())
  const s = await setup()
  const record = `transportOrders/${s.orderId}/refreshes/proof`
  await db().doc(record).set({ status: 'success', scope: 'all' })
  const profiles = { reader: { active: true, role: 'user', permissions: { transportOrders: 'view' } }, denied: { active: true, role: 'admin', permissions: {} }, superadmin: { active: true, role: 'superadmin' }, inactive: { active: false, role: 'superadmin' } }
  setLogLevel('silent')
  for (const [uid, profile] of Object.entries(profiles)) {
    await db().doc(`users/${uid}`).set(profile)
    const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `workspace-${uid}`)
    const client = getFirestore(app), [host, port] = address.split(':')
    connectFirestoreEmulator(client, host, Number(port), { mockUserToken: { sub: uid } })
    try {
      if (uid === 'reader' || uid === 'superadmin') assert.equal((await getDoc(doc(client, record))).exists(), true)
      else await assert.rejects(getDoc(doc(client, record)), { code: 'permission-denied' })
      await assert.rejects(setDoc(doc(client, record), { status: 'forged' }), { code: 'permission-denied' })
      await assert.rejects(getDoc(doc(client, 'transportOrderWorkspaceRequests/private')), { code: 'permission-denied' })
      await assert.rejects(getDoc(doc(client, 'transportOrderWorkspaceLocks/private')), { code: 'permission-denied' })
    } finally { await terminate(client); await deleteApp(app) }
  }
})
