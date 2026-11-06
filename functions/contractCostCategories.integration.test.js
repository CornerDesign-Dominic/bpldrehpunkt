import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc } from 'firebase/firestore'
import { normalizeContractCostCategoryInput, persistContractCostCategory } from './contractCostCategories.js'
import { normalizeContractMutation, persistContractMutation } from './contracts.js'

test('contract cost catalog and root settings enforce roles, uniqueness, revision and allocation references', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-contracts'
  const stamp = Date.now()
  const app = initializeAdminApp({ projectId }, `contract-categories-admin-${stamp}`)
  const db = getAdminFirestore(app)
  const apps = []
  const profiles = {
    editor: { active: true, role: 'user', permissions: { contracts: 'edit' }, firstName: 'Catalog', lastName: 'Editor' },
    viewer: { active: true, role: 'user', permissions: { contracts: 'view' } },
    none: { active: true, role: 'user', permissions: { contracts: 'none' } },
    admin: { active: true, role: 'admin', permissions: {} },
    superadmin: { active: true, role: 'superadmin' }, inactive: { active: false, role: 'superadmin' },
  }
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  const uid = (name) => `cost-catalog-${name}`
  const clients = Object.fromEntries([...Object.keys(profiles), 'missing', 'anonymous'].map((name) => {
    const client = initializeApp({ projectId, apiKey: 'test' }, `cost-catalog-${name}-${stamp}`)
    apps.push(client)
    const firestore = getFirestore(client)
    connectFirestoreEmulator(firestore, host, Number(port), name === 'anonymous' ? {} : { mockUserToken: { sub: uid(name) } })
    return [name, firestore]
  }))
  let counter = 0
  const categoryInput = (recordId, name, active = true, expectedRevision = 0) => normalizeContractCostCategoryInput({ recordId, mutationId: `cost-category-${++counter}`, expectedRevision, values: { name, active } })
  const save = (input, name = 'editor') => persistContractCostCategory(db, input, { uid: uid(name) })
  const parent = db.doc('contracts/cost-catalog-contract')
  const mutate = (action, values, expectedRevision) => persistContractMutation(db, normalizeContractMutation({ contractId: parent.id, mutationId: `root-category-${++counter}`, action, expectedRevision, values }), { uid: uid('editor') })
  try {
    await Promise.all(Object.entries(profiles).map(([name, profile]) => db.doc(`users/${uid(name)}`).set(profile)))
    await parent.set({ partnerName: 'Office GmbH', createdBy: uid('editor'), createdAt: new Date(), documentStorageAccess: { preserved: { status: 'pending', fileSize: 6 } } })
    await t.test('edit-only catalog writes are idempotent and concurrent normalized names stay unique', async () => {
      const original = categoryInput('cost-it', 'IT & Kommunikation')
      assert.deepEqual(await save(original), { id: 'cost-it', revision: 1 })
      assert.deepEqual(await save(original), { id: 'cost-it', revision: 1 })
      await assert.rejects(save({ ...original, values: { name: 'Changed', active: true } }), { code: 'already-exists' })
      await assert.rejects(save(categoryInput('cost-it-copy', 'ＩＴ &   KOMMUNIKATION')), { code: 'already-exists' })
      const attempts = await Promise.allSettled([save(categoryInput('cost-office', 'Büro')), save(categoryInput('cost-office-copy', 'BÜRO'))])
      assert.equal(attempts.filter((entry) => entry.status === 'fulfilled').length, 1)
      assert.equal(attempts.find((entry) => entry.status === 'rejected').reason.code, 'already-exists')
      assert.equal((await db.collection('contractCostCategories').doc('cost-it').collection('history').get()).size, 1)
      await assert.rejects(save(categoryInput('cost-it', 'New name', true, 0)), { code: 'aborted' })
      for (const name of ['viewer', 'none', 'admin', 'inactive', 'missing']) await assert.rejects(save(categoryInput(`cost-denied-${name}`, `Denied ${name}`), name), { code: 'permission-denied' })
      await save(categoryInput('cost-super', 'Superadmin-Kategorie'), 'superadmin')
      await db.doc(`users/${uid('editor')}`).update({ 'permissions.contracts': 'view' })
      await assert.rejects(save(original), { code: 'permission-denied' })
      await db.doc(`users/${uid('editor')}`).update({ 'permissions.contracts': 'edit' })
    })
    await t.test('only contract readers can read catalog/history; clients cannot write catalog, names or receipts', async () => {
      const category = await db.doc('contractCostCategories/cost-it').get()
      const nameKey = category.get('nameKey')
      for (const [name, client] of Object.entries(clients)) {
        const target = doc(client, 'contractCostCategories', 'cost-it')
        for (const operation of [() => getDoc(target), () => getDocs(collection(client, 'contractCostCategories')), () => getDocs(collection(target, 'history'))]) {
          if (['viewer', 'editor', 'superadmin'].includes(name)) await operation()
          else await assert.rejects(operation(), { code: 'permission-denied' })
        }
        for (const operation of [
          () => setDoc(doc(client, 'contractCostCategories', `forged-${name}`), { name: 'Forged', active: true }),
          () => updateDoc(target, { active: false }), () => deleteDoc(target),
          () => getDocs(collection(target, 'mutations')), () => setDoc(doc(target, 'mutations', 'forged'), { result: { revision: 1 } }),
          () => getDoc(doc(client, 'contractCostCategoryNames', nameKey)),
          () => setDoc(doc(client, 'contractCostCategoryNames', nameKey), { categoryId: 'forged' }),
          () => setDoc(doc(target, 'history', 'forged'), { action: 'category.update' }),
        ]) await assert.rejects(operation(), { code: 'permission-denied' })
      }
    })
    await t.test('root payment/remark/allocation use parent revisions, preserve PDF permits and validate inactive assignments', async () => {
      assert.equal((await mutate('payment', { paymentCycle: 'monthly', paymentAnchorDate: '2026-11-05' }, 0)).revision, 1)
      assert.equal((await mutate('remark', { remark: 'Interne Bemerkung\nZweite Zeile' }, 1)).revision, 2)
      await assert.rejects(mutate('payment', { paymentCycle: '', paymentAnchorDate: '' }, 1), { code: 'aborted' })
      await mutate('allocation', { allocations: [{ categoryId: 'cost-it', basisPoints: 5000 }, { categoryId: 'cost-super', basisPoints: 5000 }] }, 2)
      await save(categoryInput('cost-it', 'IT & Kommunikation', false, 1))
      await mutate('allocation', { allocations: [{ categoryId: 'cost-super', basisPoints: 5000 }, { categoryId: 'cost-it', basisPoints: 5000 }] }, 3)
      await assert.rejects(mutate('allocation', { allocations: [{ categoryId: 'cost-super', basisPoints: 4000 }, { categoryId: 'cost-it', basisPoints: 6000 }] }, 4), { code: 'failed-precondition' })
      await assert.rejects(mutate('allocation', { allocations: [{ categoryId: 'missing', basisPoints: 10000 }] }, 4), { code: 'failed-precondition' })
      await assert.rejects(save(categoryInput('cost-inactive-copy', 'IT & Kommunikation')), { code: 'already-exists' })
      await mutate('allocation', { allocations: [] }, 4)
      await assert.rejects(mutate('allocation', { allocations: [{ categoryId: 'cost-it', basisPoints: 10000 }] }, 5), { code: 'failed-precondition' })
      await save(categoryInput('cost-it', 'IT & Kommunikation', true, 2))
      await mutate('allocation', { allocations: [{ categoryId: 'cost-it', basisPoints: 10000 }] }, 5)
      await mutate('payment', { paymentCycle: '', paymentAnchorDate: '' }, 6)
      const record = (await parent.get()).data()
      assert.equal(record.revision, 7)
      assert.equal(record.paymentCycle, '')
      assert.deepEqual(record.documentStorageAccess.preserved, { status: 'pending', fileSize: 6 })
      const history = (await parent.collection('history').get()).docs.map((entry) => entry.data())
      assert.equal(history.length, 7)
      assert.equal(JSON.stringify(history).includes('Interne Bemerkung'), false)
      assert.ok(history.some((entry) => entry.targetLabel === 'Kostenverteilung'))
    })
  } finally {
    await Promise.all(apps.map((client) => deleteApp(client)))
    await deleteAdminApp(app)
  }
})
