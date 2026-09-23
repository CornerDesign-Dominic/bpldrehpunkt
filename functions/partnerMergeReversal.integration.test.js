import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { mergeComparison } from '../src/lib/partnerMergeDecisions.js'
import { mergedPartnerHistoryEntry, partnerReferenceNumbers } from '../src/lib/partnerReferencePresentation.js'
import { assertFlatPartnerCluster, partnerClusterMembers, resolvePartnerInIndex } from '../src/lib/partnerCluster.js'
import { loadMergeReversal, mergeManualPartnersHandler, performPartnerMerge, performPartnerMergeReversal, prepareManualPartnerMergeHandler, previewPartnerMergeReversalHandler, separatePartnerMergeHandler } from './partnerMerges.js'

if (process.env.FIRESTORE_EMULATOR_HOST) initializeApp({ projectId: 'demo-drehpunkt-merge-access' })

test('Firestore emulator: merge and separation preserve every original module reference while effective resolution changes', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const app = initializeApp({ projectId: 'demo-drehpunkt-merge-reversal' }, `merge-reversal-${Date.now()}`)
  const db = getFirestore(app)
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const targetId = `target-${nonce}`; const sourceId = `source-${nonce}`
  const targetRef = db.collection('businessPartners').doc(targetId)
  const sourceRef = db.collection('businessPartners').doc(sourceId)
  const linkedDocs = [
    { collection: 'transportOrders', fields: ['imported.customer.partnerId', 'imported.carrier.partnerId'], data: { imported: { customer: { partnerId: sourceId }, carrier: { partnerId: sourceId } } } },
    { collection: 'todos', fields: ['customerId', 'carrierId'], data: { customerId: sourceId, carrierId: sourceId, customerName: 'Quelle GmbH', carrierName: 'Quelle GmbH' } },
    { collection: 'damageCases', fields: ['claimantPartnerId', 'contractorPartnerId'], data: { claimantPartnerId: sourceId, contractorPartnerId: sourceId } },
    { collection: 'palletMovements', fields: ['partnerId', 'customerId', 'carrierId'], data: { partnerId: sourceId, customerId: sourceId, carrierId: sourceId } },
    { collection: 'palletClosings', fields: ['partnerId'], data: { partnerId: sourceId } },
    { collection: 'inkassoCases', fields: ['debtorPartnerId'], data: { debtorPartnerId: sourceId } },
    { collection: 'customerImportRows', fields: ['customerId', 'result.partnerId'], data: { customerId: sourceId, result: { partnerId: sourceId } } },
    { collection: 'carrierImportRows', fields: ['carrierId', 'result.partnerId'], data: { carrierId: sourceId, result: { partnerId: sourceId } } },
    { collection: 'businessPartners', fields: ['linkedCarrierReference.partnerId'], data: { status: 'active', linkedCarrierReference: { partnerId: sourceId } } },
  ].map((entry) => ({ ...entry, ref: db.collection(entry.collection).doc(`before-${nonce}`) }))
  const read = (record, path) => path.split('.').reduce((value, part) => value?.[part], record)
  const target = { id: targetId, companyName: 'Ziel GmbH', debtorNumber: '10689', creditorNumber: '', dycosReferences: { debtorNumbers: ['10689'], creditorNumbers: [] }, status: 'active', address: { city: '' }, contact: { email: '' }, contacts: [{ id: 'one', email: 'same@example.test' }], updatedAt: Timestamp.now() }
  const source = { id: sourceId, companyName: 'Quelle GmbH', debtorNumber: '10007', creditorNumber: '75397', dycosReferences: { debtorNumbers: ['10007'], creditorNumbers: ['75397'] }, status: 'active', address: { city: 'Hamburg' }, contact: { email: 'quelle@example.test' }, contacts: [{ id: 'two', email: 'other@example.test' }], updatedAt: Timestamp.now() }
  await Promise.all([targetRef.set(target), sourceRef.set(source), ...linkedDocs.map((entry) => entry.ref.set(entry.data)), sourceRef.collection('activities').doc('activity').set({ date: '2026-09-23', text: 'Vor Merge' }), sourceRef.collection('ratings').doc('rating').set({ score: 4, note: 'Vor Merge' }), db.collection('insolvencies').doc(sourceId).set({ partnerId: sourceId, partnerName: 'Quelle GmbH', updatedAt: Timestamp.now() }), db.collection('insolvencies').doc(sourceId).collection('claims').doc('claim').set({ amount: 100, note: 'Vor Merge' })])
  const [targetSnapshot, sourceSnapshot] = await Promise.all([targetRef.get(), sourceRef.get()])
  const comparison = mergeComparison({ partners: [target, source] }, targetId)
  const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, decision]) => [key, decision.resolution ? decision : { ...decision, resolution: 'target' }]))
  const merged = await performPartnerMerge({ db, targetId, sourceId, partnerVersions: { [targetId]: targetSnapshot.updateTime.toMillis(), [sourceId]: sourceSnapshot.updateTime.toMillis() }, decisions, actor: { userId: 'tester', name: 'Testperson' } })
  assert.equal((await sourceRef.get()).data().mergedIntoPartnerId, targetId)
  assert.equal((await targetRef.get()).get('status'), 'active')
  assert.deepEqual((await targetRef.get()).get('dycosReferences.debtorNumbers'), ['10689', '10007'])
  assert.deepEqual((await targetRef.get()).get('dycosReferences.creditorNumbers'), ['75397'])
  assert.deepEqual(partnerReferenceNumbers((await targetRef.get()).data(), 'debtor').additional, ['10007'])
  const mergeHistory = (await targetRef.collection('history').where('mergeId', '==', merged.mergeId).get()).docs.find((entry) => entry.get('action') === 'merged')
  assert.equal(mergedPartnerHistoryEntry(mergeHistory.data(), { id: sourceId, ...(await sourceRef.get()).data() }).actorName, 'Testperson')
  assert.deepEqual((await targetRef.get()).get('contacts').map((contact) => contact.email), ['same@example.test', 'other@example.test'])
  assert.equal((await targetRef.collection('ratings').where('mergedFromPartnerId', '==', sourceId).get()).size, 0)
  assert.equal((await db.collection('insolvencies').doc(targetId).get()).exists, false)
  assert.equal((await db.collection('insolvencies').doc(sourceId).collection('claims').doc('claim').get()).get('amount'), 100)
  for (const entry of linkedDocs) for (const field of entry.fields) assert.equal(read((await entry.ref.get()).data(), field), sourceId, `${entry.collection}/${field} nach Merge`)
  assert.equal(resolvePartnerInIndex(new Map([target, { ...source, status: 'merged', mergedIntoPartnerId: targetId }].map((partner) => [partner.id, partner])), sourceId).id, targetId)
  await assert.rejects(performPartnerMerge({ db, targetId, sourceId, partnerVersions: { [targetId]: targetSnapshot.updateTime.toMillis(), [sourceId]: sourceSnapshot.updateTime.toMillis() }, decisions, actor: { userId: 'tester', name: 'Testperson' } }), /bereits zusammengeführt/)
  await db.collection('todos').doc(`after-${nonce}`).set({ customerId: targetId, customerName: 'Ziel GmbH' })
  await db.collection('transportOrders').doc(`after-${nonce}`).set({ imported: { carrier: { partnerId: targetId } } })
  await db.collection('carrierImportRows').doc(`after-${nonce}`).set({ carrierId: targetId, result: { partnerId: targetId } })
  await targetRef.update({ 'address.city': 'München', updatedAt: Timestamp.now() })
  await linkedDocs.find((entry) => entry.collection === 'damageCases').ref.update({ claimantPartnerId: 'third-partner', claimant: 'Dritter Partner' })
  const preview = await loadMergeReversal(db, merged.mergeId, targetId)
  assert.equal(preview.canSeparate, true)
  assert.ok(preview.summary.warnings.some((warning) => warning.includes('address.city')))
  assert.deepEqual(preview.summary.referenceCounts, {})
  await performPartnerMergeReversal({ db, mergeId: merged.mergeId, targetPartnerId: targetId, fingerprint: preview.fingerprint, actor: { userId: 'tester', name: 'Testperson' } })
  const [restoredSource, remainingTarget, oldTodo, newTodo, sourceInsolvency, targetInsolvency] = await Promise.all([sourceRef.get(), targetRef.get(), db.collection('todos').doc(`before-${nonce}`).get(), db.collection('todos').doc(`after-${nonce}`).get(), db.collection('insolvencies').doc(sourceId).get(), db.collection('insolvencies').doc(targetId).get()])
  assert.equal(restoredSource.data().status, 'active')
  assert.equal(restoredSource.data().mergedIntoPartnerId, undefined)
  assert.equal(restoredSource.data().debtorNumber, '10007')
  assert.equal(restoredSource.data().creditorNumber, '75397')
  assert.equal(remainingTarget.data().status, 'active')
  assert.deepEqual(remainingTarget.data().dycosReferences.debtorNumbers, ['10689'])
  assert.deepEqual(remainingTarget.data().dycosReferences.creditorNumbers, [])
  assert.deepEqual(partnerReferenceNumbers(remainingTarget.data(), 'debtor').additional, [])
  assert.deepEqual(partnerReferenceNumbers(restoredSource.data(), 'creditor').numbers, ['75397'])
  assert.equal(remainingTarget.data().address.city, 'München')
  assert.deepEqual(remainingTarget.data().contacts, target.contacts)
  assert.equal(oldTodo.data().customerId, sourceId)
  for (const entry of linkedDocs) for (const field of entry.fields) assert.equal(read((await entry.ref.get()).data(), field), entry.collection === 'damageCases' && field === 'claimantPartnerId' ? 'third-partner' : sourceId, `${entry.collection}/${field} nach Trennung`)
  assert.equal(newTodo.data().customerId, targetId)
  assert.equal((await db.collection('transportOrders').doc(`after-${nonce}`).get()).get('imported.carrier.partnerId'), targetId)
  assert.equal((await db.collection('carrierImportRows').doc(`after-${nonce}`).get()).get('carrierId'), targetId)
  assert.equal(sourceInsolvency.data().mergedIntoPartnerId, undefined)
  assert.equal(targetInsolvency.exists, false)
  assert.equal((await db.collection('insolvencies').doc(sourceId).collection('claims').doc('claim').get()).get('amount'), 100)
  assert.equal((await db.collection('insolvencies').doc(targetId).collection('claims').doc('claim').get()).exists, false)
  assert.equal((await sourceRef.collection('ratings').doc('rating').get()).get('score'), 4)
  assert.equal((await targetRef.collection('ratings').get()).size, 0)
  assert.equal((await sourceRef.collection('activities').doc('activity').get()).data().text, 'Vor Merge')
  assert.equal((await loadMergeReversal(db, merged.mergeId, targetId)).canSeparate, false)
  await assert.rejects(performPartnerMergeReversal({ db, mergeId: merged.mergeId, targetPartnerId: targetId, fingerprint: preview.fingerprint, actor: { userId: 'tester', name: 'Testperson' } }), /bereits getrennt/)
})

