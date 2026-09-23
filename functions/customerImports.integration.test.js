import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { approveCustomerImportRowHandler, claimCustomerImportRowHandler, listCustomerImportQueueHandler, processCustomerImportHandler } from './customerImports.js'
import { loadMergeReversal, mergeCustomerImportPartnersHandler, performPartnerMergeReversal } from './partnerMerges.js'
import { mergeComparison } from '../src/lib/partnerMergeDecisions.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) initializeApp({ projectId: 'demo-drehpunkt-customer-campaign' })
const db = () => getFirestore()
const nonce = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const request = (uid, data) => ({ auth: { uid }, data })
const row = (debtorNumber, companyName, data = {}) => ({ debtorNumber, companyName, data: { contacts: [], ...data } })

async function user(id, permissions = { dataImports: 'edit', masterData: 'edit' }) {
  await db().doc(`users/${id}`).set({ active: true, permissions, firstName: 'Test', lastName: 'Import' })
  return id
}

test('Firestore emulator: customer creation, exact re-import, safe enrichment and reviewed conflict keep one durable queue row', { skip: !enabled }, async () => {
  const key = nonce(); const uid = await user(`customer-${key}`); const second = await user(`second-${key}`)
  const denied = await user(`denied-${key}`, { dataImports: 'edit', masterData: 'view' })
  const debtor = `D-${key}`; const firstRow = row(debtor, 'Kunde GmbH')
  await assert.rejects(processCustomerImportHandler(request(denied, { fileName: 'KU.csv', rows: [firstRow] })), /Berechtigung|Bearbeitungsrechte/i)
  const first = await processCustomerImportHandler(request(uid, { fileName: 'KU.csv', rows: [firstRow] }))
  assert.equal(first.counts.automaticallyAccepted, 1)
  const partnerId = first.accepted[0].customerId
  assert.equal((await db().doc(`businessPartners/${partnerId}`).get()).get('creditorNumber'), '')
  const repeat = await processCustomerImportHandler(request(uid, { fileName: 'KU.csv', rows: [firstRow] }))
  assert.equal(repeat.accepted[0].customerId, partnerId)
  assert.deepEqual(repeat.accepted[0].result.actions, ['unchanged'])
  const enriched = row(debtor, 'Kunde GmbH', { street: 'Neue Straße 2', city: 'Berlin' })
  await processCustomerImportHandler(request(uid, { fileName: 'Ergänzung.csv', rows: [enriched] }))
  assert.equal((await db().doc(`businessPartners/${partnerId}`).get()).get('address.street'), 'Neue Straße 2')
  const changed = row(debtor, 'Kunde Neu', { street: 'Neue Straße 2', city: 'Berlin' })
  await processCustomerImportHandler(request(uid, { fileName: 'Konflikt.csv', rows: [changed] }))
  const latest = await processCustomerImportHandler(request(uid, { fileName: 'Konflikt neu.csv', rows: [row(debtor, 'Kunde Endfassung', changed.data)] }))
  const queue = await listCustomerImportQueueHandler(request(uid, { runId: latest.runId }))
  const open = queue.open.filter((item) => item.debtorNumber === debtor)
  assert.equal(open.length, 1)
  assert.equal(open[0].fileName, 'Konflikt neu.csv')
  assert.equal(open[0].comparisons.find((item) => item.path === 'companyName').incomingValue, 'Kunde Endfassung')
  const claimed = await claimCustomerImportRowHandler(request(uid, { runId: latest.runId, rowId: open[0].id }))
  assert.equal(claimed.row.comparisons.find((item) => item.path === 'companyName').current, 'Kunde GmbH')
  await assert.rejects(claimCustomerImportRowHandler(request(second, { runId: latest.runId, rowId: open[0].id })), /bereits von/i)
  await assert.rejects(approveCustomerImportRowHandler(request(second, { runId: latest.runId, rowId: open[0].id, approvedValues: { companyName: 'Falsch' } })), /Prüfreservierung/i)
  const approved = await approveCustomerImportRowHandler(request(uid, { runId: latest.runId, rowId: open[0].id, approvedValues: { companyName: 'Kunde Endfassung' } }))
  assert.equal(approved.row.customerId, partnerId)
  const after = await listCustomerImportQueueHandler(request(uid, { runId: latest.runId }))
  assert.equal(after.open.some((item) => item.id === open[0].id), false)
  assert.equal(after.currentAccepted.find((item) => item.id === open[0].id).approval.type, 'reviewed')
  assert.equal(after.runs[latest.runId].fileName, 'Konflikt neu.csv')
  assert.equal(after.currentAccepted.find((item) => item.id === open[0].id).affectedPartner.id, partnerId)
  assert.equal((await db().doc(`businessPartners/${partnerId}`).get()).get('companyName'), 'Kunde Endfassung')
  await assert.rejects(approveCustomerImportRowHandler(request(uid, { runId: latest.runId, rowId: open[0].id, approvedValues: {} })), /bereits bearbeitet/i)
})

