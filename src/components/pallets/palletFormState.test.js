import assert from 'node:assert/strict'
import test from 'node:test'
import { createPalletMovementForm, createPalletMovementFormFromEntry, palletPartnerOption } from './palletFormState.js'

test('pallet movement forms keep the internal ID for customers and carriers, regardless of DyCoS numbers', () => {
  const customer = { id: 'customer-10007', debtorNumber: '10007' }
  const carrier = { id: 'carrier-75397', creditorNumber: '75397' }
  const provisionalCarrier = { id: 'dycos-carrier-muller%20logistik', taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }

  assert.equal(createPalletMovementForm(customer).customerId, customer.id)
  assert.equal(createPalletMovementForm(customer).carrierId, '')
  assert.equal(createPalletMovementForm(carrier).carrierId, carrier.id)
  assert.equal(createPalletMovementForm(provisionalCarrier).carrierId, provisionalCarrier.id)
})

test('aliases and a later creditor number never change the pallet account partner identity', () => {
  const partnerId = 'Partner+Nord#1?aktiv'
  const withoutCreditor = { id: partnerId, taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] }, dycosReferences: { creditorNumbers: ['ALT-7', 'ALT-8'] } }
  const withCreditor = { ...withoutCreditor, creditorNumber: '75397' }
  const carrierWithAliases = { id: 'carrier-aliases', dycosReferences: { creditorNumbers: ['75397', '75398'] } }

  assert.equal(createPalletMovementForm(withoutCreditor).carrierId, partnerId)
  assert.equal(createPalletMovementForm(withCreditor).carrierId, partnerId)
  assert.equal(createPalletMovementForm(carrierWithAliases).carrierId, carrierWithAliases.id)
  const existingAccountEntry = createPalletMovementFormFromEntry({ customerId: 'customer-10007', carrierId: partnerId })
  assert.equal(existingAccountEntry.customerId, 'customer-10007')
  assert.equal(existingAccountEntry.carrierId, partnerId)
})

test('a merged pallet movement keeps its original ID while showing the active partner', () => {
  const source = { id: 'carrier-original', companyName: 'Spedition Alt', status: 'merged', mergedIntoPartnerId: 'carrier-main' }
  const target = { id: 'carrier-main', companyName: 'Spedition Neu', status: 'active' }
  const option = palletPartnerOption(new Map([[source.id, source], [target.id, target]]), source.id)

  assert.deepEqual(option, { id: source.id, isHistorical: true, label: 'Spedition Neu · Ursprung: Spedition Alt' })
  assert.equal(createPalletMovementFormFromEntry({ carrierId: source.id }).carrierId, source.id)
})
