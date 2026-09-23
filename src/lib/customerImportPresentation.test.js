import assert from 'node:assert/strict'
import test from 'node:test'
import { customerImportHistoryDate, customerImportHistoryGroups, customerImportHistoryRowView, customerImportResultView } from './customerImportPresentation.js'

test('a new partner uses the returned Firestore ID and name rather than the CSV name', () => {
  const view = customerImportResultView({ debtorNumber: '10007', companyName: 'Name wie Partner 10689', customerId: 'dycos-debtor-10007', affectedPartner: { id: 'dycos-debtor-10007', companyName: 'Tatsächlicher Name' }, result: { actions: ['created'], assignment: { kind: 'new' } } })
  assert.deepEqual(view.labels, ['Neuer Partner angelegt'])
  assert.equal(view.partnerName, 'Tatsächlicher Name')
  assert.equal(view.partnerPath, '/kunden-unternehmer/dycos-debtor-10007')
  assert.equal(view.partnerId, 'dycos-debtor-10007')
})

test('review and merge labels show how the target partner was selected', () => {
  const reviewed = customerImportResultView({ affectedPartner: { id: 'a', companyName: 'A' }, result: { actions: ['creditorAdded', 'reviewed'], assignment: { kind: 'debtor', number: '10689' } } })
  assert.deepEqual(reviewed.labels, ['Kreditorennummer ergänzt', 'Nach Prüfung übernommen'])
  assert.equal(reviewed.match, 'exakte Debitorennummer 10689 · manuelle Prüfung')
  const merged = customerImportResultView({ affectedPartner: { id: 'b', companyName: 'B' }, result: { actions: ['merged', 'reviewed'], assignment: { kind: 'merge' } } })
  assert.equal(merged.match, 'Zusammenführung')
  assert.deepEqual(merged.labels, ['Partner zusammengeführt', 'Nach Prüfung übernommen'])
})

test('a missing linked partner is shown as unavailable instead of borrowing the CSV company name', () => {
  const view = customerImportResultView({ customerId: 'missing-id', companyName: 'CSV-Firma', result: { actions: ['updated'], assignment: { kind: 'unknown' } } })
  assert.equal(view.partnerName, 'Stammdatenblatt nicht verfügbar')
  assert.equal(view.partnerPath, null)
  assert.equal(view.partnerId, 'missing-id')
})

test('history groups by run ID even when files have the same name and opens the newest group first', () => {
  const rows = [
    { id: 'older', runId: 'run-1', fileName: 'Kunden.csv', approval: { type: 'automatic' } },
    { id: 'newer-auto', runId: 'run-2', fileName: 'Kunden.csv', approval: { type: 'automatic' } },
    { id: 'newer-reviewed', runId: 'run-2', fileName: 'Kunden.csv', approval: { type: 'reviewed' } },
    { id: 'legacy', fileName: 'Alt.csv', approval: { type: 'automatic' } },
  ]
  const runs = {
    'run-1': { fileName: 'Kunden.csv', importedAt: { seconds: 1000 }, importedByName: 'Alex' },
    'run-2': { fileName: 'Kunden.csv', importedAt: { seconds: 2000 }, importedByName: 'Mira' },
  }
  const groups = customerImportHistoryGroups(rows, runs)
  assert.deepEqual(groups.map((group) => group.key), ['run:run-2', 'run:run-1', 'legacy'])
  assert.deepEqual(groups[0].rows.map((row) => row.id), ['newer-auto', 'newer-reviewed'])
  assert.deepEqual([groups[0].automatic, groups[0].reviewed, groups[0].importedByName], [1, 1, 'Mira'])
  assert.equal(groups[2].fileName, 'Frühere Übernahmen')
})

test('history row displays the stored result and the actual affected partner without technical ID', () => {
  const view = customerImportHistoryRowView({ debtorNumber: '10007', companyName: 'CSV-Firma', affectedPartner: { id: 'partner-10007', companyName: 'Partner aus Firestore' }, approval: { type: 'automatic' }, result: { actions: ['created'], assignment: { kind: 'new' } } })
  assert.equal(view.title, 'Neuer Partner angelegt')
  assert.equal(view.partnerName, 'Partner aus Firestore')
  assert.equal(view.partnerPath, '/kunden-unternehmer/partner-10007')
  assert.equal(view.match, 'Neuanlage ohne vorhandene Nummer')
  assert.equal(view.approval, 'automatisch')
  assert.equal(customerImportHistoryRowView({ result: { actions: ['updated'] } }).title, 'Stammdaten ergänzt')
  assert.equal(customerImportHistoryRowView({ result: { actions: ['creditorAdded'] } }).title, 'Nummer ergänzt')
  assert.equal(customerImportHistoryRowView({ result: { actions: ['unchanged'] } }).title, 'Keine neuen Daten übernommen')
  assert.equal(customerImportHistoryRowView({ approval: { type: 'reviewed' }, result: { actions: ['merged', 'reviewed'] } }).title, 'Partner zusammengeführt')
  assert.equal(customerImportHistoryRowView({ approval: { type: 'reviewed' }, result: { actions: ['reviewed'] } }).title, 'Nach Prüfung übernommen')
})

test('history date uses the German display format for the import-run timestamp', () => {
  assert.equal(customerImportHistoryDate(Date.parse('2026-09-23T08:32:00Z')), '23.09.2026, 10:32')
})
