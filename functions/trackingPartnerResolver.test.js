import assert from 'node:assert/strict'
import test from 'node:test'
import { loadEffectiveTrackingPartner } from './partnerCluster.js'

function fixture(documents) {
  const reads = []
  return { reads, db: { doc: (path) => ({ get: async () => {
    reads.push(path)
    return { id: path.split('/').at(-1), exists: Object.hasOwn(documents, path), data: () => documents[path] }
  } }) } }
}

test('tracking resolver follows the effective partner while retaining the current bounded redirect contract', async () => {
  const { db, reads } = fixture({
    'businessPartners/original': { status: 'merged', mergedIntoPartnerId: 'current' },
    'businessPartners/current': { companyName: 'Current partner', shipmentTrackingPolicy: { customer: { licensePlateImportant: true } } },
  })
  assert.equal((await loadEffectiveTrackingPartner(db, 'original')).id, 'current')
  assert.deepEqual(reads, ['businessPartners/original', 'businessPartners/current'])
})

test('tracking resolver rejects invalid references, cycles and missing or broken redirect targets', async () => {
  const { db, reads } = fixture({
    'businessPartners/a': { status: 'merged', mergedIntoPartnerId: 'b' },
    'businessPartners/b': { status: 'merged', mergedIntoPartnerId: 'a' },
    'businessPartners/broken': { status: 'merged' },
  })
  assert.equal(await loadEffectiveTrackingPartner(db, 'a'), null)
  assert.equal(reads.length, 2)
  assert.equal(await loadEffectiveTrackingPartner(db, 'broken'), null)
  assert.equal(await loadEffectiveTrackingPartner(db, 'missing'), null)
  const before = reads.length
  for (const id of ['', null, 'wrong/path']) assert.equal(await loadEffectiveTrackingPartner(db, id), null)
  assert.equal(reads.length, before)
})
