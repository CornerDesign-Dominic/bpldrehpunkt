import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { processStatusMailAi } from './statusMailAi.js'

test('parallel deliveries share one paid inference, expired claims can be retried and failed inference releases its lease', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const app = initializeApp({ projectId: 'demo-drehpunkt-ai-concurrency' }, `ai-concurrency-${Date.now()}`)
  const db = getFirestore(app)
  const orderId = `order-${Date.now()}`
  const mailId = 'synthetic-mail'
  const mailRef = db.doc(`transportOrders/${orderId}/receivedMails/${mailId}`)
  try {
    await db.doc(`transportOrders/${orderId}`).set({ imported: {} })
    await mailRef.set({ source: 'powerAutomate', mailbox: 'status@brennpunkt-logistik.de', transportOrderId: orderId, receivedAt: Timestamp.now(), bodyText: 'Keine neue Statusangabe.' })
    let entered, finish
    const started = new Promise((resolve) => { entered = resolve })
    const completed = new Promise((resolve) => { finish = resolve })
    let calls = 0
    const infer = async () => { calls += 1; entered(); await completed; return { isStatusUpdate: false, updates: [] } }
    const first = processStatusMailAi({ db, orderId, mailId, infer })
    await started
    assert.equal(await processStatusMailAi({ db, orderId, mailId, infer }), 'processing')
    await assert.rejects(processStatusMailAi({ db, orderId, mailId, infer, retry: true }), { code: 'aborted' })
    assert.equal(calls, 1)
    finish()
    assert.equal(await first, 'no_change')
    assert.equal((await mailRef.get()).get('aiProcessing'), undefined)
    await mailRef.update({ aiProcessing: { token: 'crashed-worker', expiresAt: Timestamp.fromMillis(0) } })
    assert.equal(await processStatusMailAi({ db, orderId, mailId, infer, retry: true }), 'no_change')
    assert.equal(calls, 2)
    assert.equal(await processStatusMailAi({ db, orderId, mailId, infer: async () => { throw new Error('synthetic-provider-failure') }, retry: true }), 'error')
    assert.equal((await mailRef.get()).get('aiProcessing'), undefined)
    assert.equal(await processStatusMailAi({ db, orderId, mailId, infer, retry: true }), 'no_change')
    assert.equal(calls, 3)
  } finally {
    await db.terminate()
    await deleteApp(app)
  }
})

test('post-claim read/apply failures release only the owned lease and an acknowledged commit remains successful', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const app = initializeApp({ projectId: 'demo-drehpunkt-ai-failures' }, `ai-failures-${Date.now()}`)
  const db = getFirestore(app)
  try {
    for (const mode of ['tracking-read', 'hours-read', 'apply', 'commit-ack']) await t.test(mode, async () => {
      const orderId = `${mode}-${Date.now()}`
      const mailId = 'synthetic-mail'
      const mailRef = db.doc(`transportOrders/${orderId}/receivedMails/${mailId}`)
      await db.doc(`transportOrders/${orderId}`).set({ imported: {} })
      await mailRef.set({ source: 'powerAutomate', mailbox: 'status@brennpunkt-logistik.de', transportOrderId: orderId, receivedAt: Timestamp.now(), bodyText: 'Keine neue Statusangabe.', ai: { status: 'pending' } })
      let transactions = 0
      let failedRead = false
      const failure = Object.assign(new Error(`synthetic-${mode}`), { code: 'unavailable' })
      const faulty = {
        doc(path) {
          const ref = db.doc(path)
          if ((mode === 'tracking-read' && path === `transportOrderTrackings/${orderId}`) || (mode === 'hours-read' && path === 'systemSettings/shipmentTrackingOperatingHours')) {
            const original = ref.get.bind(ref)
            ref.get = async () => { if (!failedRead) { failedRead = true; throw failure }; return original() }
          }
          return ref
        },
        collection: db.collection.bind(db),
        async runTransaction(operation) {
          transactions += 1
          if (mode === 'apply' && transactions === 2) throw failure
          const result = await db.runTransaction(operation)
          if (mode === 'commit-ack' && transactions === 2) throw failure
          return result
        },
      }
      let inferenceCalls = 0
      const infer = async () => { inferenceCalls += 1; return { isStatusUpdate: false, updates: [] } }
      const expected = mode === 'commit-ack' ? 'no_change' : 'error'
      assert.equal(await processStatusMailAi({ db: faulty, orderId, mailId, infer }), expected)
      const snapshot = await mailRef.get()
      assert.equal(snapshot.get('aiProcessing'), undefined)
      assert.equal(snapshot.get('ai.status'), expected)
      assert.equal(inferenceCalls, mode === 'tracking-read' ? 0 : 1)
      if (expected === 'error') assert.equal(await processStatusMailAi({ db, orderId, mailId, infer, retry: true }), 'no_change')
    })
    await t.test('deleted order and a parallel manual review release the owned lease without overwriting the review', async () => {
      for (const mode of ['deleted-order', 'manual-review', 'manual-review-failure']) {
        const orderId = `${mode}-${Date.now()}`
        const orderRef = db.doc(`transportOrders/${orderId}`)
        const mailRef = orderRef.collection('receivedMails').doc('synthetic-mail')
        await orderRef.set({ imported: {} })
        await mailRef.set({ source: 'powerAutomate', mailbox: 'status@brennpunkt-logistik.de', transportOrderId: orderId, receivedAt: Timestamp.now(), bodyText: 'Keine neue Statusangabe.', ai: { status: 'pending' } })
        const infer = async () => {
          if (mode === 'deleted-order') await orderRef.delete()
          else await mailRef.update({ 'ai.status': 'reviewed' })
          if (mode === 'manual-review-failure') throw new Error('synthetic-inference-error-after-manual-review')
          return { isStatusUpdate: false, updates: [] }
        }
        assert.equal(await processStatusMailAi({ db, orderId, mailId: mailRef.id, infer }), mode === 'deleted-order' ? 'missing' : 'reviewed')
        const snapshot = await mailRef.get()
        assert.equal(snapshot.get('aiProcessing'), undefined)
        if (mode.startsWith('manual-review')) {
          assert.equal(snapshot.get('ai.status'), 'reviewed')
          assert.equal(await processStatusMailAi({ db, orderId, mailId: mailRef.id, infer: () => { throw new Error('reviewed messages must not be inferred again') } }), 'reviewed')
        }
      }
    })
  } finally {
    await db.terminate()
    await deleteApp(app)
  }
})
