import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp as adminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as adminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, terminate, updateDoc, writeBatch } from 'firebase/firestore'
import { applyMailboxRecord } from './mailboxRecords.js'
import { recordHash } from './mailboxRecordData.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
test('emulator: every created domain record remains readable and editable through the original Firestore rules', { skip: !enabled }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-mail-records'
  assert.ok(projectId.startsWith('demo-'), 'Never run against a real project')
  const uid = randomUUID(), connectionId = recordHash(uid), now = Date.UTC(2026, 9, 31)
  const profile = { active: true, email: 'emulator@example.com', firstName: 'Emulator', lastName: 'Tester', role: 'user', permissions: { mailboxes: 'edit', todos: 'edit', damages: 'edit', inkasso: 'edit', legalDisputes: 'edit', calendar: 'edit', masterData: 'view' } }
  const app = adminApp({ projectId }, uid), db = adminFirestore(app)
  const client = initializeApp({ projectId, apiKey: 'synthetic' }, `client-${uid}`), clientDb = getFirestore(client)
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  connectFirestoreEmulator(clientDb, host, Number(port), { mockUserToken: { sub: uid } })
  const connection = { ownerId: uid, status: 'connected', tenantId: 'tenant', graphUserId: 'graph' }
  const actor = { uid, profile, connectionId, connection, ref: db.doc(`mailboxConnections/${connectionId}`) }
  try {
    await db.doc(`users/${uid}`).set(profile); await actor.ref.set(connection)
    await db.doc(`businessPartners/record-partner-${uid}`).set({ companyName: 'Testunternehmen', debtorNumber: '1234' })
    const samples = {
      todo: { title: 'Testaufgabe', description: 'Aus Mail', dueDate: '2026-11-04' },
      damage: { damageDate: '2026-10-30', damageType: 'Bruchschaden', damageAmount: '10', description: 'Testschaden' },
      collection: { description: 'Inkasso aus Mail', claimAmount: '119' },
      court: { transportReference: '261000764', counterparty: 'Testunternehmen', description: 'Gericht aus Mail' },
      calendar: { title: 'Rücksprache', description: 'Aus Mail', startDate: '2026-11-04', endDate: '2026-11-04', allDay: 'true' },
    }
    for (const [kind, values] of Object.entries(samples)) {
      const previewId = recordHash(`${uid}|${kind}`).slice(0, 48)
      const slotPath = `mailboxActionScopes/${recordHash(`${uid}|${connectionId}`)}/actions/${recordHash(`mail|${kind}`)}`
      await db.doc(`mailboxRecordPreviews/${previewId}`).set({ ownerId: uid, connectionId, kind, messageKey: recordHash('tenant|graph|mail'), expiresAt: Number.MAX_SAFE_INTEGER, actionJobId: 'job', actionSlotPath: slotPath, evidence: {}, warnings: [], summary: 'Test', source: { subject: 'Testmail', webLink: '', files: [] } })
      await db.doc(slotPath).set({ jobId: 'job', state: 'review', kind, result: { previewId } })
      const data = { previewId, kind, messageId: 'mail', mode: 'create', selectedFields: [], values, note: 'Bestätigt', calendarId: `personal-${uid}`, partnerId: `record-partner-${uid}`, partnerRole: 'customer' }
      if (kind === 'collection') data.invoices = [{ invoiceNumber: 'R-42', netAmount: '0.10', vatAmount: '0.20' }]
      if (['damage', 'collection', 'court'].includes(kind)) values.deadlineDate = '2026-11-06'
      const [first, repeated] = await Promise.all([applyMailboxRecord({ db, actor, data, now }), applyMailboxRecord({ db, actor, data, now })])
      assert.equal(first.targetPath, repeated.targetPath)
      assert.ok((await getDoc(doc(clientDb, first.targetPath))).exists(), `${kind}: native record is readable`)
      await updateDoc(doc(clientDb, first.targetPath), { description: 'In normaler Maske bearbeitet', updatedAt: serverTimestamp(), ...(['damage', 'collection', 'court'].includes(kind) ? { updatedBy: uid, updatedByName: 'Emulator Tester' } : {}) })
      assert.equal((await getDoc(doc(clientDb, first.targetPath))).data().description, 'In normaler Maske bearbeitet', `${kind}: native record remains editable`)
      if (kind === 'collection') {
        const invoices = await db.collection(`${first.targetPath}/invoices`).get()
        assert.equal(invoices.size, 1)
        const batch = writeBatch(clientDb)
        batch.update(doc(clientDb, first.targetPath), { updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: 'Emulator Tester' })
        batch.update(doc(clientDb, invoices.docs[0].ref.path), { invoiceNumber: 'R-42-korrigiert' })
        await batch.commit()
        assert.equal((await getDoc(doc(clientDb, invoices.docs[0].ref.path))).data().invoiceNumber, 'R-42-korrigiert')
      }
      if (['damage', 'collection', 'court'].includes(kind)) {
        const deadlinePath = `${first.targetPath}/deadlines/${previewId}`
        assert.ok((await getDoc(doc(clientDb, deadlinePath))).exists())
        const batch = writeBatch(clientDb)
        batch.update(doc(clientDb, first.targetPath), { updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: 'Emulator Tester' })
        batch.update(doc(clientDb, deadlinePath), { note: 'In normaler Fristenmaske bearbeitet', updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: 'Emulator Tester' })
        await batch.commit()
      }
      await assert.rejects(getDoc(doc(clientDb, `mailboxRecordPreviews/${previewId}`)), { code: 'permission-denied' })
    }
  } finally { await terminate(clientDb); await deleteApp(client); await db.terminate(); await deleteAdminApp(app) }
})
