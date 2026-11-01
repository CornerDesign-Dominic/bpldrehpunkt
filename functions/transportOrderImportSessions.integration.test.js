import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { manageTransportOrderImportHandler, listTransportOrderImportRunsHandler, validateImportSession } from './transportOrderImports.js'
import { fetchDycosTransportOrderHandler } from './dycosTransportOrders.js'
import { searchDycosTransportOrdersHandler } from './dycosOrderSearch.js'
import { hasOrderImportAccess } from './dycosImportAccess.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) { assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(localhost|127\.0\.0\.1):/); initializeApp({ projectId: `demo-order-import-tabs-${randomUUID().slice(0, 8)}` }) }
const req = (uid, data) => ({ auth: { uid }, data })
const db = () => getFirestore()
async function user(permissions = {}, role = 'user') { const uid = randomUUID(); await db().doc(`users/${uid}`).set({ role, active: true, permissions, firstName: 'Import', lastName: 'Test' }); return uid }
const source = (number, id = 123) => ({ auftrag: { ID: id, Nummer: Number(number), Ladedatum: '2026-11-01' }, ladeEntladestellen: [], LadeEntladestellen2: [], kunde: null, tour: null, unternehmerstamm: null, fahrzeugart: null, relation: null, zahlungsbedingungKunde: null, zahlungsbedingungUnternehmer: null, auftragspreise: [], tourkosten: [], fakturaZeilen: [], fakturaKopf: [] })
const deps = fetchOrder => ({ db: db(), fetchOrder, report: async () => {} })
const session = (kind = 'single', numbers = ['261100901']) => ({ action: 'start', runId: randomUUID(), kind, items: numbers.map(taNummer => ({ taNummer, requestId: randomUUID(), ...(kind === 'bulk' ? { expectedSourceId: 123 } : {}) })) })
const fetchRequest = (uid, run, index = 0) => req(uid, { ...run.items[index], importRunId: run.runId, selectionIndex: index })

test('new import permissions are independent, deny broad legacy access and manifests reject duplicate or unbound selections', () => {
  const profile = { permissions: { dataImports: 'edit', transportOrderSingleImport: 'edit' } }
  assert.equal(hasOrderImportAccess(profile, 'single'), true)
  assert.equal(hasOrderImportAccess(profile, 'bulk'), false)
  assert.equal(hasOrderImportAccess(profile, 'refresh'), false)
  assert.equal(hasOrderImportAccess({ role: 'admin' }, 'bulk'), false)
  assert.equal(hasOrderImportAccess({ role: 'superadmin' }, 'bulk'), true)
  const run = session('bulk')
  assert.equal(validateImportSession(run).items.length, 1)
  assert.throws(() => validateImportSession({ ...run, items: [run.items[0], run.items[0]] }), { code: 'invalid-argument' })
  assert.throws(() => validateImportSession({ ...run, items: [{ taNummer: '261100901', requestId: randomUUID() }] }), { code: 'invalid-argument' })
  assert.throws(() => validateImportSession({ ...run, items: [{ taNummer: 261100901, requestId: randomUUID(), expectedSourceId: 123 }] }), { code: 'invalid-argument' })
})

test('emulator: a bulk import has one shared run, atomic results, failed retry and receipt replay without duplicate counts', { skip: !enabled }, async () => {
  const uid = await user({ transportOrderBulkImport: 'edit' }), run = session('bulk', ['261100911', '261100912'])
  await manageTransportOrderImportHandler(req(uid, run))
  await manageTransportOrderImportHandler(req(uid, run)) // Start is safe to replay after an ambiguous response.
  let calls = 0
  const first = await fetchDycosTransportOrderHandler(fetchRequest(uid, run), deps(async number => { calls++; return source(number) }))
  assert.equal(first.runId, run.runId)
  assert.deepEqual(await fetchDycosTransportOrderHandler(fetchRequest(uid, run), deps(async () => assert.fail('receipt replay'))), first)
  assert.equal(calls, 1)
  await assert.rejects(fetchDycosTransportOrderHandler(fetchRequest(uid, run, 1), deps(async () => { throw Object.assign(new Error('private source'), { code: 'ta_not_found' }) })), { code: 'not-found' })
  let saved = (await db().doc(`transportOrderImportRuns/${run.runId}`).get()).data()
  assert.equal(saved.status, 'partial'); assert.equal(saved.processed, 2); assert.equal(saved.counts.Neu, 1); assert.equal(saved.counts.Fehlerhaft, 1)
  assert.equal((await db().doc('transportOrders/dycos-261100912').get()).exists, false)
  const result = await fetchDycosTransportOrderHandler(fetchRequest(uid, run, 1), deps(async number => source(number)))
  assert.equal(result.status, 'new')
  saved = (await db().doc(`transportOrderImportRuns/${run.runId}`).get()).data()
  assert.equal(saved.status, 'completed'); assert.equal(saved.processed, 2); assert.equal(saved.counts.Neu, 2); assert.equal(saved.counts.Fehlerhaft, 0)
  const own = await listTransportOrderImportRunsHandler(req(uid, { kind: 'bulk' }))
  assert.equal(own.runs.length, 1)
  const detail = await listTransportOrderImportRunsHandler(req(uid, { kind: 'bulk', runId: run.runId }))
  assert.deepEqual(detail.rows.map(row => row.externalNumber), run.items.map(item => item.taNummer))
  assert.equal(detail.resume, undefined)
  assert.equal((await db().doc(`transportOrderImportRuns/${run.runId}`).collection('rows').get()).size, 2)
})

