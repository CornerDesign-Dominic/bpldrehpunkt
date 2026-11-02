import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { fetchDycosMasterDataHandler } from './dycosMasterData.js'
import { listDycosMasterDataImportsHandler, masterDataHistoryRef } from './dycosMasterDataHistory.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) initializeApp({ projectId: 'demo-drehpunkt-dycos' })
const request = (uid, data = {}) => ({ auth: { uid }, data })
async function user(permissions = { masterData: 'edit' }) {
  const uid = randomUUID()
  await getFirestore().doc(`users/${uid}`).set({ active: true, role: 'user', firstName: 'Import', lastName: 'Test', permissions })
  return uid
}
const dependencies = (data, patch = {}) => ({ db: getFirestore(), report: async () => {}, fetchPartner: async () => ({ schemaVersion: 1, typ: data.typ, nummer: data.nummer,
  partner: { ID: Number(data.nummer), [data.typ === 'kunde' ? 'Debitorennummer' : 'Kreditorennummer']: Number(data.nummer), [data.typ === 'kunde' ? 'Firma' : 'Bezeichnung']: 'History Test', ...patch }, zahlungsbedingung: null }) })

test('emulator: history captures new, updated and unchanged imports and retries do not duplicate entries', { skip: !enabled }, async () => {
  const uid = await user(), nummer = String(30000000 + Math.floor(Math.random() * 10000000))
  const data = { typ: 'utn', nummer, requestId: randomUUID() }
  const first = await fetchDycosMasterDataHandler(request(uid, data), dependencies(data))
  await fetchDycosMasterDataHandler(request(uid, data), { db: getFirestore(), fetchPartner: () => assert.fail('idempotent retry must not fetch') })
  const updated = { ...data, requestId: randomUUID() }
  await fetchDycosMasterDataHandler(request(uid, updated), dependencies(updated, { Strasse: 'Ergänzte Straße' }))
  const unchanged = { ...updated, requestId: randomUUID() }
  await fetchDycosMasterDataHandler(request(uid, unchanged), dependencies(unchanged, { Strasse: 'Ergänzte Straße' }))
  const page = await listDycosMasterDataImportsHandler(request(uid))
  assert.equal(page.entries.length, 3)
  assert.deepEqual(new Set(page.entries.map(entry => entry.resultStatus)), new Set(['new', 'updated', 'unchanged']))
  assert.ok(page.entries.every(entry => entry.createdAt > 0 && entry.createdByName === 'Import Test' && entry.typ === 'utn' && entry.nummer === nummer && entry.partnerId === first.partnerId))
  assert.equal(page.hasMore, false)
  assert.equal(JSON.stringify(page).includes('attemptToken'), false)
})

test('emulator: failed imports are safe and a retry updates the same history entry', { skip: !enabled }, async () => {
  const uid = await user(), data = { typ: 'kunde', nummer: String(50000000 + Math.floor(Math.random() * 10000000)), requestId: randomUUID() }
  await assert.rejects(fetchDycosMasterDataHandler(request(uid, data), { ...dependencies(data), fetchPartner: async () => { throw { code: 'partner_not_found' } } }), { code: 'not-found' })
  let page = await listDycosMasterDataImportsHandler(request(uid))
  assert.equal(page.entries.length, 1); assert.equal(page.entries[0].status, 'failed'); assert.equal(page.entries[0].partnerId, '')
  assert.match(page.entries[0].message, /kein Partner gefunden/)
  assert.equal((await getFirestore().doc(`businessPartners/dycos-debtor-${data.nummer}`).get()).exists, false)
  const createdAt = page.entries[0].createdAt
  await assert.rejects(fetchDycosMasterDataHandler(request(uid, data), { ...dependencies(data), fetchPartner: async () => { throw new Error('secret-source-error') } }), { code: 'unavailable' })
  page = await listDycosMasterDataImportsHandler(request(uid))
  assert.equal(JSON.stringify(page).includes('secret-source-error'), false)
  await fetchDycosMasterDataHandler(request(uid, data), dependencies(data))
  page = await listDycosMasterDataImportsHandler(request(uid))
  assert.equal(page.entries.length, 1); assert.equal(page.entries[0].status, 'completed'); assert.equal(page.entries[0].createdAt, createdAt)
})

test('emulator: history pages are stable at 25 entries, isolated by user and expose no internal fields', { skip: !enabled }, async () => {
  const uid = await user(), other = await user(), db = getFirestore(), batch = db.batch(), ids = []
  for (let index = 0; index < 52; index++) {
    const id = randomUUID(); ids.push(id)
    batch.set(masterDataHistoryRef(db, uid, id), { createdAt: Timestamp.fromMillis(1000), lastStartedAt: Timestamp.now(), createdByName: 'Import Test', typ: 'kunde', nummer: String(index), status: 'completed', resultStatus: 'unchanged', secret: 'never-return' })
  }
  const foreign = randomUUID()
  batch.set(masterDataHistoryRef(db, other, foreign), { createdAt: Timestamp.now(), typ: 'utn', nummer: '99', status: 'completed' })
  await batch.commit()
  const first = await listDycosMasterDataImportsHandler(request(uid, { uid: other, limit: 9999 }))
  const second = await listDycosMasterDataImportsHandler(request(uid, { cursor: first.cursor }))
  const third = await listDycosMasterDataImportsHandler(request(uid, { cursor: second.cursor }))
  assert.deepEqual([first.entries.length, second.entries.length, third.entries.length], [25, 25, 2])
  assert.deepEqual([first.hasMore, second.hasMore, third.hasMore], [true, true, false])
  assert.deepEqual([...first.entries, ...second.entries, ...third.entries].map(entry => entry.id), ids.sort().reverse())
  assert.equal(JSON.stringify(first).includes('never-return'), false)
  await assert.rejects(listDycosMasterDataImportsHandler(request(uid, { cursor: foreign })), { code: 'permission-denied' })
  for (const cursor of [{ id: first.cursor }, '../escape', 42, '']) await assert.rejects(listDycosMasterDataImportsHandler(request(uid, { cursor })), { code: 'invalid-argument' })
})

test('emulator: import history needs active stammdaten edit access and expired attempts are marked interrupted', { skip: !enabled }, async () => {
  const uid = await user(), db = getFirestore(), id = randomUUID()
  await masterDataHistoryRef(db, uid, id).set({ createdAt: Timestamp.fromMillis(1000), lastStartedAt: Timestamp.fromMillis(1000), status: 'running', typ: 'kunde', nummer: '123' })
  assert.equal((await listDycosMasterDataImportsHandler(request(uid))).entries[0].status, 'interrupted')
  for (const permissions of [{ masterData: 'view', dataImports: 'edit' }, { dataImports: 'edit' }]) {
    await db.doc(`users/${uid}`).update({ permissions })
    await assert.rejects(listDycosMasterDataImportsHandler(request(uid)), { code: 'permission-denied' })
  }
  await db.doc(`users/${uid}`).update({ active: false, permissions: { masterData: 'edit' } })
  await assert.rejects(listDycosMasterDataImportsHandler(request(uid)), { code: 'permission-denied' })
  await assert.rejects(listDycosMasterDataImportsHandler({ data: {} }), { code: 'unauthenticated' })
})
