import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchDycosMasterDataHandler, mapDycosMasterData, validateDycosPartnerRequest } from './dycosMasterData.js'
import { DycosFlowError } from './dycosFlowClient.js'
import { resolveDycosPartnerConflictsHandler } from './dycosPartnerReview.js'
import { dycosConflictRows } from './shared/dycosPartnerConflicts.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) initializeApp({ projectId: 'demo-drehpunkt-dycos' })
const number = () => String(10000000 + Math.floor(Math.random() * 90000000))
const request = (uid, nummer, typ = 'kunde', requestId = randomUUID()) => ({ auth: { uid }, data: { typ, nummer, requestId } })
const response = (req, row = {}) => ({ schemaVersion: 1, typ: req.data.typ, nummer: req.data.nummer, partner: { ID: Number(req.data.nummer), [req.data.typ === 'kunde' ? 'Debitorennummer' : 'Kreditorennummer']: Number(req.data.nummer), [req.data.typ === 'kunde' ? 'Firma' : 'Bezeichnung']: 'Beispielpartner', ...row }, zahlungsbedingung: null })
async function user(permissions = { masterData: 'edit' }, active = true) {
  const uid = randomUUID()
  await getFirestore().doc(`users/${uid}`).set({ active, role: 'user', permissions, firstName: 'Stammdaten', lastName: 'Test' })
  return uid
}
const deps = fetchPartner => ({ db: getFirestore(), fetchPartner, report: async () => {} })
const partner = async result => (await getFirestore().doc(`businessPartners/${result.partnerId}`).get()).data()
const history = result => getFirestore().collection(`businessPartners/${result.partnerId}/history`).get()

test('emulator: a keep decision survives real partner fetches and a changed DyCoS value opens a fresh comparison', { skip: !enabled }, async () => {
  const uid = await user(), nummer = number(), req = request(uid, nummer)
  let sourceName = 'Quelle A'
  const dependencies = deps(async () => response(req, { Firma: sourceName }))
  const first = await fetchDycosMasterDataHandler(req, dependencies)
  await getFirestore().doc(`businessPartners/${first.partnerId}`).update({ companyName: 'Manuell' })
  await fetchDycosMasterDataHandler(request(uid, nummer), dependencies)
  const saved = await partner(first)
  await resolveDycosPartnerConflictsHandler({ auth: { uid }, data: { partnerId: first.partnerId, decision: 'keep', expectedRows: dycosConflictRows(saved) } })
  const repeat = await fetchDycosMasterDataHandler(request(uid, nummer), dependencies)
  assert.equal(repeat.conflicts, 0); assert.equal((await partner(first)).companyName, 'Manuell')
  assert.equal(dycosConflictRows(await partner(first)).length, 0)
  sourceName = ''
  await fetchDycosMasterDataHandler(request(uid, nummer), dependencies)
  assert.equal((await partner(first)).dycosImport.resolutions.length, 1)
  sourceName = 'Quelle A'
  assert.equal((await fetchDycosMasterDataHandler(request(uid, nummer), dependencies)).conflicts, 0)
  sourceName = 'Quelle B'
  const changed = await fetchDycosMasterDataHandler(request(uid, nummer), dependencies)
  assert.equal(changed.conflicts, 1); assert.equal(dycosConflictRows(await partner(first)).length, 1)
})

test('partner requests and response identities fail closed; counterpart is only an internal ID', () => {
  for (const nummer of ['', '001', '-2', '1e3', '2147483648', 123]) assert.throws(() => validateDycosPartnerRequest({ typ: 'kunde', nummer, requestId: randomUUID() }))
  for (const expectedPartnerId of ['', '/', 123]) assert.throws(() => validateDycosPartnerRequest({ typ: 'kunde', nummer: '123', requestId: randomUUID(), expectedPartnerId }))
  const req = request('u', '123')
  const raw = response(req, { UnternehmerID: 456, Kreditlimit: 99999, PortalPasswort: 'never-import' })
  const mapped = mapDycosMasterData(raw, req.data)
  assert.deepEqual(mapped.counterpart, { entity: 'carrier', id: '456' })
  assert.equal(mapped.fields.creditLimit, undefined)
  assert.equal(JSON.stringify(mapped).includes('never-import'), false)
  for (const patch of [{ nummer: '456' }, { typ: 'utn' }, { partner: { ID: 123, Debitorennummer: 456 } }, { zahlungsbedingung: { ID: 321 } }]) assert.throws(() => mapDycosMasterData({ ...raw, ...patch }, req.data))
})