test('Firestore emulator: merge and separation callables deny users without the dedicated merge permission', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = getFirestore(); const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const denied = `denied-${nonce}`; const allowed = `allowed-${nonce}`
  await Promise.all([
    db.doc(`users/${denied}`).set({ active: true, permissions: { dataImports: 'edit', masterData: 'edit' } }),
    db.doc(`users/${allowed}`).set({ active: true, permissions: { partnerMerges: 'edit' } }),
    db.doc(`businessPartners/first-${nonce}`).set({ companyName: 'A', status: 'active' }),
    db.doc(`businessPartners/second-${nonce}`).set({ companyName: 'B', status: 'active' }),
  ])
  const selection = { currentPartnerId: `first-${nonce}`, otherPartnerId: `second-${nonce}`, direction: 'current-target' }
  await assert.rejects(prepareManualPartnerMergeHandler({ auth: { uid: denied }, data: selection }), /Berechtigung/i)
  await assert.rejects(mergeManualPartnersHandler({ auth: { uid: denied }, data: selection }), /Berechtigung/i)
  await assert.rejects(previewPartnerMergeReversalHandler({ auth: { uid: denied }, data: { mergeId: 'missing', targetPartnerId: selection.currentPartnerId } }), /Berechtigung/i)
  await assert.rejects(separatePartnerMergeHandler({ auth: { uid: denied }, data: { mergeId: 'missing', targetPartnerId: selection.currentPartnerId, fingerprint: 'x' } }), /Berechtigung/i)
  const prepared = await prepareManualPartnerMergeHandler({ auth: { uid: allowed }, data: selection })
  assert.equal(prepared.targetPartnerId, selection.currentPartnerId)
  await assert.rejects(prepareManualPartnerMergeHandler({ auth: null, data: selection }), /Anmeldung erforderlich/i)
  const legacyRef = db.collection('partnerMergeOperations').doc(`legacy-${nonce}`)
  await legacyRef.set({ schemaVersion: 0, sourcePartnerId: selection.otherPartnerId, targetPartnerId: selection.currentPartnerId })
  assert.match((await loadMergeReversal(db, legacyRef.id, selection.currentPartnerId)).reason, /Protokoll fehlt/i)
})

