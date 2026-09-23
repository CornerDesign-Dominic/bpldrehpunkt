import assert from 'node:assert/strict'
import test from 'node:test'
import { getMissingCreditorNumberNotice, isCarrierMasterDataIncomplete } from './importedPartnerStatus.js'

const importCarrier = {
  creditorNumber: '',
  taImportStatus: {
    source: 'dycosTransportOrder',
    missingRequiredFields: ['creditorNumber'],
    transportOrderNumber: '260900123',
    importRunId: 'run-1',
    importedAt: '2026-09-22T10:00:00.000Z',
  },
}

test('missing creditor number from TA import produces the persistent notice', () => {
  assert.deepEqual(getMissingCreditorNumberNotice(importCarrier), {
    transportOrderNumber: '260900123',
    importRunId: 'run-1',
    importedAt: '2026-09-22T10:00:00.000Z',
  })
  assert.equal(isCarrierMasterDataIncomplete({ masterDataStatus: 'creditorNumberMissing' }), true)
})

test('a genuine creditor number suppresses the TA import notice', () => {
  assert.equal(getMissingCreditorNumberNotice({ ...importCarrier, creditorNumber: '70042' }), null)
})
