import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { parseCustomerCsv } from '../src/lib/customerCsv.js'
import { parseCarrierCsv } from '../src/lib/carrierCsv.js'
import { businessPartnerDetailPath } from '../src/lib/businessPartnerLinks.js'
import { PARTNER_REFERENCE_CATALOG, assertFlatPartnerCluster, indexPartnerClusters, partnerNumbers, resolvePartnerInIndex } from './partnerCluster.js'
import { approveCustomerImportRowHandler, claimCustomerImportRowHandler, listCustomerImportQueueHandler, processCustomerImportHandler } from './customerImports.js'
import { approveCarrierImportRowHandler, claimCarrierImportRowHandler, listCarrierImportQueueHandler, processCarrierImportHandler } from './carrierImports.js'
import { importTransportOrdersHandler } from './transportOrderImports.js'
import { mergeManualPartnersHandler, prepareManualPartnerMergeHandler, previewPartnerMergeReversalHandler, separatePartnerMergeHandler } from './partnerMerges.js'
import { mergeComparison } from '../src/lib/partnerMergeDecisions.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) initializeApp({ projectId: 'demo-drehpunkt-multi-day' })
const database = () => getFirestore()
const request = (uid, data) => ({ auth: { uid }, data })
const valueAt = (record, path) => path.split('.').reduce((value, part) => value?.[part], record)
const actor = { userId: 'multi-day-editor', name: 'Mehrtagestest' }

function customerCsv(count = 14) {
  const lines = ['Kunden- nummer;Firma;Strasse;Ort;USTID;Mail1;Zahlungsbedingung']
  for (let index = 0; index < count; index += 1) lines.push(`${10000 + index};${index < 2 ? 'Gleicher Firmenname' : `Kunde ${index}`};${index === 6 ? '' : `Kundenstraße ${index}`};Hamburg;${index < 2 ? 'DE-GLEICH' : `DE-KU-${index}`};kunde${index}@example.test;30 Tage Netto`)
  return parseCustomerCsv(lines.join('\n')).rows
}

function carrierCsv(count = 14) {
  const lines = ['Unternehmer;UTN/Lief.Nummer;Strasse;Ort;USTID;Mail Anspr.1;Infos;Zahlungsbedingung-1;IBAN;BIC;Erfasst am;TimoCom-Nr']
  for (let index = 0; index < count; index += 1) lines.push(`Spedition ${index};${70000 + index};Trägerstraße ${index};Berlin;${index < 2 ? 'DE-UTN-GLEICH' : `DE-UTN-${index}`};${index < 2 ? 'gemeinsam@example.test' : `spedition${index}@example.test`};${index < 2 ? 'GEMEINSAM@example.test extra@example.test' : `spedition${index}@example.test`};45 Tage Netto;DE12345${index};TESTDEFF;01.01.2020;TM${index}`)
  return parseCarrierCsv(lines.join('\n')).rows
}

function orderRow(externalNumber, debtorNumber, customerName, carrierName) {
  return { rowNumber: 2, externalNumber, imported: {
    externalNumber,
    customer: { debtorNumber, name: customerName, snapshot: { city: 'Hamburg' } },
    carrier: { originalName: carrierName, matchStatus: 'pending' },
    contacts: { customerStandardEmail: 'kunde@example.test', carrierStandardEmail: 'utn@example.test' },
    loading: { city: 'Hamburg', window: { from: '2026-09-23T07:00', until: '2026-09-23T12:00' } },
    unloading: { city: 'Berlin', window: { from: '2026-09-24T08:00', until: '2026-09-24T14:00' } },
  } }
}

function decisionsFor(target, source) {
  const comparison = mergeComparison({ partners: [target, source] }, target.id)
  return Object.fromEntries(Object.entries(comparison.decisions).map(([key, choice]) => [key, choice.resolution ? choice : { ...choice, resolution: 'target' }]))
}

async function merge(uid, targetId, sourceId) {
  const selection = { currentPartnerId: targetId, otherPartnerId: sourceId, direction: 'current-target' }
  const prepared = await prepareManualPartnerMergeHandler(request(uid, selection))
  const versions = Object.fromEntries(prepared.merge.partners.map((partner) => [partner.id, partner.version]))
  await mergeManualPartnersHandler(request(uid, { ...selection, partnerVersions: versions, decisions: decisionsFor(...prepared.merge.partners.sort((left) => left.id === targetId ? -1 : 1)) }))
  return (await database().doc(`businessPartners/${sourceId}`).get()).get('mergedByMergeId')
}

