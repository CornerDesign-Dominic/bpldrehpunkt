import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { searchMailboxOrderCustomers } from './mailboxCustomerSearch.js'

test('emulator: concurrent customer searches create one owner-bound result without duplicate source calls', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-mailbox-order'
  assert.ok(projectId.startsWith('demo-'))
  const suffix = randomUUID(), app = initializeApp({ projectId }, suffix), db = getFirestore(app), previewId = randomUUID(), now = Date.now()
  const uid = `customer-search-${suffix}`, connectionId = `connection-${suffix}`, previewRef = db.doc(`mailboxOrderPreviews/${previewId}`), connectionRef = db.doc(`mailboxConnections/${connectionId}`), quotaRef = db.doc(`mailboxOrderQuotas/customer-search-${uid}`)
  try {
    await previewRef.set({ ownerId: uid, connectionId, graphUserId: 'graph', messageId: 'mail', expiresAt: now + 600000 })
    await connectionRef.set({ ownerId: uid, status: 'connected' })
    const context = { uid, connectionId, connection: { graphUserId: 'graph' } }, data = { previewId, messageId: 'mail', order: { customerVatId: 'DE123456789' } }
    let calls = 0
    const fetchMatches = async () => { calls++; return { schemaVersion: 1, modus: 'kundensuche', treffer: [], more: false } }
    const results = await Promise.allSettled([searchMailboxOrderCustomers({ db, context, data, fetchMatches, now }), searchMailboxOrderCustomers({ db, context, data, fetchMatches, now })])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(calls, 1)
    const proof = (await previewRef.get()).get('customerSearch')
    assert.equal(proof.status, 'none'); assert.equal(proof.runningUntil, 0); assert.equal(proof.searchId, results.find(result => result.status === 'fulfilled').value.searchId)
    await assert.rejects(searchMailboxOrderCustomers({ db, context: { ...context, uid: 'foreign' }, data, fetchMatches, now: now + 20000 }), { code: 'permission-denied' })
    assert.equal(calls, 1)
  } finally { await Promise.all([previewRef.delete(), connectionRef.delete(), quotaRef.delete()]); await deleteApp(app) }
})
