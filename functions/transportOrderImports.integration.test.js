import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { processCarrierImportHandler } from './carrierImports.js'
import { performPartnerMerge } from './partnerMerges.js'
import { importTransportOrdersHandler, previewTransportOrderImportHandler } from './transportOrderImports.js'
import { mergeComparison } from '../src/lib/partnerMergeDecisions.js'
import { resolvePartnerInIndex } from '../src/lib/partnerCluster.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) initializeApp({ projectId: 'demo-drehpunkt-transport-campaign' })
const db = () => getFirestore()
const nonce = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const request = (uid, data) => ({ auth: { uid }, data })

function orderRow(externalNumber, debtorNumber, customerName, carrierName) {
  return { rowNumber: 2, externalNumber, imported: {
    externalNumber, customer: { debtorNumber, name: customerName, snapshot: { city: 'Hamburg', street: 'Hafenstraße 2' } },
    carrier: { originalName: carrierName, matchStatus: 'pending' },
    contacts: { customerStandardEmail: 'kunde@example.test', carrierStandardEmail: 'utn@example.test' },
    loading: { city: 'Hamburg', window: { from: '2026-09-23T07:00', until: '2026-09-23T12:00' } },
    unloading: { city: 'Berlin', window: { from: '2026-09-24T08:00', until: '2026-09-24T14:00' } },
  } }
}

async function user(uid, permissions = { dataImports: 'edit', masterData: 'edit', partnerMerges: 'edit' }) {
  await db().doc(`users/${uid}`).set({ active: true, permissions, firstName: 'TA', lastName: 'Tester' })
  return uid
}

test('Firestore emulator: TA links exact debtor and existing creditor partner, and re-import preserves manual data and tracking', { skip: !enabled }, async () => {
  const key = nonce(); const uid = await user(`ta-${key}`); const denied = await user(`ta-denied-${key}`, { dataImports: 'view' })
  const debtor = `D-${key}`; const creditor = `C-${key}`; const externalNumber = `TA-${key}`
  const customerRef = db().collection('businessPartners').doc(`a-customer-${key}`)
  const carrierRef = db().collection('businessPartners').doc(`z-carrier-${key}`)
  await Promise.all([
    customerRef.set({ id: customerRef.id, status: 'active', companyName: `Kunde ${key}`, debtorNumber: debtor, dycosReferences: { debtorNumbers: [debtor], creditorNumbers: [] }, address: { street: 'Eigene Straße', city: '' } }),
    carrierRef.set({ id: carrierRef.id, status: 'active', companyName: `Spedition ${key}`, creditorNumber: creditor, debtorNumber: '', dycosReferences: { creditorNumbers: [creditor], debtorNumbers: [] } }),
  ])
  const row = orderRow(externalNumber, debtor, `Kunde ${key}`, `Spedition ${key}`)
  await assert.rejects(previewTransportOrderImportHandler(request(denied, { rows: [{ externalNumber, customer: { debtorNumber: debtor }, carrier: { originalName: row.imported.carrier.originalName } }] })), /Berechtigung/i)
  const preview = await previewTransportOrderImportHandler(request(uid, { rows: [{ externalNumber, customer: { debtorNumber: debtor }, carrier: { originalName: row.imported.carrier.originalName } }] }))
  assert.equal(preview.customers[debtor].id, customerRef.id)
  assert.equal(preview.carriers[externalNumber].partner.id, carrierRef.id)
  const first = await importTransportOrdersHandler(request(uid, { fileName: 'TA.csv', rows: [row], carrierResolutions: [], rowErrors: [] }))
  assert.equal(first.counts.Neu, 1)
  const orderRef = db().doc(`transportOrders/dycos-${encodeURIComponent(externalNumber)}`)
  assert.equal((await orderRef.get()).get('imported.customer.partnerId'), customerRef.id)
  assert.equal((await orderRef.get()).get('imported.carrier.partnerId'), carrierRef.id)
  assert.equal((await carrierRef.get()).get('creditorNumber'), creditor)
  await orderRef.update({ manual: { note: 'Disposition geprüft' }, tracking: { status: 'Unterwegs' }, 'imported.customer.partnerName': 'Manuelle Anzeige' })
  const repeat = await importTransportOrdersHandler(request(uid, { fileName: 'TA erneut.csv', rows: [row], carrierResolutions: [], rowErrors: [] }))
  assert.equal(repeat.counts.Unverändert, 1)
  const order = (await orderRef.get()).data()
  assert.equal(order.manual.note, 'Disposition geprüft')
  assert.equal(order.tracking.status, 'Unterwegs')
  assert.equal(order.imported.customer.partnerId, customerRef.id)
  assert.equal(order.imported.carrier.partnerId, carrierRef.id)
  assert.equal((await customerRef.get()).get('address.street'), 'Eigene Straße')
  const [mergeTarget, mergeSource] = await Promise.all([carrierRef.get(), customerRef.get()])
  const comparison = mergeComparison({ partners: [{ id: carrierRef.id, ...mergeTarget.data() }, { id: customerRef.id, ...mergeSource.data() }] }, carrierRef.id)
  const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([field, choice]) => [field, choice.resolution ? choice : { ...choice, resolution: 'target' }]))
  await performPartnerMerge({ db: db(), targetId: carrierRef.id, sourceId: customerRef.id, partnerVersions: { [carrierRef.id]: mergeTarget.updateTime.toMillis(), [customerRef.id]: mergeSource.updateTime.toMillis() }, decisions, actor: { userId: uid, name: 'TA Tester' } })
  assert.equal((await orderRef.get()).get('imported.customer.partnerId'), customerRef.id)
  await importTransportOrdersHandler(request(uid, { fileName: 'TA nach Merge.csv', rows: [row], carrierResolutions: [], rowErrors: [] }))
  assert.equal((await orderRef.get()).get('imported.customer.partnerId'), customerRef.id, 'Re-Import bewahrt die ursprüngliche fachliche Verknüpfung')
  const partners = new Map((await db().collection('businessPartners').get()).docs.map((entry) => [entry.id, { id: entry.id, ...entry.data() }]))
  assert.equal(resolvePartnerInIndex(partners, customerRef.id).id, carrierRef.id)
})