test('emulator: refresh is pinned to an existing owned account and never creates a replacement partner', { skip: !enabled }, async () => {
  const uid = await user(), nummer = number(), initial = request(uid, nummer)
  const dependencies = deps(async () => response(initial, { Strasse: 'Quellstraße' }))
  const created = await fetchDycosMasterDataHandler(initial, dependencies)
  const refresh = { ...request(uid, nummer), data: { ...request(uid, nummer).data, expectedPartnerId: created.partnerId } }
  const refreshed = await fetchDycosMasterDataHandler(refresh, dependencies)
  assert.equal(refreshed.partnerId, created.partnerId); assert.equal(refreshed.status, 'unchanged')
  assert.deepEqual(await fetchDycosMasterDataHandler(refresh, deps(() => assert.fail('receipt must avoid source call'))), refreshed)
  for (const expectedPartnerId of [randomUUID(), 'other-partner']) {
    await assert.rejects(fetchDycosMasterDataHandler({ ...refresh, data: { ...refresh.data, requestId: randomUUID(), expectedPartnerId } }, deps(() => assert.fail('invalid target must not fetch'))), { code: 'failed-precondition' })
  }
  const old = await partner(created)
  await assert.rejects(fetchDycosMasterDataHandler({ ...refresh, data: { ...refresh.data, requestId: randomUUID() } }, deps(async () => {
    await getFirestore().doc(`businessPartners/${created.partnerId}`).delete()
    return response(initial)
  })), { code: 'failed-precondition' })
  assert.equal((await getFirestore().doc(`businessPartners/${created.partnerId}`).get()).exists, false)
  await getFirestore().doc(`businessPartners/${created.partnerId}`).set(old)
  await assert.rejects(fetchDycosMasterDataHandler({ ...refresh, data: { ...refresh.data, requestId: randomUUID() } }, deps(async () => {
    await getFirestore().doc(`businessPartners/${created.partnerId}`).update({ debtorNumber: number(), 'dycosReferences.debtorNumbers': [], 'dycosReferences.accounts': [] })
    return response(initial)
  })), { code: 'failed-precondition' })
})

test('emulator: permissions and active profile checked before source access', { skip: !enabled }, async () => {
  let calls = 0
  const dependencies = deps(async () => { calls++; return {} })
  await assert.rejects(fetchDycosMasterDataHandler({ data: {} }, dependencies), { code: 'unauthenticated' })
  for (const uid of [await user({ masterData: 'view', dataImports: 'edit' }), await user({ masterData: 'edit' }, false), randomUUID()]) await assert.rejects(fetchDycosMasterDataHandler(request(uid, number()), dependencies), { code: 'permission-denied' })
  assert.equal(calls, 0)
})

test('emulator: new record, compact creation, idempotent retry, unchanged fetch without extra history', { skip: !enabled }, async () => {
  const uid = await user(); const req = request(uid, number()); let calls = 0
  const dependencies = deps(async query => { calls++; assert.deepEqual(query, { typ: 'kunde', nummer: req.data.nummer }); return response(req, { Kreditlimit: 5000, Strasse: 'Beispielstraße' }) })
  const first = await fetchDycosMasterDataHandler(req, dependencies)
  assert.equal(first.status, 'new')
  const saved = await partner(first)
  assert.equal(saved.creditLimit, null)
  assert.equal(saved.address.street, 'Beispielstraße')
  assert.equal(saved.createdByUserId, uid)
  assert.equal(saved.creditorNumber, '')
  const created = await history(first)
  assert.equal(created.size, 1); assert.equal(created.docs[0].get('action'), 'created'); assert.equal(created.docs[0].get('metadata'), undefined)
  assert.deepEqual(await fetchDycosMasterDataHandler(req, dependencies), first); assert.equal(calls, 1)
  const repeat = await fetchDycosMasterDataHandler(request(uid, req.data.nummer), dependencies)
  assert.equal(repeat.status, 'unchanged'); assert.equal((await history(first)).size, 1)
  await assert.rejects(fetchDycosMasterDataHandler(request(uid, number(), 'utn', req.data.requestId), dependencies), { code: 'invalid-argument' })
})

