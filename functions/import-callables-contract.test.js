import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
const importAndMergeCallables = [
  'listTransportOrderImportRuns',
  'listCustomerImportQueue', 'claimCustomerImportRow', 'releaseCustomerImportRow', 'approveCustomerImportRow', 'mergeCustomerImportPartners',
  'listCarrierImportQueue', 'claimCarrierImportRow', 'releaseCarrierImportRow', 'approveCarrierImportRow', 'mergeCarrierImportPartners',
  'prepareManualPartnerMerge', 'mergeManualPartners', 'previewPartnerMergeReversal', 'separatePartnerMerge',
]

test('all import, merge and separation callables retain enforced App Check at their public boundary', () => {
  importAndMergeCallables.forEach((name) => {
    assert.match(source, new RegExp(`export const ${name} = onCall\\(\\{[^}]*enforceAppCheck: true`), name)
  })
})

test('retired CSV callables are no longer exposed', () => {
  for (const name of ['previewTransportOrderImport', 'importTransportOrders', 'previewCustomerImport', 'importCustomers', 'processCustomerImport', 'processCarrierImport']) assert.doesNotMatch(source, new RegExp(`export const ${name} =`))
})
