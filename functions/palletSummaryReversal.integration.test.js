import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { invalidatePalletSummariesForReversal } from './partnerMerges.js'

test('legacy partner reversal invalidates pallet sums atomically and cannot race their rebuild', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const app = initializeApp({ projectId: 'demo-drehpunkt-pallet-reversal' }, `pallet-reversal-${Date.now()}`)
  const db = getFirestore(app)
  const state = db.doc('palletSummaryState/current')
  const source = db.doc('palletMovements/legacy')
  try {
    await state.set({ status: 'ready', generation: 'old', tourCoverage: true })
    await source.set({ carrierId: 'old' })
    const plan = [{ snapshot: await source.get(), patch: { carrierId: 'new' } }]
    const unchanged = db.batch()
    await invalidatePalletSummariesForReversal(db, unchanged, [{ snapshot: plan[0].snapshot, patch: {} }])
    await unchanged.commit()
    assert.equal((await state.get()).get('status'), 'ready')

    const batch = db.batch()
    await invalidatePalletSummariesForReversal(db, batch, plan)
    batch.update(source, { carrierId: 'new' })
    await batch.commit()
    assert.equal((await state.get()).get('status'), 'dirty')
    assert.equal((await state.get()).get('tourCoverage'), false)
    assert.equal((await source.get()).get('carrierId'), 'new')

    await state.update({ status: 'building' })
    await assert.rejects(invalidatePalletSummariesForReversal(db, db.batch(), plan), { code: 'failed-precondition' })
    await state.update({ status: 'ready' })
    const racing = db.batch()
    await invalidatePalletSummariesForReversal(db, racing, plan)
    racing.update(source, { carrierId: 'must-not-commit' })
    await state.update({ status: 'building' })
    await assert.rejects(racing.commit())
    assert.equal((await source.get()).get('carrierId'), 'new')
  } finally {
    await db.terminate()
    await deleteApp(app)
  }
})
