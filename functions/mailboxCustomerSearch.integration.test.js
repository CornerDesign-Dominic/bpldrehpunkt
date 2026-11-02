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

test('emulator: unique matches import canonical customer data once; manual selection imports only its chosen candidate', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-dycos'
  assert.ok(projectId.startsWith('demo-'))
  const { assignMailboxOrderCustomer } = await import('./mailboxCustomerSearch.js')
  const { mailboxCustomerSearchKey } = await import('./shared/mailboxCustomerSearch.js')
  const { mailboxOrderCustomerIdentity } = await import('./shared/mailboxOrderCustomerIdentity.js')
  const suffix = randomUUID(), app = initializeApp({ projectId }, suffix), db = getFirestore(app), uid = `assign-${suffix}`, connectionId = `connection-${suffix}`
  const previewId = randomUUID(), previewRef = db.doc(`mailboxOrderPreviews/${previewId}`), connectionRef = db.doc(`mailboxConnections/${connectionId}`), userRef = db.doc(`users/${uid}`)
  const number = String(10000000 + Math.floor(Math.random() * 80000000)), sourceId = String(Number(number) + 100000000)
  const order = { customerName: 'Quelle GmbH', customerVatId: 'DE123456789', customerPostalCode: '42103', customerCity: 'Wuppertal' }
  const profile = { active: true, role: 'user', firstName: 'Import', permissions: { mailboxes: 'edit', transportOrders: 'edit', masterData: 'edit' } }
  const context = { uid, profile, connectionId, connection: { graphUserId: 'graph' } }, now = Date.now(), data = { previewId, messageId: 'mail', order }
  let result, fetches = 0
  const source = request => ({ schemaVersion: 1, typ: 'kunde', nummer: request.nummer, partner: { ID: Number(sourceId), Debitorennummer: Number(number), Firma: 'Quelle GmbH', Strasse: 'Beispielweg 3', PLZ: '42103', Ort: 'Wuppertal', Land: 'D', USTID: 'DE123456789', Zahlungsbedingung: 1, EMailZentrale: 'info@example.test', PortalPasswort: 'never-import' }, zahlungsbedingung: { ID: 1, Bezeichnung: '30 Tage netto' } })
  const fetchPartner = async request => { fetches++; return source(request) }
  try {
    await Promise.all([userRef.set(profile), connectionRef.set({ ownerId: uid, status: 'connected' }), previewRef.set({ ownerId: uid, connectionId, graphUserId: 'graph', messageId: 'mail', expiresAt: now + 600000 })])
    result = await searchMailboxOrderCustomers({ db, context, data, now, fetchMatches: async () => ({ schemaVersion: 1, modus: 'kundensuche', more: false, treffer: [{ ID: Number(sourceId), Debitorennummer: Number(number), Firma: 'Quelle GmbH', USTID: 'DE123456789', PLZ: '42103', Ort: 'Wuppertal' }] }), assignCustomer: args => assignMailboxOrderCustomer({ ...args, fetchPartner }) })
    assert.equal(result.assignmentError, undefined)
    assert.ok(result.assignment?.partnerId)
    const partnerRef = db.doc(`businessPartners/${result.assignment.partnerId}`)
    const saved = (await partnerRef.get()).data()
    assert.equal(saved.companyName, 'Quelle GmbH'); assert.equal(saved.address.street, 'Beispielweg 3'); assert.equal(saved.paymentTermDays, '30 Tage netto')
    assert.equal(saved.PortalPasswort, undefined); assert.equal(saved.contact.email, 'info@example.test')
    assert.equal(mailboxOrderCustomerIdentity(saved, number)?.sourceId, sourceId)
    assert.equal((await previewRef.get()).get('customerSearch.assignment.partnerId'), result.assignment.partnerId)
    assert.equal((await partnerRef.collection('history').get()).size, 1)
    await partnerRef.update({ companyName: 'Manuell gepflegt', customField: 'Unverändert' })
    const selectedData = { ...data, customerSearchId: result.searchId, customerSourceId: sourceId }
    const repeated = await assignMailboxOrderCustomer({ db, context, data: selectedData, fetchPartner, now: now + 1 })
    assert.equal(repeated.partnerId, result.assignment.partnerId); assert.equal(fetches, 1)
    assert.equal((await partnerRef.get()).get('companyName'), 'Manuell gepflegt'); assert.equal((await partnerRef.get()).get('customField'), 'Unverändert')
    assert.equal((await partnerRef.collection('history').get()).size, 1)
    await userRef.update({ 'permissions.masterData': 'view' })
    const readOnly = await assignMailboxOrderCustomer({ db, context, data: selectedData, fetchPartner, now: now + 2 })
    assert.equal(readOnly.partnerId, repeated.partnerId); assert.equal(fetches, 1)
    const otherNumber = String(Number(number) + 1), otherId = String(Number(sourceId) + 1)
    await previewRef.update({ customerSearch: { searchId: 'multiple-proof', status: 'found', matches: [{ sourceId, number, name: 'Quelle GmbH' }, { sourceId: otherId, number: otherNumber, name: 'Andere Firma' }], criteriaKey: mailboxCustomerSearchKey(order), expiresAt: now + 600000 } })
    await assert.rejects(assignMailboxOrderCustomer({ db, context, data: { ...data, customerSearchId: 'multiple-proof', customerSourceId: otherId }, fetchPartner, now: now + 3 }), { code: 'permission-denied' })
    await assert.rejects(assignMailboxOrderCustomer({ db, context, data: { ...data, customerSearchId: 'multiple-proof', customerSourceId: '999' }, fetchPartner, now: now + 3 }), { code: 'failed-precondition' })
    await userRef.update({ 'permissions.masterData': 'edit' })
    let chosenNumber = null
    const selected = await assignMailboxOrderCustomer({ db, context, data: { ...data, customerSearchId: 'multiple-proof', customerSourceId: otherId }, now: now + 4, fetchPartner: async request => { chosenNumber = request.nummer; return { schemaVersion: 1, typ: 'kunde', nummer: request.nummer, partner: { ID: Number(otherId), Debitorennummer: Number(otherNumber), Firma: 'Andere Firma' }, zahlungsbedingung: null } } })
    assert.equal(chosenNumber, otherNumber); assert.notEqual(selected.partnerId, result.assignment.partnerId)
    assert.equal((await db.doc(`businessPartners/${selected.partnerId}`).get()).get('companyName'), 'Andere Firma')
    await db.recursiveDelete(db.doc(`businessPartners/${selected.partnerId}`))
    await db.recursiveDelete(partnerRef)
  } finally {
    await Promise.all([previewRef.delete(), connectionRef.delete(), userRef.delete(), db.doc(`mailboxOrderQuotas/customer-search-${uid}`).delete(), db.doc(`dycosImportQuotas/${uid}`).delete()]); await deleteApp(app)
  }
})

