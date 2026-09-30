import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { approveCarrierImportRowHandler, claimCarrierImportRowHandler, listCarrierImportQueueHandler, processCarrierImportHandler } from './carrierImports.js'
import { loadMergeReversal, mergeCarrierImportPartnersHandler, performPartnerMergeReversal } from './partnerMerges.js'
import { mergeComparison } from '../src/lib/partnerMergeDecisions.js'
import { parseCarrierCsv } from '../src/lib/carrierCsv.js'

test('Firestore emulator: creditor import, durable review, approval, re-import and access control', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  initializeApp({ projectId: 'demo-drehpunkt-carrier-import' })
  const db = getFirestore()
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const uid = `importer-${nonce}`
  await db.doc(`users/${uid}`).set({ active: true, permissions: { dataImports: 'edit', masterData: 'edit' }, firstName: 'Test', lastName: 'Importeur' })
  await db.doc(`users/viewer-${nonce}`).set({ active: true, permissions: { dataImports: 'edit', masterData: 'view' } })
  const row = { creditorNumber: `7${nonce}`, companyName: 'Spedition A', data: { linkedDebtorNumber: '', street: 'Straße 1', postalCode: '10115', city: 'Berlin', country: 'DE', vatId: 'DE123', contacts: [{ id: 'contact-1', name: 'Anna', email: 'anna@example.test' }], paymentTermsOriginal: '45 Tage Netto', paymentTermDays: '45 Tage Netto', iban: 'DE123', bic: 'TESTDEFF', ibanVerifiedAt: '21.09.2026', dycosCreatedAt: '01.01.2020' } }
  const request = (data, userId = uid) => ({ auth: { uid: userId }, data })
  await assert.rejects(processCarrierImportHandler(request({ fileName: 'UTN.csv', rows: [row] }, `viewer-${nonce}`)), /Berechtigung|Bearbeitungsrechte/i)
  const first = await processCarrierImportHandler(request({ fileName: 'UTN.csv', rows: [row] }))
  assert.equal(first.counts.automaticallyAccepted, 1)
  const partnerId = first.accepted[0].carrierId
  assert.equal((await db.collection('businessPartners').doc(partnerId).get()).get('creditorNumber'), row.creditorNumber)
  assert.equal((await db.collection('businessPartners').doc(partnerId).get()).get('paymentTermDays'), '45 Tage Netto')
  const second = await processCarrierImportHandler(request({ fileName: 'UTN.csv', rows: [row] }))
  assert.equal(second.accepted[0].carrierId, partnerId)
  const changed = { ...row, companyName: 'Spedition B' }
  const third = await processCarrierImportHandler(request({ fileName: 'Neu.csv', rows: [changed] }))
  assert.equal(third.counts.open, 1)
  const fourth = await processCarrierImportHandler(request({ fileName: 'Noch neuer.csv', rows: [{ ...changed, companyName: 'Spedition C' }] }))
  const queue = await listCarrierImportQueueHandler(request({ runId: fourth.runId }))
  const matching = queue.open.filter((item) => item.creditorNumber === row.creditorNumber)
  assert.equal(matching.length, 1)
  assert.equal(matching[0].fileName, 'Noch neuer.csv')
  assert.equal((await db.collection('businessPartners').doc(partnerId).get()).get('companyName'), 'Spedition A')
  await assert.rejects(claimCarrierImportRowHandler(request({ runId: fourth.runId, rowId: matching[0].id }, `unprivileged-${nonce}`)), /permission|freigegeben/i)
  const claimed = await claimCarrierImportRowHandler(request({ runId: fourth.runId, rowId: matching[0].id }))
  assert.equal(claimed.row.comparisons[0].current, 'Spedition A')
  const approved = await approveCarrierImportRowHandler(request({ runId: fourth.runId, rowId: matching[0].id, approvedValues: { companyName: 'Spedition C' } }))
  assert.equal(approved.row.carrierId, partnerId)
  const after = await listCarrierImportQueueHandler(request({ runId: fourth.runId }))
  assert.equal(after.open.filter((item) => item.creditorNumber === row.creditorNumber).length, 0)
  assert.equal(after.currentAccepted.find((item) => item.id === matching[0].id).approval.type, 'reviewed')
  assert.equal((await db.collection('businessPartners').doc(partnerId).get()).get('companyName'), 'Spedition C')
  await assert.rejects(approveCarrierImportRowHandler(request({ runId: fourth.runId, rowId: matching[0].id, approvedValues: {} })), /bereits bearbeitet/i)
})

