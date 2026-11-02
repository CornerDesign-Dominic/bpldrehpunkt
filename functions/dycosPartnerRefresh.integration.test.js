import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { refreshDycosMasterDataHandler } from './dycosPartnerRefresh.js'
import { resolveDycosPartnerConflictsHandler } from './dycosPartnerReview.js'
import { dycosConflictRows } from './shared/dycosPartnerConflicts.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) { assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(localhost|127\.0\.0\.1):/); initializeApp({ projectId: 'demo-drehpunkt-dycos-refresh' }) }
const number = () => String(10000000 + Math.floor(Math.random() * 90000000))
async function setup() {
  const db = getFirestore(), uid = randomUUID(), partnerId = randomUUID(), debtor = number(), creditor = number()
  await db.doc(`users/${uid}`).set({ active: true, permissions: { masterData: 'edit' }, firstName: 'Refresh', lastName: 'Test' })
  const ref = db.doc(`businessPartners/${partnerId}`)
  const accounts = [{ entity: 'customer', number: debtor, sourceId: debtor }, { entity: 'carrier', number: creditor, sourceId: creditor }]
  await ref.set({ companyName: 'Manuell', debtorNumber: debtor, creditorNumber: creditor, address: { city: '', houseNumber: '7' }, creditLimit: 42, status: 'insolvency', dycosReferences: { accounts }, dycosImport: { sourceReferences: accounts.map(a => ({ entity: a.entity, id: a.sourceId })) } })
  const response = (account, extra = {}) => ({ schemaVersion: 1, ...account, partner: { ID: Number(account.nummer), ...(account.typ === 'kunde' ? { Debitorennummer: Number(debtor), Firma: 'Manuell', UnternehmerID: Number(creditor) } : { Kreditorennummer: Number(creditor), Bezeichnung: 'Manuell', KundenID: Number(debtor) }), Ort: 'Berlin', ...extra }, zahlungsbedingung: null })
  const request = () => ({ auth: { uid }, data: { partnerId, requestId: randomUUID() } })
  return { db, uid, partnerId, debtor, creditor, ref, response, request }
}

test('emulator: both roles are read once and saved together, preserving manual data, history and retry identity', { skip: !enabled }, async () => {
  const s = await setup(), calls = [], req = s.request()
  const deps = { fetchPartner: async account => { calls.push(account); return s.response(account, account.typ === 'utn' ? { Strasse: 'Quellstraße' } : {}) } }
  const result = await refreshDycosMasterDataHandler(req, deps)
  assert.deepEqual(calls, [{ typ: 'kunde', nummer: s.debtor }, { typ: 'utn', nummer: s.creditor }])
  assert.equal(result.status, 'updated'); assert.deepEqual(result.refreshedAccounts, calls)
  const saved = (await s.ref.get()).data()
  assert.deepEqual(saved.address, { city: 'Berlin', houseNumber: '7', street: 'Quellstraße' })
  assert.equal(saved.companyName, 'Manuell'); assert.equal(saved.creditLimit, 42); assert.equal(saved.status, 'insolvency')
  assert.equal((await s.ref.collection('history').get()).size, 1)
  const entry = (await s.ref.collection('history').get()).docs[0]
  assert.equal(entry.get('createdByName'), 'Refresh Test'); assert.equal(entry.get('metadata.changes').length, 2)
  assert.deepEqual(await refreshDycosMasterDataHandler(req, { fetchPartner: () => assert.fail('receipt must avoid reads') }), result)
  assert.equal((await s.db.doc(`dycosImportQuotas/${s.uid}`).get()).get('count'), 2)
  assert.equal((await refreshDycosMasterDataHandler(s.request(), deps)).status, 'unchanged')
  assert.equal((await s.ref.collection('history').get()).size, 1)
})

test('emulator: conflicting sources never win by read order; rejected comparisons survive a combined refresh', { skip: !enabled }, async () => {
  const s = await setup()
  const deps = { fetchPartner: async account => s.response(account, account.typ === 'kunde' ? { Firma: 'Kundenname', Ort: 'Berlin' } : { Bezeichnung: 'Unternehmername', Ort: 'Hamburg' }) }
  const result = await refreshDycosMasterDataHandler(s.request(), deps)
  const saved = (await s.ref.get()).data()
  assert.equal(result.conflicts, 2); assert.equal(saved.companyName, 'Manuell'); assert.equal(saved.address.city, '')
  const rows = dycosConflictRows(saved)
  assert.equal(rows.every(row => row.resolvable === false), true)
  await resolveDycosPartnerConflictsHandler({ auth: { uid: s.uid }, data: { partnerId: s.partnerId, decision: 'keep', expectedRows: [rows.find(row => row.path === 'companyName')] } })
  assert.equal((await refreshDycosMasterDataHandler(s.request(), deps)).conflicts, 1)
  assert.equal((await s.ref.get()).get('companyName'), 'Manuell')
})

