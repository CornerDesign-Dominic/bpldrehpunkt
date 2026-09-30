import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { mergeComparison } from '../src/lib/partnerMergeDecisions.js'
import { PARTNER_REFERENCE_CATALOG, assertFlatPartnerCluster, partnerClusterMembers, resolvePartnerInIndex } from '../src/lib/partnerCluster.js'
import { loadMergeReversal, performPartnerMerge, performPartnerMergeReversal } from './partnerMerges.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const partner = (id, number) => ({ id, companyName: id, status: 'active', debtorNumber: number, creditorNumber: '', dycosReferences: { debtorNumbers: [number], creditorNumbers: [] } })
const valueAt = (record, path) => path.split('.').reduce((value, key) => value?.[key], record)

async function merge(db, targetRef, sourceRef) {
  const [target, source] = await Promise.all([targetRef.get(), sourceRef.get()])
  const comparison = mergeComparison({ partners: [{ id: target.id, ...target.data() }, { id: source.id, ...source.data() }] }, target.id)
  const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, choice]) => [key, choice.resolution ? choice : { ...choice, resolution: 'target' }]))
  return performPartnerMerge({ db, targetId: target.id, sourceId: source.id, partnerVersions: { [target.id]: target.updateTime.toMillis(), [source.id]: source.updateTime.toMillis() }, decisions, actor: { userId: 'origin-test', name: 'Origin Test' } })
}

async function cluster(db, id) {
  const entries = (await db.collection('businessPartners').get()).docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
  assertFlatPartnerCluster(entries)
  return { entries, members: partnerClusterMembers(entries, id) }
}

async function linkedToCluster(db, collection, fields, members) {
  const ids = new Set(members.map((member) => member.id))
  const records = (await db.collection(collection).get()).docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
  return records.filter((record) => fields.some((field) => ids.has(valueAt(record, field))))
}