async function separate(uid, mergeId, rootId) {
  const preview = await previewPartnerMergeReversalHandler(request(uid, { mergeId, targetPartnerId: rootId }))
  assert.equal(preview.canSeparate, true, preview.reason)
  return separatePartnerMergeHandler(request(uid, { mergeId, targetPartnerId: rootId, fingerprint: preview.fingerprint }))
}

function integrityWorld(db) {
  const origins = new Map()
  const checkpoints = []
  async function track(path, fields) {
    const snapshot = await db.doc(path).get()
    assert.ok(snapshot.exists, path)
    origins.set(path, Object.fromEntries(fields.map((field) => [field, valueAt(snapshot.data(), field)])))
  }
  async function check(label) {
    const partnerSnapshots = await db.collection('businessPartners').get()
    const partners = partnerSnapshots.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
    assertFlatPartnerCluster(partners)
    const byId = new Map(partners.map((partner) => [partner.id, partner]))
    const clusters = indexPartnerClusters(partners)
    for (const kind of ['debtor', 'creditor']) {
      const owners = new Map()
      for (const partner of partners.filter((entry) => !entry.mergedIntoPartnerId)) for (const number of partnerNumbers(partner, kind)) {
        assert.equal(owners.has(number), false, `${label}: ${kind} ${number} auf ${owners.get(number)} und ${partner.id}`)
        owners.set(number, partner.id)
      }
    }
    for (const partner of partners) {
      const active = resolvePartnerInIndex(byId, partner.id)
      assert.ok(active && !active.mergedIntoPartnerId, `${label}: ${partner.id} ohne aktiven Hauptpartner`)
      if (partner.mergedIntoPartnerId) assert.equal(partner.mergedIntoPartnerId, active.id, `${label}: Kette für ${partner.id}`)
      const emails = (partner.contacts || []).map((contact) => String(contact.email || '').trim().toLowerCase()).filter(Boolean)
      assert.equal(new Set(emails).size, emails.length, `${label}: doppelte Kontakt-E-Mail ${partner.id}`)
      assert.ok(businessPartnerDetailPath(active.id).endsWith(encodeURIComponent(active.id)), `${label}: Navigation ${partner.id}`)
    }
    const collections = new Map(await Promise.all(PARTNER_REFERENCE_CATALOG.map(async (entry) => [entry.collection, (await db.collection(entry.collection).get()).docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))])))
    for (const entry of PARTNER_REFERENCE_CATALOG) for (const record of collections.get(entry.collection)) {
      for (const field of entry.fields) {
        const originalId = valueAt(record, field)
        if (!originalId) continue
        assert.equal(typeof originalId, 'string', `${label}: ${entry.collection}/${record.id}.${field}`)
        const effective = resolvePartnerInIndex(byId, originalId)
        assert.ok(effective, `${label}: verwaist ${entry.collection}/${record.id}.${field}=${originalId}`)
        assert.ok(clusters.get(effective.id)?.some((member) => member.id === originalId), `${label}: Liste findet ${entry.collection}/${record.id} nicht`)
      }
      if (entry.documentIdIsPartnerId) assert.equal(record.id, record.partnerId, `${label}: Insolvenz-ID`)
      if (entry.collection === 'todos') for (const [field, collection] of [['damageCaseId', 'damageCases'], ['insolvencyId', 'insolvencies'], ['legalDisputeId', 'legalDisputes'], ['inkassoCaseId', 'inkassoCases']]) {
        const id = record[field]
        if (id) assert.ok(collections.get(collection)?.some((candidate) => candidate.id === id), `${label}: verwaister ${field}=${id}`)
      }
    }
    for (const [path, fields] of origins) {
      const snapshot = await db.doc(path).get()
      assert.ok(snapshot.exists, `${label}: ${path} gelöscht`)
      for (const [field, expected] of Object.entries(fields)) assert.deepEqual(valueAt(snapshot.data(), field), expected, `${label}: Ursprungsreferenz ${path}.${field}`)
    }
    checkpoints.push({ label, partners: partners.length, archived: partners.filter((entry) => entry.mergedIntoPartnerId).length, origins: origins.size })
    return { partners, byId, clusters }
  }
  return { track, check, checkpoints }
}