test('emulator: counterpart already exists, add requested role and blanks, preserve manual and credit-limit values', { skip: !enabled }, async () => {
  const uid = await user(); const req = request(uid, number()); const sourceId = number(); const id = randomUUID()
  await getFirestore().doc(`businessPartners/${id}`).set({ id, companyName: 'Manueller Name', creditorNumber: number(), debtorNumber: '', creditLimit: 42, address: { city: '', houseNumber: '7' }, dycosImport: { sourceReferences: [{ entity: 'carrier', id: sourceId }] } })
  const result = await fetchDycosMasterDataHandler(req, deps(async () => response(req, { UnternehmerID: Number(sourceId), Ort: 'Hamburg', Kreditlimit: 999 })))
  assert.equal(result.partnerId, id); assert.equal(result.status, 'updated'); assert.equal(result.conflicts, 1)
  const saved = await partner(result)
  assert.equal(saved.debtorNumber, req.data.nummer); assert.equal(saved.creditLimit, 42); assert.equal(saved.companyName, 'Manueller Name')
  assert.equal(saved.address.city, 'Hamburg'); assert.equal(saved.address.houseNumber, '7')
  assert.equal(saved.dycosImport.sourceReferences.length, 2)
  assert.deepEqual(saved.dycosReferences.accounts, [{ entity: 'customer', number: req.data.nummer, sourceId: req.data.nummer }])
  const changes = (await history(result)).docs[0].get('metadata.changes')
  assert.ok(changes.some(change => change.path === 'debtorNumber' && change.oldValue === null && change.newValue === req.data.nummer))
  assert.ok(!changes.some(change => change.path === 'companyName' || change.path === 'creditLimit'))
  const repeat = await fetchDycosMasterDataHandler(request(uid, req.data.nummer), deps(async () => response(req, { UnternehmerID: Number(sourceId), Ort: 'Hamburg' })))
  assert.equal(repeat.status, 'unchanged'); assert.equal((await history(result)).size, 1)
})

test('emulator: absent counterpart is not created, requested carrier is complete without TA', { skip: !enabled }, async () => {
  const uid = await user(); const req = request(uid, number(), 'utn')
  const result = await fetchDycosMasterDataHandler(req, deps(async () => response(req, { KundenID: Number(number()) })))
  const saved = await partner(result)
  assert.equal(saved.creditorNumber, req.data.nummer); assert.equal(saved.debtorNumber, '')
  assert.equal(saved.taImportStatus, undefined)
  assert.deepEqual(saved.dycosReferences.debtorNumbers, [])
  assert.deepEqual(saved.dycosImport.sourceReferences, [{ entity: 'carrier', id: req.data.nummer }])
})

test('emulator: contradictory number and counterpart abort atomically with diagnostic', { skip: !enabled }, async () => {
  const uid = await user(); const req = request(uid, number()); const counter = number()
  const a = getFirestore().doc(`businessPartners/${randomUUID()}`), b = getFirestore().doc(`businessPartners/${randomUUID()}`)
  await a.set({ debtorNumber: req.data.nummer, companyName: 'A' })
  await b.set({ creditorNumber: number(), companyName: 'B', dycosImport: { sourceReferences: [{ entity: 'carrier', id: counter }] } })
  const events = []
  await assert.rejects(fetchDycosMasterDataHandler(req, { ...deps(async () => response(req, { UnternehmerID: Number(counter) })), report: async event => events.push(event) }), { code: 'failed-precondition' })
  assert.equal(events.length, 1); assert.equal(events[0].stage, 'save')
  assert.equal((await a.get()).get('companyName'), 'A'); assert.equal((await a.collection('history').get()).size, 0)
  assert.equal((await b.get()).get('debtorNumber'), undefined)
})