test('Firestore emulator: damage, TA, legal, insolvency and inkasso origins survive merge, separation and re-merge', { skip: !enabled }, async () => {
  const app = initializeApp({ projectId: 'demo-drehpunkt-origin-flows' }, `origin-flows-${Date.now()}`)
  const db = getFirestore(app)
  const source = db.doc('businessPartners/source'); const target = db.doc('businessPartners/target')
  await Promise.all([source.set({ ...partner(source.id, '10007'), status: 'insolvency' }), target.set(partner(target.id, '10689'))])
  const records = {
    damage: db.doc('damageCases/damage'), ta: db.doc('transportOrders/ta'), legal: db.doc('legalDisputes/legal'),
    insolvency: db.doc(`insolvencies/${source.id}`), inkasso: db.doc('inkassoCases/inkasso'),
    damageTodo: db.doc('todos/damage-todo'), taTodo: db.doc('todos/ta-todo'), legalTodo: db.doc('todos/legal-todo'),
    insolvencyTodo: db.doc('todos/insolvency-todo'), inkassoTodo: db.doc('todos/inkasso-todo'),
    pallet: db.doc('palletMovements/pallet'), closing: db.doc('palletClosings/closing'),
  }
  await Promise.all([
    records.damage.set({ claimantPartnerId: source.id, contractorPartnerId: source.id, transportReference: 'TA-17' }),
    records.ta.set({ imported: { customer: { partnerId: source.id }, carrier: { partnerId: source.id } }, reference: 'TA-17' }),
    records.legal.set({ counterpartyName: 'Source', transportReference: 'TA-17' }),
    records.insolvency.set({ partnerId: source.id, partnerName: 'Source' }),
    records.inkasso.set({ debtorPartnerId: source.id, debtorName: 'Source' }),
    records.damageTodo.set({ customerId: source.id, damageCaseId: records.damage.id }),
    records.legalTodo.set({ customerId: source.id, legalDisputeId: records.legal.id }),
    records.insolvencyTodo.set({ carrierId: source.id, insolvencyId: records.insolvency.id }),
    records.inkassoTodo.set({ carrierId: source.id, inkassoCaseId: records.inkasso.id }),
    records.pallet.set({ partnerId: source.id, customerId: source.id, carrierId: source.id, incoming: 4 }),
    records.closing.set({ partnerId: source.id, balance: 4 }),
    source.collection('activities').doc('activity').set({ text: 'Ursprüngliche CRM-Aktivität' }),
    source.collection('ratings').doc('rating').set({ score: 4 }),
  ])
  const first = await merge(db, target, source)
  // This To-do is created from its original TA after the source has already been archived.
  await records.taTodo.set({ customerId: source.id, reference: 'TA-17' })
  const rootOnly = db.doc('todos/root-only')
  await rootOnly.set({ customerId: target.id, reference: 'TA-99' })

  async function verify(expectedRoot, expectedMembers) {
    const { entries, members } = await cluster(db, expectedRoot)
    assert.deepEqual(new Set(members.map((member) => member.id)), new Set(expectedMembers))
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    assert.equal(resolvePartnerInIndex(byId, source.id).id, expectedRoot)
    for (const [key, field] of [['damage', 'claimantPartnerId'], ['ta', 'imported.customer.partnerId'], ['insolvency', 'partnerId'], ['inkasso', 'debtorPartnerId'], ['pallet', 'partnerId'], ['closing', 'partnerId'], ['damageTodo', 'customerId'], ['taTodo', 'customerId'], ['legalTodo', 'customerId'], ['insolvencyTodo', 'carrierId'], ['inkassoTodo', 'carrierId']]) {
      assert.equal(valueAt((await records[key].get()).data(), field), source.id, `${key}: ursprüngliche Partner-ID`)
    }
    for (const [todoKey, caseKey, field] of [['damageTodo', 'damage', 'damageCaseId'], ['legalTodo', 'legal', 'legalDisputeId'], ['insolvencyTodo', 'insolvency', 'insolvencyId'], ['inkassoTodo', 'inkasso', 'inkassoCaseId']]) assert.equal((await records[todoKey].get()).get(field), records[caseKey].id)
    assert.equal((await records.taTodo.get()).get('reference'), 'TA-17')
    assert.equal((await rootOnly.get()).get('customerId'), target.id)
    const todoFields = PARTNER_REFERENCE_CATALOG.find((item) => item.collection === 'todos').fields
    const todos = await linkedToCluster(db, 'todos', todoFields, members)
    assert.deepEqual(new Set(todos.map((todo) => todo.id)), new Set(expectedRoot === source.id ? ['damage-todo', 'ta-todo', 'legal-todo', 'insolvency-todo', 'inkasso-todo'] : ['damage-todo', 'ta-todo', 'legal-todo', 'insolvency-todo', 'inkasso-todo', 'root-only']))
    assert.equal((await source.collection('activities').doc('activity').get()).get('text'), 'Ursprüngliche CRM-Aktivität')
    assert.equal((await source.collection('ratings').doc('rating').get()).get('score'), 4)
    for (const [collection, fields] of [
      ['damageCases', ['claimantPartnerId', 'contractorPartnerId']],
      ['transportOrders', ['imported.customer.partnerId', 'imported.carrier.partnerId']],
      ['inkassoCases', ['debtorPartnerId']],
      ['insolvencies', ['partnerId']],
      ['palletMovements', ['partnerId', 'customerId', 'carrierId']],
      ['palletClosings', ['partnerId']],
    ]) assert.equal((await linkedToCluster(db, collection, fields, members)).length, 1, `${collection}: aktives Cluster findet Ursprungsobjekt`)
    const crmActivityCounts = await Promise.all(members.map((member) => db.collection(`businessPartners/${member.id}/activities`).get()))
    const crmRatingCounts = await Promise.all(members.map((member) => db.collection(`businessPartners/${member.id}/ratings`).get()))
    assert.equal(crmActivityCounts.reduce((count, snapshot) => count + snapshot.size, 0), 1)
    assert.equal(crmRatingCounts.reduce((count, snapshot) => count + snapshot.size, 0), 1)
  }
  await verify(target.id, [source.id, target.id])
  const preview = await loadMergeReversal(db, first.mergeId, target.id)
  assert.equal(preview.canSeparate, true)
  await performPartnerMergeReversal({ db, mergeId: first.mergeId, targetPartnerId: target.id, fingerprint: preview.fingerprint, actor: { userId: 'origin-test', name: 'Origin Test' } })
  assert.equal((await source.get()).get('status'), 'insolvency')
  await verify(source.id, [source.id])
  const second = await merge(db, target, source)
  assert.notEqual(second.mergeId, first.mergeId)
  await verify(target.id, [source.id, target.id])
})