test('Firestore emulator: separate exact creditor and debtor partners enter merge review and re-import resolves to the surviving partner', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = getFirestore()
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const uid = `merger-${nonce}`
  const creditor = `cred-${nonce}`; const debtor = `debt-${nonce}`
  await db.doc(`users/${uid}`).set({ active: true, role: 'staff', permissions: { dataImports: 'edit', masterData: 'edit', partnerMerges: 'edit' } })
  const debtorRef = db.collection('businessPartners').doc(`debtor-${nonce}`)
  await debtorRef.set({ id: debtorRef.id, companyName: 'Bestehender Kunde', debtorNumber: debtor, creditorNumber: '', status: 'active', dycosReferences: { debtorNumbers: [debtor], creditorNumbers: [] } })
  const request = (data) => ({ auth: { uid }, data })
  const base = { creditorNumber: creditor, companyName: 'Neue Spedition', data: { linkedDebtorNumber: '', contacts: [], paymentTermDays: null } }
  const first = await processCarrierImportHandler(request({ fileName: 'UTN.csv', rows: [base] }))
  const carrierId = first.accepted[0].carrierId
  const second = await processCarrierImportHandler(request({ fileName: 'UTN.csv', rows: [{ ...base, data: { ...base.data, linkedDebtorNumber: debtor, street: 'Neue Importstraße 2' } }] }))
  assert.equal(second.counts.open, 1)
  const queue = await listCarrierImportQueueHandler(request({ runId: second.runId }))
  const open = queue.open.find((row) => row.creditorNumber === creditor)
  assert.equal(open.kind, 'merge')
  const claimed = await claimCarrierImportRowHandler(request({ runId: second.runId, rowId: open.id }))
  const comparison = mergeComparison(claimed.row.merge, carrierId)
  const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, choice]) => [key, choice.resolution ? choice : { ...choice, resolution: 'target' }]))
  const merged = await mergeCarrierImportPartnersHandler(request({ runId: second.runId, rowId: open.id, targetPartnerId: carrierId, decisions, partnerVersions: Object.fromEntries(claimed.row.merge.partners.map((item) => [item.id, item.version])) }))
  assert.equal(merged.row.carrierId, carrierId)
  assert.equal((await debtorRef.get()).get('mergedIntoPartnerId'), carrierId)
  const target = await db.collection('businessPartners').doc(carrierId).get()
  assert.equal(target.get('debtorNumber'), debtor)
  assert.equal(target.get('address.street'), 'Neue Importstraße 2')
  const repeat = await processCarrierImportHandler(request({ fileName: 'UTN.csv', rows: [{ ...base, data: { ...base.data, linkedDebtorNumber: debtor } }] }))
  assert.equal(repeat.counts.open, 0)
  assert.equal(repeat.accepted[0].carrierId, carrierId)
  const mergeId = (await debtorRef.get()).get('mergedByMergeId')
  const reversal = await loadMergeReversal(db, mergeId, carrierId)
  assert.equal(reversal.canSeparate, true)
  await performPartnerMergeReversal({ db, mergeId, targetPartnerId: carrierId, fingerprint: reversal.fingerprint, actor: { userId: uid, name: 'Test' } })
  assert.equal((await debtorRef.get()).get('mergedIntoPartnerId'), undefined)
  const directAfterSplit = await processCarrierImportHandler(request({ fileName: 'UTN ohne Gegen-ID.csv', rows: [base] }))
  assert.equal(directAfterSplit.counts.open, 0)
  assert.equal(directAfterSplit.accepted[0].carrierId, carrierId)
  const afterSplit = await processCarrierImportHandler(request({ fileName: 'UTN nach Trennung.csv', rows: [{ ...base, data: { ...base.data, linkedDebtorNumber: debtor } }] }))
  assert.equal(afterSplit.counts.open, 1)
  const splitQueue = await listCarrierImportQueueHandler(request({ runId: afterSplit.runId }))
  assert.equal(splitQueue.open.find((item) => item.creditorNumber === creditor)?.kind, 'merge')
  assert.equal((await db.collection('businessPartners').where('creditorNumber', '==', creditor).get()).size, 1)
  assert.equal((await db.collection('businessPartners').where('debtorNumber', '==', debtor).get()).size, 1)
})