test('Firestore emulator: number identity connects the same dual-role partner, while equal name, VAT, address and email never match', { skip: !enabled }, async () => {
  const key = nonce(); const uid = await user(`identity-${key}`)
  const creditor = `C-${key}`; const debtor = `D-${key}`
  const existingRef = db().collection('businessPartners').doc(`creditor-${key}`)
  await existingRef.set({ id: existingRef.id, status: 'active', companyName: 'Gleiche Firma', debtorNumber: '', creditorNumber: creditor, dycosReferences: { debtorNumbers: [], creditorNumbers: [creditor] }, companyData: { vatId: 'DE-EXACT' }, address: { street: 'Gleiche Straße', city: 'Berlin' }, contact: { email: 'same@example.test' } })
  const linked = await processCustomerImportHandler(request(uid, { fileName: 'Gegen-ID.csv', rows: [row(debtor, 'Gleiche Firma', { linkedCreditorNumber: creditor, vatId: 'DE-EXACT', street: 'Gleiche Straße', city: 'Berlin', website: 'same@example.test' })] }))
  assert.equal(linked.accepted[0].customerId, existingRef.id)
  assert.equal((await existingRef.get()).get('debtorNumber'), debtor)
  const unrelatedDebtor = `D2-${key}`
  const separate = await processCustomerImportHandler(request(uid, { fileName: 'Nur gleiche Merkmale.csv', rows: [row(unrelatedDebtor, 'Gleiche Firma', { vatId: 'DE-EXACT', street: 'Gleiche Straße', city: 'Berlin', website: 'same@example.test' })] }))
  assert.equal(separate.counts.automaticallyAccepted, 1)
  assert.notEqual(separate.accepted[0].customerId, existingRef.id)
  assert.equal((await db().doc(`businessPartners/${separate.accepted[0].customerId}`).get()).get('companyData.vatId'), 'DE-EXACT')
  const others = (await db().collection('businessPartners').get()).docs.filter((entry) => [debtor, unrelatedDebtor].includes(entry.get('debtorNumber')))
  assert.equal(others.length, 2)
})

test('Firestore emulator: conflicting debtor and creditor partners stay separate in a merge review', { skip: !enabled }, async () => {
  const key = nonce(); const uid = await user(`merge-customer-${key}`, { dataImports: 'edit', masterData: 'edit', partnerMerges: 'edit' })
  const debtor = `D-${key}`; const creditor = `C-${key}`
  const debtorRef = db().collection('businessPartners').doc(`debtor-${key}`)
  const creditorRef = db().collection('businessPartners').doc(`creditor-${key}`)
  await Promise.all([
    debtorRef.set({ id: debtorRef.id, companyName: 'Kunde', status: 'active', debtorNumber: debtor, creditorNumber: '', dycosReferences: { debtorNumbers: [debtor], creditorNumbers: [] } }),
    creditorRef.set({ id: creditorRef.id, companyName: 'Unternehmer', status: 'active', debtorNumber: '', creditorNumber: creditor, dycosReferences: { debtorNumbers: [], creditorNumbers: [creditor] } }),
  ])
  const imported = await processCustomerImportHandler(request(uid, { fileName: 'Merge.csv', rows: [row(debtor, 'Kunde', { linkedCreditorNumber: creditor })] }))
  assert.equal(imported.counts.open, 1)
  const open = (await listCustomerImportQueueHandler(request(uid, { runId: imported.runId }))).open.find((item) => item.debtorNumber === debtor)
  assert.equal(open.kind, 'merge')
  assert.deepEqual(open.merge.partnerIds, [debtorRef.id, creditorRef.id])
  assert.equal((await debtorRef.get()).get('creditorNumber'), '')
  assert.equal((await creditorRef.get()).get('debtorNumber'), '')
})