test('Firestore emulator: multi-day imports, cases, two clusters, separation, re-merge and timeout replay retain all invariants', { skip: !enabled, timeout: 180_000 }, async (t) => {
  const db = database(); const uid = actor.userId
  await db.doc(`users/${uid}`).set({ active: true, permissions: { dataImports: 'edit', masterData: 'edit', partnerMerges: 'edit' }, firstName: 'Mehrtage', lastName: 'Test' })
  const world = integrityWorld(db)
  const customers = customerCsv(); const carriers = carrierCsv()
  assert.equal(customers.length, 14); assert.equal(carriers.length, 14)
  const ku = await processCustomerImportHandler(request(uid, { fileName: 'Tag 1 KU.csv', rows: customers }))
  assert.equal(ku.counts.automaticallyAccepted, 14)
  await world.check('Tag 1: Kundenimport')
  const utn = await processCarrierImportHandler(request(uid, { fileName: 'Tag 1 UTN.csv', rows: carriers }))
  assert.equal(utn.counts.automaticallyAccepted, 14)
  const customerIds = ku.accepted.map((row) => row.customerId)
  const carrierIds = utn.accepted.map((row) => row.carrierId)
  assert.equal((await world.check('Tag 1: 28 getrennte Partner')).partners.length, 28)
  assert.notEqual(customerIds[0], customerIds[1], 'gleicher Name und USt-ID verbinden nicht')
  assert.equal((await db.doc(`businessPartners/${carrierIds[0]}`).get()).get('contacts').length, 2, 'Infos-E-Mail dedupliziert')
  const repeatKu = await processCustomerImportHandler(request(uid, { fileName: 'Tag 2 KU Re-Import.csv', rows: [customers[4]] }))
  const repeatUtn = await processCarrierImportHandler(request(uid, { fileName: 'Tag 2 UTN Re-Import.csv', rows: [carriers[4]] }))
  assert.deepEqual(repeatKu.accepted[0].result.actions, ['unchanged'])
  assert.deepEqual(repeatUtn.accepted[0].result.actions, ['unchanged'])
  await world.check('Tag 2: idempotente Re-Imports')
  const linkedCreditor = { creditorNumber: '79999', companyName: customers[13].companyName, data: { linkedDebtorNumber: customers[13].debtorNumber, contacts: [] } }
  const linked = await processCarrierImportHandler(request(uid, { fileName: 'Tag 2 Gegen-ID.csv', rows: [linkedCreditor] }))
  assert.equal(linked.accepted[0].carrierId, customerIds[13])
  await world.check('Tag 2: exakte Gegen-ID')
  const conflictingKu = { ...customers[0], companyName: 'Geprüfter Kundenname' }
  const reviewKu = await processCustomerImportHandler(request(uid, { fileName: 'Tag 2 KU Prüfung.csv', rows: [conflictingKu] }))
  const openKu = (await listCustomerImportQueueHandler(request(uid, { runId: reviewKu.runId }))).open.find((row) => row.debtorNumber === customers[0].debtorNumber)
  assert.equal(openKu.kind, 'review')
  await world.check('Tag 2: offene Kundenprüfung')
  await claimCustomerImportRowHandler(request(uid, { runId: reviewKu.runId, rowId: openKu.id }))
  await approveCustomerImportRowHandler(request(uid, { runId: reviewKu.runId, rowId: openKu.id, approvedValues: { companyName: 'Geprüfter Kundenname' } }))
  const conflictingUtn = { ...carriers[0], companyName: 'Geprüfter Unternehmername' }
  const reviewUtn = await processCarrierImportHandler(request(uid, { fileName: 'Tag 2 UTN Prüfung.csv', rows: [conflictingUtn] }))
  const openUtn = (await listCarrierImportQueueHandler(request(uid, { runId: reviewUtn.runId }))).open.find((row) => row.creditorNumber === carriers[0].creditorNumber)
  assert.equal(openUtn.kind, 'review')
  await claimCarrierImportRowHandler(request(uid, { runId: reviewUtn.runId, rowId: openUtn.id }))
  await approveCarrierImportRowHandler(request(uid, { runId: reviewUtn.runId, rowId: openUtn.id, approvedValues: { companyName: 'Geprüfter Unternehmername' } }))
  await world.check('Tag 2: beide Prüfungen übernommen')

  const orders = [
    orderRow('TA-9001', customers[2].debtorNumber, customers[2].companyName, carriers[2].companyName),
    orderRow('TA-9002', customers[1].debtorNumber, customers[1].companyName, carriers[1].companyName),
    orderRow('TA-9003', customers[5].debtorNumber, customers[5].companyName, carriers[5].companyName),
  ]
  const taRun = await importTransportOrdersHandler(request(uid, { fileName: 'Tag 3 TA.csv', rows: orders, carrierResolutions: [], rowErrors: [] }))
  assert.equal(taRun.counts.Neu, 3)
  for (const order of orders) await world.track(`transportOrders/dycos-${order.externalNumber}`, ['imported.customer.partnerId', 'imported.carrier.partnerId'])
  await Promise.all([
    db.doc('damageCases/day3-damage').set({ claimantPartnerId: customerIds[1], contractorPartnerId: carrierIds[1], transportReference: 'TA-9002' }),
    db.doc('legalDisputes/day3-legal').set({ counterpartyName: 'Gegenpartei', transportReference: 'TA-9002' }),
    db.doc(`insolvencies/${carrierIds[2]}`).set({ partnerId: carrierIds[2], partnerName: 'Spedition 2' }),
    db.doc('inkassoCases/day3-inkasso').set({ debtorPartnerId: carrierIds[1], debtorName: 'Spedition 1' }),
    db.doc('palletMovements/day3-pallet').set({ partnerId: carrierIds[1], customerId: customerIds[1], incoming: 5 }),
    db.doc('palletClosings/day3-closing').set({ partnerId: carrierIds[1], balance: 5 }),
    db.doc(`businessPartners/${customerIds[1]}/activities/day3-activity`).set({ text: 'Kundengespräch' }),
    db.doc(`businessPartners/${carrierIds[1]}/ratings/day3-rating`).set({ role: 'carrier', overallScore: 4 }),
    db.doc('todos/day3-damage').set({ customerId: customerIds[1], damageCaseId: 'day3-damage' }),
    db.doc('todos/day3-ta').set({ customerId: customerIds[1], carrierId: carrierIds[1], reference: 'TA-9002' }),
    db.doc('todos/day3-legal').set({ customerId: customerIds[1], legalDisputeId: 'day3-legal' }),
    db.doc('todos/day3-insolvency').set({ carrierId: carrierIds[2], insolvencyId: carrierIds[2] }),
    db.doc('todos/day3-inkasso').set({ carrierId: carrierIds[1], inkassoCaseId: 'day3-inkasso' }),
  ])
  for (const [path, fields] of [
    ['damageCases/day3-damage', ['claimantPartnerId', 'contractorPartnerId']],
    [`insolvencies/${carrierIds[2]}`, ['partnerId']], ['inkassoCases/day3-inkasso', ['debtorPartnerId']],
    ['palletMovements/day3-pallet', ['partnerId', 'customerId']], ['palletClosings/day3-closing', ['partnerId']],
    ['todos/day3-damage', ['customerId', 'damageCaseId']], ['todos/day3-ta', ['customerId', 'carrierId', 'reference']],
    ['todos/day3-legal', ['customerId', 'legalDisputeId']], ['todos/day3-insolvency', ['carrierId', 'insolvencyId']],
    ['todos/day3-inkasso', ['carrierId', 'inkassoCaseId']],
  ]) await world.track(path, fields)
  await world.check('Tag 3: TA, Fälle, CRM, Paletten und abgeleitete To-dos')

  const a1 = await merge(uid, customerIds[0], customerIds[1]); await world.check('Tag 4: Cluster A, Mitglied 1')
  await merge(uid, customerIds[0], customerIds[2]); await world.check('Tag 4: Cluster A, Mitglied 2')
  const b1 = await merge(uid, carrierIds[0], carrierIds[1]); await world.check('Tag 4: Cluster B, Mitglied 1')
  await merge(uid, carrierIds[0], carrierIds[2]); await world.check('Tag 4: Cluster B, Mitglied 2')
  await merge(uid, customerIds[0], carrierIds[0])
  const joined = await world.check('Tag 4: Cluster B vollständig und direkt unter A')
  for (const id of [customerIds[1], customerIds[2], carrierIds[0], carrierIds[1], carrierIds[2]]) assert.equal(joined.byId.get(id).mergedIntoPartnerId, customerIds[0])
  await Promise.all([
    db.doc('todos/day4-independent').set({ customerId: customerIds[0] }),
    db.doc('todos/day4-from-ta').set({ customerId: customerIds[1], carrierId: carrierIds[1], reference: 'TA-9002' }),
    db.doc('todos/day4-from-damage').set({ customerId: customerIds[1], damageCaseId: 'day3-damage' }),
    db.doc('todos/day4-from-legal').set({ customerId: customerIds[1], legalDisputeId: 'day3-legal' }),
    db.doc('todos/day4-from-insolvency').set({ carrierId: carrierIds[2], insolvencyId: carrierIds[2] }),
    db.doc('todos/day4-from-inkasso').set({ carrierId: carrierIds[1], inkassoCaseId: 'day3-inkasso' }),
    db.doc(`businessPartners/${customerIds[0]}/activities/day4-activity`).set({ text: 'Neue Hauptpartner-Aktivität' }),
    db.doc('palletMovements/day4-pallet').set({ partnerId: customerIds[0], incoming: 3 }),
  ])
  for (const [path, fields] of [
    ['todos/day4-independent', ['customerId']], ['todos/day4-from-ta', ['customerId', 'carrierId', 'reference']],
    ['todos/day4-from-damage', ['customerId', 'damageCaseId']], ['todos/day4-from-legal', ['customerId', 'legalDisputeId']],
    ['todos/day4-from-insolvency', ['carrierId', 'insolvencyId']], ['todos/day4-from-inkasso', ['carrierId', 'inkassoCaseId']],
    ['palletMovements/day4-pallet', ['partnerId']],
  ]) await world.track(path, fields)
  await world.check('Tag 4: neue direkte und abgeleitete Vorgänge')

  await separate(uid, a1, customerIds[0]); await world.check('Tag 5: nur Kunde 1 getrennt')
  await separate(uid, b1, customerIds[0])
  const split = await world.check('Tag 5: nur Unternehmer 1 getrennt')
  assert.equal(split.byId.get(customerIds[1]).mergedIntoPartnerId, undefined)
  assert.equal(split.byId.get(carrierIds[1]).mergedIntoPartnerId, undefined)
  assert.equal(split.byId.get(customerIds[2]).mergedIntoPartnerId, customerIds[0])
  assert.equal(split.byId.get(carrierIds[2]).mergedIntoPartnerId, customerIds[0])
  assert.equal((await db.doc('todos/day4-independent').get()).get('customerId'), customerIds[0])
  const afterSplitKu = await processCustomerImportHandler(request(uid, { fileName: 'Tag 5 KU nach Trennung.csv', rows: [customers[1]] }))
  const afterSplitUtn = await processCarrierImportHandler(request(uid, { fileName: 'Tag 5 UTN nach Trennung.csv', rows: [carriers[1]] }))
  assert.equal(afterSplitKu.accepted[0].customerId, customerIds[1])
  assert.equal(afterSplitUtn.accepted[0].carrierId, carrierIds[1])
  await world.check('Tag 5: Nummern nach Trennung direkt zugeordnet')
  await merge(uid, customerIds[0], customerIds[1]); await world.check('Tag 6: Kunde 1 erneut gemergt')
  await merge(uid, customerIds[0], carrierIds[1]); await world.check('Tag 6: Unternehmer 1 erneut gemergt')
  await merge(uid, customerIds[3], customerIds[0])
  const finalRoot = await world.check('Tag 6: gesamter Verbund direkt am dritten Hauptpartner')
  for (const id of [customerIds[0], customerIds[1], customerIds[2], carrierIds[0], carrierIds[1], carrierIds[2]]) assert.equal(finalRoot.byId.get(id).mergedIntoPartnerId, customerIds[3])
  await assert.rejects(separate(uid, a1, customerIds[3]), /bereits getrennt|nicht mehr offen/i)
  await assert.rejects(merge(uid, customerIds[3], customerIds[0]), /archiviert|zusammengeführt/i)
  await world.check('Tag 6: Timeout-Replay ohne Mutation')

  const selection = { currentPartnerId: customerIds[3], otherPartnerId: customerIds[4], direction: 'current-target' }
  const prepared = await prepareManualPartnerMergeHandler(request(uid, selection))
  const versions = Object.fromEntries(prepared.merge.partners.map((partner) => [partner.id, partner.version]))
  const decisionSet = decisionsFor(...prepared.merge.partners.sort((left) => left.id === customerIds[3] ? -1 : 1))
  const parallel = await Promise.allSettled([mergeManualPartnersHandler(request(uid, { ...selection, partnerVersions: versions, decisions: decisionSet })), mergeManualPartnersHandler(request(uid, { ...selection, partnerVersions: versions, decisions: decisionSet }))])
  assert.equal(parallel.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(parallel.filter((result) => result.status === 'rejected').length, 1)
  await world.check('Tag 7: parallele Merge-Versuche')
  await assert.rejects(merge(uid, customerIds[4], customerIds[5]), /archiviert|zusammengeführt/i)
  await world.check('Tag 7: archiviertes Ziel blockiert')

  // The two requests race against the same partner version. A successful import
  // must never leave its accepted value only on an archived source document.
  const concurrentRow = { ...customers[7], data: { ...customers[7].data, street: 'Gleichzeitig importierte Straße' } }
  const concurrent = await Promise.allSettled([
    merge(uid, customerIds[6], customerIds[7]),
    processCustomerImportHandler(request(uid, { fileName: 'Tag 7 paralleler Import.csv', rows: [concurrentRow] })),
  ])
  const imported = concurrent[1].status === 'fulfilled' ? concurrent[1].value : null
  if (concurrent[0].status === 'rejected') await merge(uid, customerIds[6], customerIds[7])
  const afterConcurrent = await world.check('Tag 7: Merge und Import gleichzeitig')
  if (imported?.accepted?.length) assert.equal(afterConcurrent.byId.get(customerIds[6]).address?.street, concurrentRow.data.street, 'akzeptierter Wert darf nicht nur am archivierten Blatt liegen')
  if (imported?.runId) {
    const queue = await listCustomerImportQueueHandler(request(uid, { runId: imported.runId }))
    for (const row of queue.open.filter((entry) => entry.runId === imported.runId && entry.kind === 'review')) {
      const claimed = await claimCustomerImportRowHandler(request(uid, { runId: imported.runId, rowId: row.id }))
      assert.equal(claimed.row.customerId, customerIds[6], 'Prüfung muss den aktiven Hauptpartner laden')
      const approved = await approveCustomerImportRowHandler(request(uid, { runId: imported.runId, rowId: row.id, approvedValues: {} }))
      assert.equal(approved.row.customerId, customerIds[6], 'Übernahme muss den aktiven Hauptpartner ändern')
    }
  }
  await world.check('Tag 7: parallele Importprüfung abgeschlossen')

  const splitMergeId = await merge(uid, customerIds[8], customerIds[9])
  await world.check('Tag 7: Vorbereitung paralleler Trennung')
  const competing = await Promise.allSettled([
    separate(uid, splitMergeId, customerIds[8]),
    merge(uid, customerIds[10], customerIds[8]),
  ])
  assert.ok(competing.some((result) => result.status === 'fulfilled'))
  await world.check('Tag 7: Trennung und weiterer Merge gleichzeitig')

  const carrierReview = await processCarrierImportHandler(request(uid, { fileName: 'Tag 7 UTN Prüfung.csv', rows: [{ ...carriers[6], companyName: 'Spedition 6 neu' }] }))
  const carrierOpen = (await listCarrierImportQueueHandler(request(uid, { runId: carrierReview.runId }))).open.find((row) => row.runId === carrierReview.runId && row.kind === 'review')
  assert.ok(carrierOpen)
  await merge(uid, carrierIds[7], carrierIds[6])
  const carrierClaim = await claimCarrierImportRowHandler(request(uid, { runId: carrierReview.runId, rowId: carrierOpen.id }))
  assert.equal(carrierClaim.row.carrierId, carrierIds[7])
  const carrierApproval = await approveCarrierImportRowHandler(request(uid, { runId: carrierReview.runId, rowId: carrierOpen.id, approvedValues: {} }))
  assert.equal(carrierApproval.row.carrierId, carrierIds[7])
  await world.check('Tag 7: Unternehmerprüfung nach Merge auf Hauptpartner')
  assert.ok(world.checkpoints.length >= 20)
  t.diagnostic(`${world.checkpoints.length} vollständige Integritätsprüfungen; ${world.checkpoints.at(-1).partners} Partner, ${world.checkpoints.at(-1).origins} unveränderte Ursprungsreferenzen`)
})