test('emulator: source failure and wrong identity create no empty record and permit retry', { skip: !enabled }, async () => {
  const uid = await user(); const req = request(uid, number())
  await assert.rejects(fetchDycosMasterDataHandler(req, deps(async () => { throw new DycosFlowError('partner_not_found', 'fetch') })), { code: 'not-found' })
  await assert.rejects(fetchDycosMasterDataHandler(req, deps(async () => response(req, { Debitorennummer: Number(number()) }))), { code: 'unavailable' })
  const result = await fetchDycosMasterDataHandler(req, deps(async () => response(req)))
  assert.equal(result.status, 'new'); assert.equal((await history(result)).size, 1)
})

test('emulator: concurrent calls to same number make one source request', { skip: !enabled }, async () => {
  const uid = await user(); const req = request(uid, number()); let release; let entered
  const started = new Promise(resolve => { entered = resolve })
  const waiting = new Promise(resolve => { release = resolve })
  const first = fetchDycosMasterDataHandler(req, deps(async () => { entered(); await waiting; return response(req) }))
  await started
  await assert.rejects(fetchDycosMasterDataHandler(request(uid, req.data.nummer), deps(async () => assert.fail('second source call'))), { code: 'aborted' })
  release(); assert.equal((await first).status, 'new')
})

test('emulator: revoked permission during read prevents writing', { skip: !enabled }, async () => {
  const uid = await user(); const req = request(uid, number())
  await assert.rejects(fetchDycosMasterDataHandler(req, deps(async () => { await getFirestore().doc(`users/${uid}`).update({ active: false }); return response(req) })), { code: 'permission-denied' })
})

test('emulator: legacy source references follow merged partner; alias numbers retain their SQL ID', { skip: !enabled }, async () => {
  const uid = await user(); const req = request(uid, number(), 'utn'); const sourceId = number()
  const target = getFirestore().doc(`businessPartners/${randomUUID()}`)
  const archived = getFirestore().doc(`businessPartners/${randomUUID()}`)
  const primary = number()
  await target.set({ creditorNumber: primary, companyName: 'Beispielpartner', dycosReferences: { creditorNumbers: [primary] } })
  await archived.set({ mergedIntoPartnerId: target.id, status: 'merged', dycosImport: { sourceReferences: [{ entity: 'carrier', id: sourceId }] } })
  const result = await fetchDycosMasterDataHandler(req, deps(async () => response(req, { ID: Number(sourceId) })))
  assert.equal(result.partnerId, target.id)
  const saved = await partner(result)
  assert.equal(saved.creditorNumber, primary)
  assert.ok(saved.dycosReferences.creditorNumbers.includes(req.data.nummer))
  assert.ok((await history(result)).docs[0].get('metadata.changes').some(change => change.path === 'dycosReferences.creditorNumbers'))
  await assert.rejects(fetchDycosMasterDataHandler(request(uid, req.data.nummer, 'utn'), deps(async () => response(req, { ID: Number(number()) }))), { code: 'failed-precondition' })
})

test('emulator: technical failure lands in actual diagnostics without raw response or secrets', { skip: !enabled }, async () => {
  const uid = await user(); const req = request(uid, number())
  await assert.rejects(fetchDycosMasterDataHandler(req, { db: getFirestore(), fetchPartner: async () => { throw new Error('sensitive-source-content') } }), { code: 'unavailable' })
  const events = await getFirestore().collection('diagnosticEvents').where('recordId', '==', req.data.requestId).get()
  assert.equal(events.size, 1)
  assert.equal(events.docs[0].get('module'), 'dycos-master-data')
  assert.equal(events.docs[0].get('actorId'), uid)
  assert.equal(JSON.stringify(events.docs[0].data()).includes('sensitive-source-content'), false)
})
