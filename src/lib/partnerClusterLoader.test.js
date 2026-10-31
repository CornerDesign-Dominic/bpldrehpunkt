import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPartnerCluster } from './partnerClusterLoader.js'

function reader(records) {
  const reads = []
  return {
    reads,
    readPartner: async (id) => { reads.push(id); return records.find((record) => record.id === id) || null },
    readChildren: async (ids) => records.filter((record) => ids.includes(record.mergedIntoPartnerId)),
  }
}

test('cluster resolves a chained historical merge and all descendants without reading unrelated partners', async () => {
  const source = reader([{ id: 'root' }, { id: 'old', mergedIntoPartnerId: 'middle' }, { id: 'middle', mergedIntoPartnerId: 'root' }, { id: 'other' }])
  const cluster = await loadPartnerCluster('old', source)
  assert.equal(cluster.root.id, 'root')
  assert.deepEqual(cluster.members.map((member) => member.id).sort(), ['middle', 'old', 'root'])
  assert.deepEqual(source.reads, ['old', 'middle', 'root'])
})

test('cluster fails clearly on missing, cyclic, and invalid redirect targets', async () => {
  assert.deepEqual(await loadPartnerCluster('missing', reader([])), { root: null, members: [] })
  await assert.rejects(loadPartnerCluster('a', reader([{ id: 'a', mergedIntoPartnerId: 'b' }])), /nicht vorhanden/)
  await assert.rejects(loadPartnerCluster('a', reader([{ id: 'a', mergedIntoPartnerId: 'b' }, { id: 'b', mergedIntoPartnerId: 'a' }])), /Zyklische/)
  await assert.rejects(loadPartnerCluster('a', reader([{ id: 'a', status: 'merged' }])), /ohne aktives/)
})
