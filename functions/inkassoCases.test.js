import assert from 'node:assert/strict'
import test from 'node:test'
import { inkassoPartnerSnapshot } from './inkassoCases.js'

test('inkasso keeps the internal partner link when a provisional carrier has no creditor number', () => {
  assert.deepEqual(
    inkassoPartnerSnapshot({ companyName: 'Vorläufige Spedition', taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }, 'carrier'),
    { debtorName: 'Vorläufige Spedition', debtorNumber: null },
  )
})

test('inkasso still rejects a partner that does not have the selected business role', () => {
  assert.equal(inkassoPartnerSnapshot({ companyName: 'Nur Kunde', debtorNumber: '10042' }, 'carrier'), null)
  assert.deepEqual(inkassoPartnerSnapshot({ companyName: 'Kunde', debtorNumber: '10042' }, 'customer'), { debtorName: 'Kunde', debtorNumber: '10042' })
})
