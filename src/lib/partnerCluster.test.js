import assert from 'node:assert/strict'
import test from 'node:test'
import { PARTNER_REFERENCE_CATALOG, assertFlatPartnerCluster, effectivePartnerReference, indexPartnerClusters, mergeClusterRedirects, ownedPartnerNumbers, partnerClusterMembers, resolvePartnerInIndex } from './partnerCluster.js'

test('reference catalogue covers every stored partner field and distinguishes case origins from free-text TA references', () => {
  const fields = new Set(PARTNER_REFERENCE_CATALOG.flatMap(({ collection, fields: paths }) => paths.map((path) => `${collection}.${path}`)))
  for (const path of ['transportOrders.imported.customer.partnerId', 'transportOrders.imported.carrier.partnerId', 'todos.customerId', 'todos.carrierId', 'damageCases.claimantPartnerId', 'damageCases.contractorPartnerId', 'insolvencies.partnerId', 'inkassoCases.debtorPartnerId', 'palletMovements.partnerId', 'palletClosings.partnerId', 'customerImportRows.customerId', 'carrierImportRows.carrierId', 'businessPartners.linkedCarrierReference.partnerId']) assert.ok(fields.has(path), path)
  assert.deepEqual(PARTNER_REFERENCE_CATALOG.find((entry) => entry.collection === 'legalDisputes').fields, [])
  assert.ok(PARTNER_REFERENCE_CATALOG.find((entry) => entry.collection === 'todos').originFields.includes('damageCaseId'))
})

test('two merged clusters flatten to one active root, and a later root change remains flat', () => {
  const partners = [
    { id: 'A', status: 'active', companyName: 'A' },
    { id: '1', status: 'merged', mergedIntoPartnerId: 'A' },
    { id: '2', status: 'merged', mergedIntoPartnerId: 'A' },
    { id: 'B', status: 'active', debtorNumber: '20', dycosReferences: { debtorNumbers: ['20', '21'] } },
    { id: '4', status: 'merged', mergedIntoPartnerId: 'B', debtorNumber: '21' },
    { id: '5', status: 'merged', mergedIntoPartnerId: 'B' },
    { id: 'C', status: 'active' },
  ]
  assert.deepEqual(mergeClusterRedirects(partners, 'B', 'A').map((partner) => partner.id), ['4', '5'])
  assert.deepEqual(ownedPartnerNumbers(partners[3], [partners[4], partners[5]]).debtors, ['20'])
  const flattened = partners.map((partner) => ['B', '4', '5'].includes(partner.id) ? { ...partner, status: 'merged', mergedIntoPartnerId: 'A' } : partner)
  assertFlatPartnerCluster(flattened)
  assert.deepEqual(partnerClusterMembers(flattened, 'A').map((partner) => partner.id), ['A', '1', '2', 'B', '4', '5'])
  assert.deepEqual(indexPartnerClusters(flattened).get('A').map((partner) => partner.id), ['A', '1', '2', 'B', '4', '5'])
  const separated = flattened.map((partner) => partner.id === '4' ? { ...partner, status: 'active', mergedIntoPartnerId: undefined } : partner)
  assertFlatPartnerCluster(separated)
  assert.equal(effectivePartnerReference(new Map(separated.map((partner) => [partner.id, partner])), '4').effectivePartnerId, '4')
  const redirected = separated.map((partner) => ['A', '1', '2', 'B', '5'].includes(partner.id) ? { ...partner, status: 'merged', mergedIntoPartnerId: 'C' } : partner)
  assertFlatPartnerCluster(redirected)
})

test('invalid destination, self-reference and cycles fail closed', () => {
  assert.throws(() => resolvePartnerInIndex(new Map([['a', { id: 'a', status: 'merged', mergedIntoPartnerId: 'missing' }]]), 'a'), /nicht vorhanden/)
  assert.throws(() => assertFlatPartnerCluster([{ id: 'a', status: 'merged', mergedIntoPartnerId: 'a' }]), /Nicht flache/)
  assert.throws(() => assertFlatPartnerCluster([{ id: 'a', status: 'merged' }]), /ohne Weiterleitung/)
  assert.throws(() => assertFlatPartnerCluster([{ id: 'a', status: 'active', mergedIntoPartnerId: 'b' }, { id: 'b', status: 'active' }]), /Nicht flache/)
  const cycle = new Map([['a', { id: 'a', status: 'merged', mergedIntoPartnerId: 'b' }], ['b', { id: 'b', status: 'merged', mergedIntoPartnerId: 'a' }]])
  assert.throws(() => resolvePartnerInIndex(cycle, 'a'), /Zyklische/)
  assert.throws(() => assertFlatPartnerCluster([...cycle.values()]), /Nicht flache/)
})
