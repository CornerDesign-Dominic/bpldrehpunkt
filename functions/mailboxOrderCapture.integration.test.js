import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import test from 'node:test'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { previewMailboxOrderCapture, exportMailboxOrderCapture, validateMailboxOrderPdf } from './mailboxOrderCapture.js'
import { emptyMailboxOrderStop, emptyMailboxOrderGoods } from './shared/mailboxOrder.js'

test('emulator: XML confirmation is atomic and concurrent replay preserves one private receipt', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-mailbox-order'
  assert.ok(projectId.startsWith('demo-'), 'Never run this integration test against a real Firebase project')
  const suffix = randomUUID()
  const app = initializeApp({ projectId }, `mailbox-order-${suffix}`)
  const db = getFirestore(app)
  const uid = `owner-${suffix}`; const connectionId = `connection-${suffix}`; const customerId = `customer-${suffix}`
  const context = { uid, connectionId, profile: { active: true, role: 'user', permissions: { mailboxes: 'edit', transportOrders: 'edit', masterData: 'view' } }, connection: { graphUserId: `graph-${suffix}`, tenantId: 'tenant' } }
  const mail = { id: `message-${suffix}`, subject: 'Originalauftrag', body: { contentType: 'text', content: 'Test GmbH' } }
  const file = { id: 'original', name: 'Auftrag.pdf', contentBytes: Buffer.from('%PDF-1.4\nsynthetic-test-input\n%%EOF').toString('base64') }
  try {
    await db.doc(`mailboxConnections/${connectionId}`).set({ ownerId: uid, status: 'connected', graphUserId: context.connection.graphUserId })
    await db.doc(`businessPartners/${customerId}`).set({ companyName: 'Test GmbH', debtorNumber: '10042', status: 'active', dycosIdentities: { 'debtor-10042': { kind: 'debtor', number: '10042', sourceId: '33' } } })
    const preview = await previewMailboxOrderCapture({ db, context, mail, files: [file], inspectPdfs: async files => files.map(value => ({ ...validateMailboxOrderPdf(value), pageCount: 1, pages: ['Test GmbH'] })), infer: async () => ({ order: { customerName: 'Test GmbH' }, provenance: [{ path: 'customerName', sourceId: 'mail', page: null, quote: 'Test GmbH' }], warnings: [], multipleOrders: false }) })
    const order = { customerReference: 'REF-42', customerName: 'Test GmbH', customerNumber: '10042', loadingDate: '2026-11-02', unloadingDate: '2026-11-03', price: 450, currency: 'EUR', stops: ['loading', 'unloading'].map((type, index) => ({ ...emptyMailboxOrderStop(type), company: 'Test GmbH', street: 'Musterweg 1', postalCode: '10115', city: 'Berlin', country: 'DE', date: index ? '2026-11-03' : '2026-11-02', goods: [{ ...emptyMailboxOrderGoods(), description: 'Ware', quantity: 1 }] })) }
    const data = { previewId: preview.previewId, messageId: mail.id, customerPartnerId: customerId, customerNumber: '10042', confirmed: true, operationId: randomUUID(), order, originalAttachmentId: file.id }
    const options = { db, context, data, originalPdf: file, companyCurrency: 'EUR' }
    const results = await Promise.all([exportMailboxOrderCapture(options), exportMailboxOrderCapture(options)])
    assert.equal(results[0].fileName, results[1].fileName)
    assert.equal(results[0].xmlBase64, results[1].xmlBase64)
    assert.equal(results.filter(result => result.alreadyExported === false).length, 1)
    const receipt = await db.doc(`mailboxOrderExports/${preview.previewId}`).get()
    assert.equal(receipt.get('customerId'), '33')
    assert.equal(receipt.get('originalPdfHash').length, 64)
    assert.equal(JSON.stringify(receipt.data()).includes(file.contentBytes), false)
    await assert.rejects(exportMailboxOrderCapture({ ...options, data: { ...data, order: { ...order, price: 999 } } }), { code: 'already-exists' })
    await db.doc(`mailboxConnections/${connectionId}`).update({ status: 'disconnecting' })
    await assert.rejects(exportMailboxOrderCapture(options), { code: 'permission-denied' })
  } finally {
    await db.terminate()
    await deleteApp(app)
  }
})