test('Firestore emulator: ambiguous TA carrier needs an explicit candidate or new choice, including on re-import', { skip: !enabled }, async () => {
  const key = nonce(); const uid = await user(`candidate-${key}`)
  const debtor = `D-${key}`; const externalNumber = `TA-${key}`
  const candidateRef = db().collection('businessPartners').doc(`candidate-${key}`)
  await candidateRef.set({ id: candidateRef.id, status: 'active', companyName: `Baltic Transline ${key}`, creditorNumber: `C-${key}`, dycosReferences: { creditorNumbers: [`C-${key}`] }, address: { city: 'Kaunas' }, contact: { email: 'candidate@example.test' } })
  const row = orderRow(externalNumber, debtor, `Kunde ${key}`, `Baltic Transline Kaunas ${key}`)
  const preview = await previewTransportOrderImportHandler(request(uid, { rows: [{ externalNumber, customer: { debtorNumber: debtor }, carrier: { originalName: row.imported.carrier.originalName } }] }))
  assert.equal(preview.carriers[externalNumber].kind, 'candidates')
  assert.equal(preview.carriers[externalNumber].candidates[0].id, candidateRef.id)
  assert.equal(preview.carriers[externalNumber].candidates[0].address.city, 'Kaunas')
  await assert.rejects(importTransportOrdersHandler(request(uid, { fileName: 'TA.csv', rows: [row], carrierResolutions: [] })), /Unternehmerzuordnung.*Neuanlage/i)
  await assert.rejects(importTransportOrdersHandler(request(uid, { fileName: 'TA.csv', rows: [row], carrierResolutions: [{ externalNumber, partnerId: 'unrelated' }] })), /vorgeschlagenen Unternehmer/i)
  await importTransportOrdersHandler(request(uid, { fileName: 'TA.csv', rows: [row], carrierResolutions: [{ externalNumber, partnerId: candidateRef.id }] }))
  const orderRef = db().doc(`transportOrders/dycos-${encodeURIComponent(externalNumber)}`)
  assert.equal((await orderRef.get()).get('imported.carrier.partnerId'), candidateRef.id)
  await importTransportOrdersHandler(request(uid, { fileName: 'TA neu.csv', rows: [row], carrierResolutions: [{ externalNumber, createNew: true }] }))
  const newCarrierId = (await orderRef.get()).get('imported.carrier.partnerId')
  assert.notEqual(newCarrierId, candidateRef.id)
  assert.equal((await db().doc(`businessPartners/${newCarrierId}`).get()).get('creditorNumber'), '')
  assert.equal((await db().doc(`businessPartners/${newCarrierId}`).get()).get('taImportStatus.source'), 'dycosTransportOrder')
})

test('Firestore emulator: provisional TA carrier is later assigned to a creditor partner only by an explicit merge', { skip: !enabled }, async () => {
  const key = nonce(); const uid = await user(`provisional-${key}`)
  const debtor = `D-${key}`; const externalNumber = `TA-${key}`; const name = `Einmalige Spedition ${key}`
  const row = orderRow(externalNumber, debtor, `Kunde ${key}`, name)
  const first = await importTransportOrdersHandler(request(uid, { fileName: 'TA.csv', rows: [row], carrierResolutions: [] }))
  assert.equal(first.counts.Neu, 1)
  const orderRef = db().doc(`transportOrders/dycos-${encodeURIComponent(externalNumber)}`)
  const provisionalId = (await orderRef.get()).get('imported.carrier.partnerId')
  const creditorNumber = `C-${key}`
  const imported = await processCarrierImportHandler(request(uid, { fileName: 'UTN.csv', rows: [{ creditorNumber, companyName: name, data: { contacts: [] } }] }))
  const confirmedId = imported.accepted[0].carrierId
  assert.notEqual(confirmedId, provisionalId, 'Stammdatenimport darf den namenlosen Nummerntreffer nicht per Name herstellen')
  const provisionalRef = db().doc(`businessPartners/${provisionalId}`); const confirmedRef = db().doc(`businessPartners/${confirmedId}`)
  const [source, target] = await Promise.all([provisionalRef.get(), confirmedRef.get()])
  const comparison = mergeComparison({ partners: [{ id: confirmedId, ...target.data() }, { id: provisionalId, ...source.data() }] }, confirmedId)
  const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([field, choice]) => [field, choice.resolution ? choice : { ...choice, resolution: 'target' }]))
  await performPartnerMerge({ db: db(), targetId: confirmedId, sourceId: provisionalId, partnerVersions: { [confirmedId]: target.updateTime.toMillis(), [provisionalId]: source.updateTime.toMillis() }, decisions, actor: { userId: uid, name: 'TA Tester' } })
  assert.equal((await provisionalRef.get()).get('mergedIntoPartnerId'), confirmedId)
  assert.equal((await orderRef.get()).get('imported.carrier.partnerId'), provisionalId)
  assert.equal((await confirmedRef.get()).get('creditorNumber'), creditorNumber)
})