test('Firestore emulator: a prior member can be separated after another merge without moving the remaining member', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const app = initializeApp({ projectId: 'demo-drehpunkt-merge-nested' }, `merge-nested-${Date.now()}`)
  const db = getFirestore(app); const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const refs = ['target', 'source-one', 'source-two'].map((kind) => db.collection('businessPartners').doc(`${kind}-${nonce}`))
  await Promise.all(refs.map((ref, index) => ref.set({ id: ref.id, companyName: `Partner ${index}`, status: 'active', debtorNumber: `${index + 1}-${nonce}`, creditorNumber: '', dycosReferences: { debtorNumbers: [`${index + 1}-${nonce}`], creditorNumbers: [] } })))
  async function merge(sourceRef) {
    const [target, source] = await Promise.all([refs[0].get(), sourceRef.get()])
    const comparison = mergeComparison({ partners: [{ id: target.id, ...target.data() }, { id: source.id, ...source.data() }] }, target.id)
    const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, choice]) => [key, choice.resolution ? choice : { ...choice, resolution: 'target' }]))
    return performPartnerMerge({ db, targetId: target.id, sourceId: source.id, partnerVersions: { [target.id]: target.updateTime.toMillis(), [source.id]: source.updateTime.toMillis() }, decisions, actor: { userId: 'test', name: 'Test' } })
  }
  const first = await merge(refs[1])
  assert.equal((await loadMergeReversal(db, first.mergeId, refs[0].id)).canSeparate, true)
  const second = await merge(refs[2])
  const earlier = await loadMergeReversal(db, first.mergeId, refs[0].id)
  assert.equal(earlier.canSeparate, true)
  await performPartnerMergeReversal({ db, mergeId: first.mergeId, targetPartnerId: refs[0].id, fingerprint: earlier.fingerprint, actor: { userId: 'test', name: 'Test' } })
  assert.equal((await refs[1].get()).get('mergedIntoPartnerId'), undefined)
  assert.equal((await refs[2].get()).get('mergedIntoPartnerId'), refs[0].id)
  const latest = await loadMergeReversal(db, second.mergeId, refs[0].id)
  assert.equal(latest.canSeparate, true)
})

