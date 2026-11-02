import assert from 'node:assert/strict'
import test from 'node:test'
import { carrierPartnerPayload, customerPartnerPayload } from './dycosPartnerPayloads.js'

const row = {
  externalNumber: '260900123',
  imported: {
    customer: { debtorNumber: '10042', name: 'Frachtzahler GmbH', snapshot: { country: 'DE', postalCode: '40210', city: 'Düsseldorf', street: 'Importstraße 7' } },
    carrier: { originalName: 'Transporte Müller GmbH' },
    contacts: { customerForOrder: 'Nur Auftrag', carrierForOrder: 'Nur Auftrag', customerStandardEmail: 'fz@example.test', carrierStandardEmail: 'utn@example.test' },
  },
}

test('missing customer produces a customer partner with debtor number, FZ data and standard mail', () => {
  const payload = customerPartnerPayload(row, { partnerId: 'customer-1', importRunId: 'run-1', now: 'now' })
  assert.equal(payload.debtorNumber, '10042')
  assert.equal(payload.companyName, 'Frachtzahler GmbH')
  assert.deepEqual(payload.address, { street: 'Importstraße 7', houseNumber: '', postalCode: '40210', city: 'Düsseldorf', country: 'DE' })
  assert.equal(payload.contact.email, 'fz@example.test')
  assert.deepEqual(payload.dycosReferences.debtorNumbers, ['10042'])
  assert.deepEqual(payload.shipmentTrackingPolicy.customer, { licensePlateImportant: true, loadingSiteInformationImportant: true })
  assert.deepEqual(payload.shipmentTrackingPolicy.carrier.enabledRuleIds, {})
  assert.equal(payload.importOrigin.transportOrderNumber, '260900123')
})

test('missing entrepreneur produces a partner with name and standard mail but no invented creditor number', () => {
  const payload = carrierPartnerPayload(row, { partnerId: 'carrier-1', importRunId: 'run-1', now: 'now' })
  assert.equal(payload.companyName, 'Transporte Müller GmbH')
  assert.equal(payload.contact.email, 'utn@example.test')
  assert.equal(payload.creditorNumber, '')
  assert.deepEqual(payload.dycosReferences.creditorNumbers, [])
  assert.deepEqual(payload.taImportStatus.missingRequiredFields, ['creditorNumber'])
  assert.equal(payload.taImportStatus.partnerId, 'carrier-1')
  assert.equal(Object.keys(payload.shipmentTrackingPolicy.carrier.enabledRuleIds).every((id) => id.includes('.internal.')), true)
})