test('emulator: users cannot cross import types, read foreign histories, forge a selection or import with refresh rights', { skip: !enabled }, async () => {
  const uid = await user({ transportOrderSingleImport: 'edit' }), bulk = session('bulk')
  await assert.rejects(manageTransportOrderImportHandler(req(uid, bulk)), { code: 'permission-denied' })
  await assert.rejects(searchDycosTransportOrdersHandler(req(uid, { modus: 'relationen' }), { db: db(), fetchSearch: async () => assert.fail('no SQL access') }), { code: 'permission-denied' })
  const own = session(); await manageTransportOrderImportHandler(req(uid, own))
  const other = await user({ transportOrderSingleImport: 'edit' })
  await assert.rejects(listTransportOrderImportRunsHandler(req(other, { kind: 'single', runId: own.runId })), { code: 'permission-denied' })
  await assert.rejects(listTransportOrderImportRunsHandler(req(uid, { scope: 'all' })), { code: 'permission-denied' })
  await assert.rejects(fetchDycosTransportOrderHandler(req(uid, { ...own.items[0], taNummer: '261100999', importRunId: own.runId, selectionIndex: 0 }), deps(async () => assert.fail('forged manifest'))), { code: 'failed-precondition' })
  const refresher = await user({ transportOrderRefresh: 'edit' })
  await assert.rejects(fetchDycosTransportOrderHandler(req(refresher, { taNummer: '261100998', requestId: randomUUID() }), deps(async () => assert.fail('single permission missing'))), { code: 'permission-denied' })
  await assert.rejects(fetchDycosTransportOrderHandler(req(refresher, { taNummer: '261100998', requestId: randomUUID(), mode: 'refresh' }), deps(async () => assert.fail('refresh must not create'))), { code: 'not-found' })
  await db().doc('transportOrders/dycos-261100998').set({ externalNumber: '261100998', manual: { note: 'Kept' } })
  await fetchDycosTransportOrderHandler(req(refresher, { taNummer: '261100998', requestId: randomUUID(), mode: 'refresh' }), deps(async number => source(number)))
  assert.equal((await db().doc('transportOrders/dycos-261100998').get()).get('manual.note'), 'Kept')
})

test('emulator: one open import per user, recoverable manifest and discard prevents a late source response from saving', { skip: !enabled }, async () => {
  const uid = await user({ transportOrderSingleImport: 'edit', transportOrderBulkImport: 'edit' }), single = session('single', ['261100921'])
  await manageTransportOrderImportHandler(req(uid, single))
  const bulk = session('bulk', ['261100922'])
  await assert.rejects(manageTransportOrderImportHandler(req(uid, bulk)), error => error.code === 'failed-precondition' && error.details.runId === single.runId)
  const detail = await listTransportOrderImportRunsHandler(req(uid, { kind: 'single', runId: single.runId }))
  assert.deepEqual(detail.resume.items, single.items)
  let started, release
  const begun = new Promise(resolve => { started = resolve }), gate = new Promise(resolve => { release = resolve })
  const pending = fetchDycosTransportOrderHandler(fetchRequest(uid, single), deps(async number => { started(); await gate; return source(number) }))
  await begun
  await manageTransportOrderImportHandler(req(uid, { action: 'discard', runId: single.runId }))
  release()
  await assert.rejects(pending, { code: 'permission-denied' })
  assert.equal((await db().doc('transportOrders/dycos-261100921').get()).exists, false)
  await manageTransportOrderImportHandler(req(uid, bulk))
})