test('Firestore emulator: two clusters flatten, one former member separates alone, then the remaining cluster flattens to a third root', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const app = initializeApp({ projectId: 'demo-drehpunkt-two-clusters' }, `two-clusters-${Date.now()}`)
  const db = getFirestore(app); const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const ids = ['A', 'A1', 'A2', 'B', 'B4', 'B5', 'C'].map((name) => `${name}-${nonce}`)
  const [a, a1, a2, b, b4, b5, c] = ids.map((id) => db.doc(`businessPartners/${id}`))
  await Promise.all(ids.map((id, index) => db.doc(`businessPartners/${id}`).set({ id, companyName: id, status: 'active', debtorNumber: `${index + 1000}`, creditorNumber: '', dycosReferences: { debtorNumbers: [`${index + 1000}`], creditorNumbers: [] } })))
  const order = db.doc(`transportOrders/cluster-${nonce}`); const damage = db.doc(`damageCases/cluster-${nonce}`); const todo = db.doc(`todos/cluster-${nonce}`)
  const inkasso = db.doc(`inkassoCases/cluster-${nonce}`); const pallet = db.doc(`palletMovements/cluster-${nonce}`); const insolvency = db.doc(`insolvencies/${b4.id}`)
  await Promise.all([
    order.set({ imported: { customer: { partnerId: b4.id, partnerName: b4.id } } }),
    damage.set({ claimantPartnerId: b4.id, claimant: b4.id, transportReference: `TA-${nonce}` }),
    todo.set({ customerId: b4.id, customerName: b4.id, damageCaseId: damage.id, reference: `TA-${nonce}`, insolvencyId: b4.id, inkassoCaseId: inkasso.id }),
    inkasso.set({ debtorPartnerId: b4.id, debtorName: b4.id }),
    pallet.set({ customerId: b4.id, customerBalance: 12 }),
    insolvency.set({ partnerId: b4.id, partnerName: b4.id }),
  ])
  async function merge(targetRef, sourceRef) {
    const [target, source] = await Promise.all([targetRef.get(), sourceRef.get()])
    const comparison = mergeComparison({ partners: [{ id: target.id, ...target.data() }, { id: source.id, ...source.data() }] }, target.id)
    const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, choice]) => [key, choice.resolution ? choice : { ...choice, resolution: 'target' }]))
    return performPartnerMerge({ db, targetId: target.id, sourceId: source.id, partnerVersions: { [target.id]: target.updateTime.toMillis(), [source.id]: source.updateTime.toMillis() }, decisions, actor: { userId: 'cluster-test', name: 'Cluster-Test' } })
  }
  await merge(a, a1); await merge(a, a2)
  const leafMerge = await merge(b, b4); await merge(b, b5)
  await merge(a, b)
  async function partners() { return (await db.collection('businessPartners').get()).docs.map((entry) => ({ id: entry.id, ...entry.data() })) }
  let all = await partners()
  assertFlatPartnerCluster(all)
  for (const member of [a1, a2, b, b4, b5]) assert.equal(all.find((entry) => entry.id === member.id).mergedIntoPartnerId, a.id)
  assert.equal(partnerClusterMembers(all, a.id).length, 6)
  const records = await Promise.all([order.get(), damage.get(), todo.get(), inkasso.get(), pallet.get(), insolvency.get()])
  assert.deepEqual(records.map((entry) => [entry.get('imported.customer.partnerId'), entry.get('claimantPartnerId'), entry.get('customerId'), entry.get('debtorPartnerId'), entry.get('customerId'), entry.get('partnerId')][records.indexOf(entry)]), Array(6).fill(b4.id))
  assert.equal(records[2].get('damageCaseId'), damage.id)
  assert.equal(records[2].get('insolvencyId'), b4.id)
  assert.equal(records[2].get('inkassoCaseId'), inkasso.id)
  const preview = await loadMergeReversal(db, leafMerge.mergeId, a.id)
  assert.equal(preview.canSeparate, true)
  await performPartnerMergeReversal({ db, mergeId: leafMerge.mergeId, targetPartnerId: a.id, fingerprint: preview.fingerprint, actor: { userId: 'cluster-test', name: 'Cluster-Test' } })
  all = await partners()
  assertFlatPartnerCluster(all)
  assert.equal(all.find((entry) => entry.id === b4.id).mergedIntoPartnerId, undefined)
  for (const member of [a1, a2, b, b5]) assert.equal(all.find((entry) => entry.id === member.id).mergedIntoPartnerId, a.id)
  assert.equal(resolvePartnerInIndex(new Map(all.map((entry) => [entry.id, entry])), b4.id).id, b4.id)
  await merge(c, a)
  all = await partners()
  assertFlatPartnerCluster(all)
  for (const member of [a, a1, a2, b, b5]) assert.equal(all.find((entry) => entry.id === member.id).mergedIntoPartnerId, c.id)
  assert.equal(all.find((entry) => entry.id === b4.id).mergedIntoPartnerId, undefined)
  assert.equal((await order.get()).get('imported.customer.partnerId'), b4.id)
  assert.equal((await todo.get()).get('damageCaseId'), damage.id)
})
