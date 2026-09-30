import assert from 'node:assert/strict'
import test from 'node:test'
import { matchingManualMergePartners } from './manualPartnerMergeSearch.js'

const partners = [
  { id: 'self', status: 'active', companyName: 'Eigener Partner' },
  { id: 'a', status: 'active', companyName: 'Nord Spedition', debtorNumber: '10007', creditorNumber: '75397', dycosReferences: { debtorNumbers: ['10008'], creditorNumbers: ['75398'] } },
  { id: 'b', status: 'inactive', companyName: 'Süd Spedition' },
  { id: 'c', status: 'active', mergedIntoPartnerId: 'a', companyName: 'Archiv Spedition' },
]

test('manual merge search excludes self, inactive and archived partners', () => {
  assert.deepEqual(matchingManualMergePartners(partners, 'self', '').map((partner) => partner.id), ['a'])
})

test('manual merge search uses company name and both stored number types', () => {
  for (const term of ['nord', '10007', '10008', '75397', '75398']) assert.deepEqual(matchingManualMergePartners(partners, 'self', term).map((partner) => partner.id), ['a'])
  assert.deepEqual(matchingManualMergePartners(partners, 'self', 'unbekannt'), [])
})
