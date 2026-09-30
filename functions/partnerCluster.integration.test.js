import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { mergeComparison } from '../src/lib/partnerMergeDecisions.js'
import { assertFlatPartnerCluster } from '../src/lib/partnerCluster.js'
import { performPartnerMerge } from './partnerMerges.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

async function merge(db, targetRef, sourceRef) {
  const [target, source] = await Promise.all([targetRef.get(), sourceRef.get()])
  const comparison = mergeComparison({ partners: [{ id: target.id, ...target.data() }, { id: source.id, ...source.data() }] }, target.id)
  const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, choice]) => [key, choice.resolution ? choice : { ...choice, resolution: 'target' }]))
  return performPartnerMerge({ db, targetId: target.id, sourceId: source.id, partnerVersions: { [target.id]: target.updateTime.toMillis(), [source.id]: source.updateTime.toMillis() }, decisions, actor: { userId: 'cluster-test', name: 'Cluster-Test' } })
}

async function seedCluster(db, count) {
  const targetRef = db.doc('businessPartners/target'); const sourceRef = db.doc('businessPartners/source')
  const base = (id) => ({ id, companyName: id, status: 'active', debtorNumber: id, creditorNumber: '', dycosReferences: { debtorNumbers: [id], creditorNumbers: [] } })
  await Promise.all([targetRef.set(base(targetRef.id)), sourceRef.set(base(sourceRef.id))])
  const writer = db.bulkWriter()
  for (let index = 0; index < count; index += 1) {
    const id = `leaf-${String(index).padStart(3, '0')}`
    writer.set(db.doc(`businessPartners/${id}`), { id, companyName: id, status: 'merged', mergedIntoPartnerId: sourceRef.id, mergedByMergeId: `prior-${id}`, debtorNumber: '', creditorNumber: '' })
  }
  await writer.close()
  return { targetRef, sourceRef }
}

test('Firestore emulator: a large cluster flattens atomically and never rewrites original references', { skip: !enabled }, async () => {
  const app = initializeApp({ projectId: 'demo-drehpunkt-large-cluster' }, `large-cluster-${Date.now()}`)
  const db = getFirestore(app); const { targetRef, sourceRef } = await seedCluster(db, 120)
  const writer = db.bulkWriter()
  for (let index = 0; index < 540; index += 1) {
    const originId = `leaf-${String(index % 120).padStart(3, '0')}`
    writer.set(db.doc(`todos/bulk-${index}`), { customerId: originId, reference: `TA-${index}` })
    writer.set(db.doc(`palletMovements/bulk-${index}`), { partnerId: originId, incoming: index + 1 })
  }
  await writer.close()
  await merge(db, targetRef, sourceRef)
  const partners = (await db.collection('businessPartners').get()).docs.map((entry) => ({ id: entry.id, ...entry.data() }))
  assertFlatPartnerCluster(partners)
  assert.equal(partners.filter((partner) => partner.mergedIntoPartnerId === targetRef.id).length, 121)
  const [todos, movements] = await Promise.all([db.collection('todos').get(), db.collection('palletMovements').get()])
  assert.equal(todos.size, 540); assert.equal(movements.size, 540)
  for (const snapshot of [...todos.docs, ...movements.docs]) {
    const originalId = snapshot.get('customerId') || snapshot.get('partnerId')
    assert.match(originalId, /^leaf-\d{3}$/)
    assert.equal(partners.find((partner) => partner.id === originalId).mergedIntoPartnerId, targetRef.id)
  }
})

test('Firestore emulator: batch boundary rejects oversized clusters before any redirect changes', { skip: !enabled }, async () => {
  const app = initializeApp({ projectId: 'demo-drehpunkt-batch-limit' }, `batch-limit-${Date.now()}`)
  const db = getFirestore(app); const { targetRef, sourceRef } = await seedCluster(db, 446)
  await assert.rejects(merge(db, targetRef, sourceRef), /Zu viele Partner im Verbund/)
  assert.equal((await sourceRef.get()).get('status'), 'active')
  assert.equal((await db.doc('businessPartners/leaf-000').get()).get('mergedIntoPartnerId'), sourceRef.id)
  assert.equal((await db.collection('partnerMergeOperations').get()).size, 0)
})

test('Firestore emulator: parallel merges and invalid redirect targets fail without persisting a chain', { skip: !enabled }, async () => {
  const app = initializeApp({ projectId: 'demo-drehpunkt-parallel-cluster' }, `parallel-cluster-${Date.now()}`)
  const db = getFirestore(app); const { targetRef, sourceRef } = await seedCluster(db, 1)
  const results = await Promise.allSettled([merge(db, targetRef, sourceRef), merge(db, targetRef, sourceRef)])
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1)
  assert.equal(results.filter((item) => item.status === 'rejected').length, 1)
  assert.equal((await db.doc('businessPartners/leaf-000').get()).get('mergedIntoPartnerId'), targetRef.id)
  const next = db.doc('businessPartners/another-target'); await next.set({ id: next.id, status: 'active', companyName: 'Another', debtorNumber: '', creditorNumber: '' })
  const invalid = db.doc('businessPartners/broken'); await invalid.set({ id: invalid.id, status: 'merged', mergedIntoPartnerId: 'missing' })
  await assert.rejects(merge(db, next, targetRef), /Weiterleitungsziel nicht vorhanden/)
  assert.equal((await targetRef.get()).get('mergedIntoPartnerId'), undefined)
  await invalid.delete()
  await Promise.all([
    db.doc('businessPartners/cycle-one').set({ id: 'cycle-one', status: 'merged', mergedIntoPartnerId: 'cycle-two' }),
    db.doc('businessPartners/cycle-two').set({ id: 'cycle-two', status: 'merged', mergedIntoPartnerId: 'cycle-one' }),
  ])
  await assert.rejects(merge(db, next, targetRef), /Zyklische Partner-Weiterleitung/)
  assert.equal((await targetRef.get()).get('mergedIntoPartnerId'), undefined)
})
