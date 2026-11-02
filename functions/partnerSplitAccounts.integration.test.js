import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { mergeComparison } from './partnerMergeDecisions.js'
import { loadMergeReversal, performPartnerMerge, performPartnerMergeReversal } from './partnerMerges.js'

test('intermediate account split retains earlier members before and after their independent separation', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/)
  const projectId = `${process.env.GCLOUD_PROJECT || 'demo-partner-account-split'}-account-split`
  assert.ok(projectId.startsWith('demo-'))
  const app = initializeApp({ projectId }, `split-${Date.now()}`), db = getFirestore(app)
  const actor = { userId: 'local-test', name: 'Local Test' }
  const partner = (id, number, sourceId) => ({ id, companyName: id, status: 'active', debtorNumber: number, creditorNumber: '', dycosReferences: { debtorNumbers: [number], creditorNumbers: [], accounts: [{ entity: 'customer', number, sourceId }] }, dycosImport: { sourceReferences: [{ entity: 'customer', id: sourceId }] } })
  async function merge(target, source) {
    const [left, right] = await Promise.all([target.get(), source.get()])
    const comparison = mergeComparison({ partners: [left.data(), right.data()] }, target.id)
    const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, value]) => [key, value.resolution ? value : { ...value, resolution: 'target' }]))
    return performPartnerMerge({ db, sourceId: source.id, targetId: target.id, partnerVersions: { [target.id]: left.updateTime.toMillis(), [source.id]: right.updateTime.toMillis() }, decisions, actor })
  }
  async function split(operation, target) {
    const preview = await loadMergeReversal(db, operation.mergeId, target.id)
    assert.equal(preview.canSeparate, true, preview.reason)
    return performPartnerMergeReversal({ db, mergeId: operation.mergeId, targetPartnerId: target.id, fingerprint: preview.fingerprint, actor })
  }
  try {
    for (const earlierFirst of [false, true]) {
      const prefix = earlierFirst ? 'earlier-first' : 'middle-first'
      const a = db.doc(`businessPartners/${prefix}-a`), b = db.doc(`businessPartners/${prefix}-b`), c = db.doc(`businessPartners/${prefix}-c`)
      const numbers = earlierFirst ? ['2001', '2002', '2003'] : ['1001', '1002', '1003']
      await Promise.all([a.set(partner(a.id, numbers[0], '11')), b.set(partner(b.id, numbers[1], '12')), c.set(partner(c.id, numbers[2], '13'))])
      const first = await merge(b, a), second = await merge(c, b)
      if (!earlierFirst) {
        const preview = await loadMergeReversal(db, second.mergeId, c.id)
        const raced = new Proxy(db, { get(target, key) {
          if (key === 'runTransaction') return async callback => {
            await a.update({ proofRevision: 1 })
            return target.runTransaction(callback)
          }
          const value = Reflect.get(target, key)
          return typeof value === 'function' ? value.bind(target) : value
        } })
        await assert.rejects(performPartnerMergeReversal({ db: raced, mergeId: second.mergeId, targetPartnerId: c.id, fingerprint: preview.fingerprint, actor }), { code: 'failed-precondition' })
        assert.equal((await b.get()).get('status'), 'merged')
        assert.equal((await db.doc(`partnerMergeOperations/${second.mergeId}`).get()).get('status'), 'merged')
      }
      if (earlierFirst) await split(first, c)
      await split(second, c)
      assert.deepEqual((await b.get()).get('dycosReferences.accounts').map(account => account.number), [numbers[1]])
      assert.deepEqual((await b.get()).get('dycosImport.sourceReferences'), [{ entity: 'customer', id: '12' }])
      assert.deepEqual((await c.get()).get('dycosReferences.accounts').map(account => account.number).sort(), (earlierFirst ? [numbers[2]] : [numbers[0], numbers[2]]).sort())
      if (!earlierFirst) await split(first, c)
      assert.deepEqual((await a.get()).get('dycosReferences.accounts').map(account => account.number), [numbers[0]])
      assert.deepEqual((await c.get()).get('dycosReferences.accounts').map(account => account.number), [numbers[2]])
    }
  } finally { await db.terminate(); await deleteApp(app) }
})