test('Firestore emulator: real DyCoS carrier CSV persists contacts, deduplicated Infos emails and accounting data without name/VAT fallback', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = getFirestore(); const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const uid = `csv-carrier-${nonce}`; const creditor = `C-${nonce}`
  await db.doc(`users/${uid}`).set({ active: true, permissions: { dataImports: 'edit', masterData: 'edit' } })
  const existingRef = db.collection('businessPartners').doc(`same-name-${nonce}`)
  await existingRef.set({ id: existingRef.id, companyName: `Spedition ${nonce}`, creditorNumber: `OLD-${nonce}`, debtorNumber: '', status: 'active', companyData: { vatId: 'DE123' }, address: { street: 'Hafenstraße', city: 'Berlin' }, contact: { email: 'a@example.test' }, dycosReferences: { creditorNumbers: [`OLD-${nonce}`], debtorNumbers: [] } })
  const csv = `Unternehmer;UTN/Lief.Nummer;Strasse;Ort;USTID;Ansprechpartner1;Mail Anspr.1;Ansprechpartner2;Mail Anspr.2;Ansprechpartner3;Mail Anspr.3;Infos;Internet;Zahlungsbedingung-1;IBAN;BIC;IBAN geprüft Datum;Erfasst am;TimoCom-Nr\nSpedition ${nonce};${creditor};Hafenstraße;Berlin;DE123;Anna;A@example.test;Bela;b@example.test;Carla;c@example.test;A@example.test extra@example.test;www.example.test;45 Tage Netto;DE123456;TESTDEFF;21.09.2026;01.01.2020;4455`
  const parsed = parseCarrierCsv(csv)
  assert.deepEqual(parsed.missingHeaders, [])
  const imported = await processCarrierImportHandler({ auth: { uid }, data: { fileName: 'UTN.csv', rows: parsed.rows } })
  assert.equal(imported.counts.automaticallyAccepted, 1)
  const partnerId = imported.accepted[0].carrierId
  assert.notEqual(partnerId, existingRef.id)
  const partner = (await db.collection('businessPartners').doc(partnerId).get()).data()
  assert.deepEqual(partner.contacts.map((item) => item.email).sort(), ['a@example.test', 'b@example.test', 'c@example.test', 'extra@example.test'])
  assert.equal(partner.paymentTermDays, '45 Tage Netto')
  assert.equal(partner.bankData.iban, 'DE123456')
  assert.equal(partner.bankData.bic, 'TESTDEFF')
  assert.equal(partner.bankData.ibanVerifiedAt, '21.09.2026')
  assert.equal(partner.timocomNumber, '4455')
  assert.equal(partner.dycosCreatedAt, '01.01.2020')
  assert.equal(partner.contact.website, 'www.example.test')
  const repeat = await processCarrierImportHandler({ auth: { uid }, data: { fileName: 'UTN erneut.csv', rows: parsed.rows } })
  assert.equal(repeat.accepted[0].carrierId, partnerId)
  assert.equal((await db.collection('businessPartners').doc(partnerId).get()).get('contacts').length, 4)
  const debtor = `D-${nonce}`
  const debtorRef = db.collection('businessPartners').doc(`debtor-${nonce}`)
  await debtorRef.set({ id: debtorRef.id, companyName: 'Gegen-ID Partner', debtorNumber: debtor, creditorNumber: '', status: 'active', dycosReferences: { debtorNumbers: [debtor], creditorNumbers: [] } })
  const viaDebtor = await processCarrierImportHandler({ auth: { uid }, data: { fileName: 'Gegen-ID.csv', rows: [{ creditorNumber: `NEW-${nonce}`, companyName: 'Gegen-ID Partner', data: { linkedDebtorNumber: debtor, contacts: [] } }] } })
  assert.equal(viaDebtor.accepted[0].carrierId, debtorRef.id)
  assert.equal((await debtorRef.get()).get('creditorNumber'), `NEW-${nonce}`)
})