test('emulator: personal and admin histories use stable pages of 25 even for equal timestamps; legacy rows stay accessible to admin', { skip: !enabled }, async () => {
  const uid = await user({ transportOrderSingleImport: 'edit' }), other = await user({ transportOrderSingleImport: 'edit' }), admin = await user({}, 'admin')
  const ids = Array.from({ length: 53 }, () => randomUUID()), at = Timestamp.now(), batch = db().batch()
  for (const id of ids) batch.set(db().doc(`transportOrderImportRuns/${id}`), { kind: 'single', importedByUserId: uid, importedAt: at, counts: {}, status: 'completed' })
  batch.set(db().collection('transportOrderImportRuns').doc(), { kind: 'single', importedByUserId: other, importedAt: at, counts: {}, status: 'completed' })
  await batch.commit()
  const first = await listTransportOrderImportRunsHandler(req(uid, { kind: 'single' }))
  const second = await listTransportOrderImportRunsHandler(req(uid, { kind: 'single', cursor: first.cursor }))
  const third = await listTransportOrderImportRunsHandler(req(uid, { kind: 'single', cursor: second.cursor }))
  assert.deepEqual([first.runs.length, second.runs.length, third.runs.length], [25, 25, 3])
  assert.equal(new Set([...first.runs, ...second.runs, ...third.runs].map(run => run.id)).size, 53)
  assert.equal(third.hasMore, false)
  assert.equal((await listTransportOrderImportRunsHandler(req(admin, { scope: 'all' }))).runs.length, 25)
  await assert.rejects(listTransportOrderImportRunsHandler(req(other, { kind: 'single', cursor: first.cursor })), { code: 'permission-denied' })
})

test('emulator: large selections use bounded manifest chunks and validate membership across chunk boundaries', { skip: !enabled }, async () => {
  const uid = await user({ transportOrderBulkImport: 'edit' }), run = session('bulk', Array.from({ length: 101 }, (_, index) => String(261110000 + index)))
  await manageTransportOrderImportHandler(req(uid, run))
  const ref = db().doc(`transportOrderImportRuns/${run.runId}`), stored = (await ref.get()).data()
  assert.equal(stored.items, undefined)
  assert.equal(stored.selectionChunks, 2)
  assert.equal((await ref.collection('selection').doc('00').get()).get('items').length, 100)
  assert.equal((await ref.collection('selection').doc('01').get()).get('items').length, 1)
  await fetchDycosTransportOrderHandler(fetchRequest(uid, run, 100), deps(async number => source(number)))
  const forged = fetchRequest(uid, run, 100); forged.data.selectionIndex = 0
  await assert.rejects(fetchDycosTransportOrderHandler(forged, deps(async () => assert.fail('wrong manifest chunk'))), { code: 'failed-precondition' })
  const detail = await listTransportOrderImportRunsHandler(req(uid, { kind: 'bulk', runId: run.runId }))
  assert.equal(detail.rows.length, 101)
  assert.equal(detail.rows[100].status, 'Neu')
  assert.equal(detail.rows[0].status, 'Ausstehend')
  assert.deepEqual(detail.resume.items, run.items)
})

test('emulator: simultaneous starts admit one operation and revoking bulk rights during a source call prevents a save', { skip: !enabled }, async () => {
  const uid = await user({ transportOrderBulkImport: 'edit' }), runs = [session('bulk', ['261120001']), session('bulk', ['261120002'])]
  const results = await Promise.allSettled(runs.map(run => manageTransportOrderImportHandler(req(uid, run))))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'failed-precondition').length, 1)
  const run = runs[results.findIndex(result => result.status === 'fulfilled')]
  await assert.rejects(fetchDycosTransportOrderHandler(fetchRequest(uid, run), deps(async number => {
    await db().doc(`users/${uid}`).update({ 'permissions.transportOrderBulkImport': 'none' })
    return source(number)
  })), { code: 'permission-denied' })
  assert.equal((await db().doc(`transportOrders/dycos-${run.items[0].taNummer}`).get()).exists, false)
  await db().doc(`users/${uid}`).update({ 'permissions.transportOrderSingleImport': 'edit' })
  await manageTransportOrderImportHandler(req(uid, session('single', ['261120003'])))
  assert.equal((await db().doc(`transportOrderImportRuns/${run.runId}`).get()).get('status'), 'cancelled')
})