test('emulator: changed source identity, tax ID or revoked preview prevents customer creation during import', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-dycos'; assert.ok(projectId.startsWith('demo-'))
  const { assignMailboxOrderCustomer } = await import('./mailboxCustomerSearch.js')
  const { mailboxCustomerSearchKey } = await import('./shared/mailboxCustomerSearch.js')
  const { importPartnerId } = await import('./dycosPartnerPayloads.js')
  const suffix = randomUUID(), app = initializeApp({ projectId }, suffix), db = getFirestore(app), uid = `guards-${suffix}`, connectionId = `connection-${suffix}`
  const userRef = db.doc(`users/${uid}`), connectionRef = db.doc(`mailboxConnections/${connectionId}`), now = Date.now()
  const profile = { active: true, role: 'user', permissions: { mailboxes: 'edit', transportOrders: 'edit', masterData: 'edit' } }
  const context = { uid, profile, connectionId, connection: { graphUserId: 'graph' } }
  await userRef.set(profile); await connectionRef.set({ ownerId: uid, status: 'connected' })
  try {
    for (const mode of ['source-id', 'vat-id', 'discard', 'permission']) {
      await userRef.set(profile)
      const previewId = randomUUID(), ref = db.doc(`mailboxOrderPreviews/${previewId}`), number = String(10000000 + Math.floor(Math.random() * 80000000)), sourceId = String(Number(number) + 100000000), order = { customerVatId: 'DE123456789' }
      const data = { previewId, messageId: 'mail', order, customerSearchId: 'proof', customerSourceId: sourceId }
      await ref.set({ ownerId: uid, connectionId, graphUserId: 'graph', messageId: 'mail', expiresAt: now + 600000, actionSlotPath: `mailboxActionScopes/test-${suffix}/actions/${previewId}`, actionJobId: 'job', customerSearch: { searchId: 'proof', status: 'found', matches: [{ sourceId, number, name: 'Test' }], criteriaKey: mailboxCustomerSearchKey(order), expiresAt: now + 600000 } })
      const actionRef = db.doc(`mailboxActionScopes/test-${suffix}/actions/${previewId}`); await actionRef.set({ jobId: 'job', state: 'review' })
      await assert.rejects(assignMailboxOrderCustomer({ db, context, data, now, fetchPartner: async () => {
        if (mode === 'discard') await actionRef.update({ state: 'discarded' })
        if (mode === 'permission') await userRef.update({ 'permissions.masterData': 'view' })
        return { schemaVersion: 1, typ: 'kunde', nummer: number, partner: { ID: Number(sourceId) + (mode === 'source-id' ? 1 : 0), Debitorennummer: Number(number), Firma: 'Test', USTID: mode === 'vat-id' ? 'DE999999999' : 'DE123456789' }, zahlungsbedingung: null }
      } }))
      assert.equal((await db.doc(`businessPartners/${importPartnerId('debtor', number)}`).get()).exists, false)
      await Promise.all([ref.delete(), actionRef.delete()])
    }
  } finally { await Promise.all([userRef.delete(), connectionRef.delete(), db.doc(`dycosImportQuotas/${uid}`).delete()]); await deleteApp(app) }
})