test('Firestore emulator: CSV conflicts remaining after merge stay reviewable and are not silently discarded', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = getFirestore(); const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const uid = `merge-reviewer-${nonce}`; const creditor = `c-${nonce}`; const debtor = `d-${nonce}`
  await db.doc(`users/${uid}`).set({ active: true, permissions: { dataImports: 'edit', masterData: 'edit', partnerMerges: 'edit' } })
  const creditorRef = db.collection('businessPartners').doc(`creditor-${nonce}`)
  const debtorRef = db.collection('businessPartners').doc(`debtor-${nonce}`)
  await Promise.all([
    creditorRef.set({ id: creditorRef.id, companyName: 'Zielname', creditorNumber: creditor, debtorNumber: '', status: 'active', dycosReferences: { creditorNumbers: [creditor], debtorNumbers: [] } }),
    debtorRef.set({ id: debtorRef.id, companyName: 'Quellname', debtorNumber: debtor, creditorNumber: '', status: 'active', dycosReferences: { debtorNumbers: [debtor], creditorNumbers: [] } }),
  ])
  const request = (data) => ({ auth: { uid }, data })
  const imported = await processCarrierImportHandler(request({ fileName: 'UTN.csv', rows: [{ creditorNumber: creditor, companyName: 'CSV-Firmenname', data: { linkedDebtorNumber: debtor, contacts: [], paymentTermDays: null } }] }))
  const open = (await listCarrierImportQueueHandler(request({ runId: imported.runId }))).open.find((row) => row.creditorNumber === creditor)
  const claimed = await claimCarrierImportRowHandler(request({ runId: imported.runId, rowId: open.id }))
  const comparison = mergeComparison(claimed.row.merge, creditorRef.id)
  const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, value]) => [key, value.resolution ? value : { ...value, resolution: 'target' }]))
  const merged = await mergeCarrierImportPartnersHandler(request({ runId: imported.runId, rowId: open.id, targetPartnerId: creditorRef.id, decisions, partnerVersions: Object.fromEntries(claimed.row.merge.partners.map((item) => [item.id, item.version])) }))
  assert.equal(merged.row.state, 'open')
  const followup = (await listCarrierImportQueueHandler(request({ runId: imported.runId }))).open.find((row) => row.id === open.id)
  assert.equal(followup.kind, 'review')
  assert.equal(followup.comparisons.find((item) => item.path === 'companyName').incomingValue, 'CSV-Firmenname')
  await claimCarrierImportRowHandler(request({ runId: imported.runId, rowId: open.id }))
  await approveCarrierImportRowHandler(request({ runId: imported.runId, rowId: open.id, approvedValues: { companyName: 'CSV-Firmenname' } }))
  assert.equal((await creditorRef.get()).get('companyName'), 'CSV-Firmenname')
  assert.equal((await debtorRef.get()).get('mergedIntoPartnerId'), creditorRef.id)
})