test('Firestore emulator: customer merge re-import resolves to the survivor; separation restores two identities without duplicates', { skip: !enabled }, async () => {
  const key = nonce(); const uid = await user(`merge-cycle-${key}`, { dataImports: 'edit', masterData: 'edit', partnerMerges: 'edit' })
  const debtor = `D-${key}`; const creditor = `C-${key}`
  const debtorRef = db().collection('businessPartners').doc(`a-debtor-${key}`)
  const creditorRef = db().collection('businessPartners').doc(`z-creditor-${key}`)
  await Promise.all([
    debtorRef.set({ id: debtorRef.id, companyName: 'Gleicher Partner', status: 'active', debtorNumber: debtor, creditorNumber: '', dycosReferences: { debtorNumbers: [debtor], creditorNumbers: [] } }),
    creditorRef.set({ id: creditorRef.id, companyName: 'Gleicher Partner', status: 'active', debtorNumber: '', creditorNumber: creditor, dycosReferences: { debtorNumbers: [], creditorNumbers: [creditor] } }),
  ])
  const importedRow = row(debtor, 'Gleicher Partner', { linkedCreditorNumber: creditor })
  const first = await processCustomerImportHandler(request(uid, { fileName: 'KU.csv', rows: [importedRow] }))
  const open = (await listCustomerImportQueueHandler(request(uid, { runId: first.runId }))).open.find((item) => item.debtorNumber === debtor)
  const claimed = await claimCustomerImportRowHandler(request(uid, { runId: first.runId, rowId: open.id }))
  const comparison = mergeComparison(claimed.row.merge, debtorRef.id)
  const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([field, choice]) => [field, choice.resolution ? choice : { ...choice, resolution: 'target' }]))
  const merged = await mergeCustomerImportPartnersHandler(request(uid, { runId: first.runId, rowId: open.id, targetPartnerId: debtorRef.id, decisions, partnerVersions: Object.fromEntries(claimed.row.merge.partners.map((item) => [item.id, item.version])) }))
  assert.equal(merged.row.customerId, debtorRef.id)
  assert.equal((await creditorRef.get()).get('mergedIntoPartnerId'), debtorRef.id)
  const repeated = await processCustomerImportHandler(request(uid, { fileName: 'KU erneut.csv', rows: [importedRow] }))
  assert.equal(repeated.counts.open, 0)
  assert.equal(repeated.accepted[0].customerId, debtorRef.id)
  const mergeId = (await creditorRef.get()).get('mergedByMergeId')
  const reversal = await loadMergeReversal(db(), mergeId, debtorRef.id)
  assert.equal(reversal.canSeparate, true)
  await performPartnerMergeReversal({ db: db(), mergeId, targetPartnerId: debtorRef.id, fingerprint: reversal.fingerprint, actor: { userId: uid, name: 'Test' } })
  assert.equal((await creditorRef.get()).get('mergedIntoPartnerId'), undefined)
  const directAfterSplit = await processCustomerImportHandler(request(uid, { fileName: 'KU ohne Gegen-ID.csv', rows: [row(debtor, 'Gleicher Partner')] }))
  assert.equal(directAfterSplit.counts.open, 0)
  assert.equal(directAfterSplit.accepted[0].customerId, debtorRef.id)
  const afterSplit = await processCustomerImportHandler(request(uid, { fileName: 'KU nach Trennung.csv', rows: [importedRow] }))
  assert.equal(afterSplit.counts.open, 1)
  assert.equal((await listCustomerImportQueueHandler(request(uid, { runId: afterSplit.runId }))).open.find((item) => item.debtorNumber === debtor)?.kind, 'merge')
  assert.equal((await db().collection('businessPartners').where('debtorNumber', '==', debtor).get()).size, 1)
  assert.equal((await db().collection('businessPartners').where('creditorNumber', '==', creditor).get()).size, 1)
})

test('Firestore emulator: customer re-import follows an archived debtor to the surviving creditor partner', { skip: !enabled }, async () => {
  const key = nonce(); const uid = await user(`customer-forward-${key}`, { dataImports: 'edit', masterData: 'edit', partnerMerges: 'edit' })
  const debtor = `D-${key}`; const creditor = `C-${key}`
  const debtorRef = db().collection('businessPartners').doc(`a-debtor-${key}`)
  const creditorRef = db().collection('businessPartners').doc(`z-creditor-${key}`)
  await Promise.all([
    debtorRef.set({ id: debtorRef.id, companyName: 'Gemeinsam', status: 'active', debtorNumber: debtor, creditorNumber: '', dycosReferences: { debtorNumbers: [debtor], creditorNumbers: [] } }),
    creditorRef.set({ id: creditorRef.id, companyName: 'Gemeinsam', status: 'active', debtorNumber: '', creditorNumber: creditor, dycosReferences: { debtorNumbers: [], creditorNumbers: [creditor] } }),
  ])
  const importedRow = row(debtor, 'Gemeinsam', { linkedCreditorNumber: creditor })
  const first = await processCustomerImportHandler(request(uid, { fileName: 'KU.csv', rows: [importedRow] }))
  const open = (await listCustomerImportQueueHandler(request(uid, { runId: first.runId }))).open.find((item) => item.debtorNumber === debtor)
  const claimed = await claimCustomerImportRowHandler(request(uid, { runId: first.runId, rowId: open.id }))
  const comparison = mergeComparison(claimed.row.merge, creditorRef.id)
  const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([field, choice]) => [field, choice.resolution ? choice : { ...choice, resolution: 'target' }]))
  await mergeCustomerImportPartnersHandler(request(uid, { runId: first.runId, rowId: open.id, targetPartnerId: creditorRef.id, decisions, partnerVersions: Object.fromEntries(claimed.row.merge.partners.map((item) => [item.id, item.version])) }))
  const repeated = await processCustomerImportHandler(request(uid, { fileName: 'KU erneut.csv', rows: [importedRow] }))
  assert.equal(repeated.counts.open, 0)
  assert.equal(repeated.accepted[0].customerId, creditorRef.id)
  assert.equal((await debtorRef.get()).get('mergedIntoPartnerId'), creditorRef.id)
})