test('emulator: either source failing prevents all partner writes and releases both account locks', { skip: !enabled }, async () => {
  const s = await setup(), before = (await s.ref.get()).data(), calls = [], reports = []
  await assert.rejects(refreshDycosMasterDataHandler(s.request(), { fetchPartner: async account => { calls.push(account); if (account.typ === 'utn') throw new Error('private raw source error'); return s.response(account) }, report: async entry => reports.push(entry) }), { code: 'unavailable' })
  assert.equal(calls.length, 2); assert.deepEqual((await s.ref.get()).data(), before)
  assert.equal((await s.ref.collection('history').get()).size, 0)
  for (const account of calls) assert.equal((await s.db.doc(`dycosMasterDataLocks/${account.typ}-${account.nummer}`).get()).exists, false)
  assert.equal(reports.length, 1); assert.equal(JSON.stringify(reports).includes('private raw'), false)
})

test('emulator: active master-data rights, unchanged account ownership and quota are enforced', { skip: !enabled }, async () => {
  const s = await setup(), source = { fetchPartner: account => s.response(account), report: async () => {} }
  await assert.rejects(refreshDycosMasterDataHandler({ data: s.request().data }, source), { code: 'unauthenticated' })
  await s.db.doc(`users/${s.uid}`).update({ permissions: { masterData: 'view', dataImports: 'edit' } })
  await assert.rejects(refreshDycosMasterDataHandler(s.request(), { fetchPartner: () => assert.fail('no rights') }), { code: 'permission-denied' })
  await s.db.doc(`users/${s.uid}`).update({ permissions: { masterData: 'edit' } })
  const before = (await s.ref.get()).data()
  await assert.rejects(refreshDycosMasterDataHandler(s.request(), { ...source, fetchPartner: async account => { await s.db.doc(`users/${s.uid}`).update({ active: false }); return s.response(account) } }), { code: 'permission-denied' })
  assert.deepEqual((await s.ref.get()).data(), before)
  await s.db.doc(`users/${s.uid}`).update({ active: true })
  await assert.rejects(refreshDycosMasterDataHandler(s.request(), { ...source, fetchPartner: async account => { if (account.typ === 'kunde') await s.ref.update({ debtorNumber: number() }); return s.response(account) } }), { code: 'failed-precondition' })
  assert.equal((await s.ref.collection('history').get()).size, 0)
  await s.db.doc(`dycosImportQuotas/${s.uid}`).set({ windowStart: Date.now(), count: 9 })
  await assert.rejects(refreshDycosMasterDataHandler(s.request(), { fetchPartner: () => assert.fail('quota') }), { code: 'resource-exhausted' })
})

test('emulator: only the stored primary account per role is fetched; single-role partners need no selection', { skip: !enabled }, async () => {
  const s = await setup(), calls = []
  await s.ref.update({ creditorNumber: '', dycosReferences: { debtorNumbers: ['17171'], accounts: [{ entity: 'customer', number: s.debtor, sourceId: s.debtor }] }, dycosImport: { sourceReferences: [{ entity: 'customer', id: s.debtor }] } })
  const result = await refreshDycosMasterDataHandler(s.request(), { fetchPartner: async account => { calls.push(account); return s.response(account) } })
  assert.deepEqual(calls, [{ typ: 'kunde', nummer: s.debtor }]); assert.equal(result.refreshedAccounts.length, 1)
})

test('emulator: refresh shares account locks with simultaneous imports', { skip: !enabled }, async () => {
  const s = await setup()
  let release, started
  const pending = new Promise(resolve => { release = resolve }), signal = new Promise(resolve => { started = resolve })
  const first = refreshDycosMasterDataHandler(s.request(), { fetchPartner: async account => { started(); await pending; return s.response(account) } })
  await signal
  await assert.rejects(refreshDycosMasterDataHandler(s.request(), { fetchPartner: () => assert.fail('parallel source call') }), { code: 'aborted' })
  release(); await first
})
