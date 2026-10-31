import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { listTransportOrderImportRunsHandler } from './transportOrderImports.js'
import { listCustomerImportQueueHandler, claimCustomerImportRowHandler, approveCustomerImportRowHandler } from './customerImports.js'
import { listCarrierImportQueueHandler, claimCarrierImportRowHandler, approveCarrierImportRowHandler } from './carrierImports.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) initializeApp({ projectId: 'demo-drehpunkt-legacy-review' })
const request = (uid, data = {}) => ({ auth: { uid }, data })

for (const kind of ['customer', 'carrier']) {
  test(`emulator: saved ${kind} CSV review remains readable, protected and auditable without a CSV importer`, { skip: !enabled }, async () => {
    const db = getFirestore(), key = randomUUID(), uid = `editor-${key}`, other = `other-${key}`, denied = `denied-${key}`
    const profile = { active: true, permissions: { dataImports: 'edit', masterData: 'edit' }, firstName: 'Legacy', lastName: 'Review' }
    await Promise.all([
      db.doc(`users/${uid}`).set(profile), db.doc(`users/${other}`).set(profile),
      db.doc(`users/${denied}`).set({ ...profile, permissions: { dataImports: 'edit', masterData: 'view' } }),
    ])
    const run = db.collection(`${kind}ImportRuns`).doc(key), row = db.collection(`${kind}ImportRows`).doc(key)
    const partner = db.collection('businessPartners').doc(key), numberKey = kind === 'customer' ? 'debtorNumber' : 'creditorNumber'
    const partnerKey = kind === 'customer' ? 'customerId' : 'carrierId'
    const source = kind === 'customer' ? 'dycosCustomerImport' : 'dycosCarrierImport'
    const list = kind === 'customer' ? listCustomerImportQueueHandler : listCarrierImportQueueHandler
    const claim = kind === 'customer' ? claimCustomerImportRowHandler : claimCarrierImportRowHandler
    const approve = kind === 'customer' ? approveCustomerImportRowHandler : approveCarrierImportRowHandler
    await partner.set({ id: key, companyName: 'Bisheriger Name', [numberKey]: key, status: 'active', contacts: [] })
    await partner.collection('history').doc('original').set({ action: 'created', source, importRunId: key, createdAt: Timestamp.now() })
    await run.set({ id: key, fileName: `${kind}.csv`, importedByName: 'Alter Import', importedAt: Timestamp.now() })
    await row.set({ id: key, runId: key, source, fileName: `${kind}.csv`, state: 'open', kind: 'review', [partnerKey]: key, [numberKey]: key,
      companyName: 'Neuer Name', comparisons: [{ path: 'companyName', label: 'Firma', currentValue: 'Bisheriger Name', incomingValue: 'Neuer Name' }], updatedAt: Timestamp.now() })
    const input = { runId: key, rowId: key }
    await assert.rejects(list(request(denied, input)), { code: 'permission-denied' })
    assert.ok((await list(request(uid, input))).open.some(entry => entry.id === key))
    await claim(request(uid, input))
    await assert.rejects(claim(request(other, input)), { code: 'failed-precondition' })
    await assert.rejects(approve(request(other, input)), { code: 'failed-precondition' })
    // A change made after opening the comparison must never be overwritten silently.
    await partner.update({ companyName: 'Zwischenzeitlich bearbeitet' })
    await assert.rejects(approve(request(uid, input)), { code: 'failed-precondition' })
    await claim(request(uid, input))
    await approve(request(uid, { ...input, approvedValues: { companyName: 'Neuer Name' } }))
    const result = await list(request(uid, input))
    assert.equal(result.open.some(entry => entry.id === key), false)
    assert.equal(result.currentAccepted.find(entry => entry.id === key).affectedPartner.id, key)
    assert.equal(result.runs[key].fileName, `${kind}.csv`)
    assert.equal((await partner.get()).get('companyName'), 'Neuer Name')
    assert.equal((await partner.collection('history').doc('original').get()).get('action'), 'created')
    const history = await partner.collection('history').get()
    assert.equal(history.size, 2)
    assert.deepEqual(history.docs.flatMap(entry => entry.get('metadata.changes') || []).map(change => [change.oldValue, change.newValue]), [['Zwischenzeitlich bearbeitet', 'Neuer Name']])
    await assert.rejects(approve(request(uid, input)), { code: 'failed-precondition' })
  })
}

test('emulator: historic transport CSV run and its rows remain readable without modifying the saved order', { skip: !enabled }, async () => {
  const db = getFirestore(), key = randomUUID(), uid = `reader-${key}`
  await db.doc(`users/${uid}`).set({ active: true, permissions: { dataImports: 'edit' } })
  const run = db.collection('transportOrderImportRuns').doc(key)
  await run.set({ source: 'dycos', fileName: 'original.csv', importedAt: Timestamp.now(), importedByName: 'Historischer Nutzer', counts: { Neu: 1 } })
  await run.collection('rows').doc('row').set({ rowNumber: 2, externalNumber: '260100123', status: 'Neu' })
  const order = db.collection('transportOrders').doc(key)
  await order.set({ externalNumber: '260100123', manual: { note: 'Erhalten' }, importMeta: { fileName: 'original.csv' } })
  const before = (await order.get()).data()
  const result = await listTransportOrderImportRunsHandler(request(uid, { runId: key }))
  assert.equal(result.run.fileName, 'original.csv')
  assert.equal(result.run.importedByName, 'Historischer Nutzer')
  assert.equal(result.rows[0].externalNumber, '260100123')
  assert.deepEqual((await order.get()).data(), before)
})
