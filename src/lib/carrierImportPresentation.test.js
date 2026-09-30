import assert from 'node:assert/strict'
import test from 'node:test'
import { customerImportHistoryGroups, customerImportHistoryRowView, customerImportResultView } from './customerImportPresentation.js'

test('carrier result names the server-selected partner and exact creditor assignment', () => {
  const row = { id: 'row-1', runId: 'run-1', creditorNumber: '75397', companyName: 'CSV-Name', affectedPartner: { id: 'partner-a', companyName: 'Stammdatenname' }, result: { partnerId: 'partner-a', assignment: { kind: 'creditor', number: '75397' }, actions: ['updated'] }, approval: { type: 'automatic' } }
  const view = customerImportResultView(row)
  assert.equal(view.partnerName, 'Stammdatenname')
  assert.equal(view.partnerId, 'partner-a')
  assert.equal(view.match, 'exakte Kreditorennummer 75397')
  assert.equal(customerImportHistoryRowView(row).title, 'Stammdaten ergänzt')
  assert.equal(customerImportHistoryGroups([row], { 'run-1': { fileName: 'UTN.csv' } })[0].fileName, 'UTN.csv')
})
