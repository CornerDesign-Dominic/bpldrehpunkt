import assert from 'node:assert/strict'
import test from 'node:test'
import { carrierMatchDecision, carrierPartnerPayload, carrierResolutionForImport, customerPartnerPayload, fillEmptyCustomerFields, importPartnerId, isSafeImportedCarrierRepair, transportOrderPartnerLink } from './transportOrderImports.js'

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
  assert.equal(payload.importOrigin.transportOrderNumber, '260900123')
})

test('an exact entrepreneur match links the existing partner without new creation', () => {
  const decision = carrierMatchDecision('Transporte Müller GmbH', [{ id: 'carrier-existing', companyName: 'Transporte Müller GmbH' }])
  assert.equal(decision.kind, 'exact')
  assert.equal(decision.partner.id, 'carrier-existing')
})

test('ambiguous entrepreneur preview includes the master data needed for manual comparison', () => {
  const match = carrierMatchDecision('Baltic Transline Kaunas', [{ id: 'candidate-1', companyName: 'Baltic Transline', debtorNumber: '10008', creditorNumber: '75398', dycosReferences: { creditorNumbers: ['75398', '75399'] }, address: { city: 'Hamburg', street: 'Hafenstraße' }, contact: { email: 'info@example.test', phone: '040 123' } }])
  assert.equal(match.kind, 'candidates')
  assert.equal(match.candidates[0].id, 'candidate-1')
  assert.deepEqual(match.candidates[0].creditorNumbers, ['75398', '75399'])
  assert.equal(match.candidates[0].address.city, 'Hamburg')
  assert.equal(match.candidates[0].contact.email, 'info@example.test')
})

test('only a current suggested entrepreneur or deliberate new creation can be confirmed', () => {
  const match = { kind: 'candidates', candidates: [{ id: 'candidate-1' }] }
  assert.deepEqual(carrierResolutionForImport(match, { partnerId: 'candidate-1', createNew: false }), { partnerId: 'candidate-1', manual: true })
  assert.deepEqual(carrierResolutionForImport(match, { partnerId: '', createNew: true }), { createNew: true, manual: true })
  assert.throws(() => carrierResolutionForImport(match, { partnerId: 'unrelated', createNew: false }), /vorgeschlagenen Unternehmer/)
  assert.throws(() => carrierResolutionForImport({ kind: 'exact', partner: { id: 'candidate-1' } }, { partnerId: 'candidate-1' }), /nicht mehr aktuell/)
})

test('missing entrepreneur produces a partner with name and standard mail but no invented creditor number', () => {
  const payload = carrierPartnerPayload(row, { partnerId: 'carrier-1', importRunId: 'run-1', now: 'now' })
  assert.equal(payload.companyName, 'Transporte Müller GmbH')
  assert.equal(payload.contact.email, 'utn@example.test')
  assert.equal(payload.creditorNumber, '')
  assert.deepEqual(payload.dycosReferences.creditorNumbers, [])
  assert.deepEqual(payload.taImportStatus.missingRequiredFields, ['creditorNumber'])
  assert.equal(payload.taImportStatus.partnerId, 'carrier-1')
})

test('order-only Info-1 and Im Auftrag never enter customer master data and existing data is not overwritten', () => {
  const patch = fillEmptyCustomerFields({ companyName: 'Manueller Name', address: { street: 'Eigene Straße', city: '' }, contact: { email: 'manual@example.test' } }, row)
  assert.deepEqual(patch, { address: { street: 'Eigene Straße', city: 'Düsseldorf', postalCode: '40210', country: 'DE' } })
  assert.equal(JSON.stringify(patch).includes('Nur Auftrag'), false)
})

test('new import partners are linked through their Firestore document IDs', () => {
  const partner = { id: 'actual-firestore-id', companyName: 'Transporte Müller GmbH', creditorNumber: '', taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }
  assert.deepEqual(transportOrderPartnerLink(partner), { partnerId: 'actual-firestore-id', partnerName: 'Transporte Müller GmbH', masterDataStatus: 'creditorNumberMissing' })
})

test('re-import uses stable partner IDs, does not create a duplicate and repairs only a traceable broken carrier link', () => {
  assert.equal(importPartnerId('debtor', '10042'), importPartnerId('debtor', '10042'))
  assert.equal(importPartnerId('carrier', 'transporte muller gmbh'), importPartnerId('carrier', 'transporte muller gmbh'))
  const importedCarrier = { id: importPartnerId('carrier', 'transporte muller gmbh'), creditorNumber: '', importOrigin: { source: 'dycosTransportOrder', transportOrderNumber: '260900123' } }
  assert.equal(isSafeImportedCarrierRepair({ carrierPartnerId: 'obsolete-number-or-key' }, importedCarrier, '260900123'), true)
  assert.equal(isSafeImportedCarrierRepair({ carrierPartnerId: 'obsolete-number-or-key' }, { ...importedCarrier, importOrigin: { ...importedCarrier.importOrigin, transportOrderNumber: 'other-ta' } }, '260900123'), false)
})
