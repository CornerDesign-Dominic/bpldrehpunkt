import assert from 'node:assert/strict'
import test from 'node:test'
import { casePartnerFields, partnerClusterSearchNames, partnerReferenceName, presentCasePartnerReferences, presentPartnerReferences } from './partnerReferenceNames.js'

test('all case lists retain exact original identities/snapshots while displaying and searching the current partner', () => {
  const partners = [{ id: 'a', companyName: 'Archivname', status: 'merged', mergedIntoPartnerId: 'b' }, { id: 'b', companyName: 'Aktueller Name', status: 'active' }]
  for (const [type, fields] of Object.entries(casePartnerFields)) {
    const record = { id: `case-${type}`, untouched: { amount: 7 } }
    for (const [id, name] of fields) { record[id] = 'a'; record[name] = 'Historischer Name' }
    const before = structuredClone(record)
    const [shown] = presentCasePartnerReferences([record], type, partners)
    assert.deepEqual(record, before)
    for (const [id, name] of fields) {
      assert.equal(shown[id], 'a')
      assert.equal(shown[name], 'Historischer Name')
      assert.equal(partnerReferenceName(shown, name), 'Aktueller Name')
    }
    for (const name of ['Historischer Name', 'Archivname', 'Aktueller Name']) assert.ok(shown.partnerSearchText.includes(name))
  }
})

test('separation changes display and search membership without changing persisted values', () => {
  const record = { id: 'case', debtorPartnerId: 'a', debtorName: 'Anfang' }
  const root = { id: 'b', companyName: 'Ziel' }
  let [shown] = presentCasePartnerReferences([record], 'inkasso', [{ id: 'a', companyName: 'A', mergedIntoPartnerId: 'b' }, root])
  assert.equal(partnerReferenceName(shown, 'debtorName'), 'Ziel')
  ;[shown] = presentCasePartnerReferences([record], 'inkasso', [{ id: 'a', companyName: 'Wieder eigenständig' }, root])
  assert.equal(partnerReferenceName(shown, 'debtorName'), 'Wieder eigenständig')
  assert.equal(shown.partnerSearchText.includes('Ziel'), false)
  assert.equal(shown.debtorPartnerId, 'a')
})

test('module access denial never consults a retained directory or reveals current names', () => {
  const record = { customerId: 'a', customerName: 'Gespeichert' }
  const unreadable = { get() { throw new Error('directory must not be read') } }
  const shown = presentPartnerReferences(record, casePartnerFields.todo, unreadable, false)
  assert.equal(partnerReferenceName(shown, 'customerName'), 'Gespeichert')
  assert.equal(shown.partnerReferenceFailed, false)
  assert.equal(shown.partnerSearchText, 'Gespeichert')
})

test('corrupt or missing redirects remain visible as a resolution failure, with the original name intact', () => {
  for (const partners of [[], [{ id: 'a', mergedIntoPartnerId: 'missing' }], [{ id: 'a', mergedIntoPartnerId: 'b' }, { id: 'b', mergedIntoPartnerId: 'a' }]]) {
    const [shown] = presentCasePartnerReferences([{ id: 'case', partnerId: 'a', partnerName: 'Original' }], 'insolvency', partners)
    assert.equal(shown.partnerReferenceFailed, true)
    assert.equal(partnerReferenceName(shown, 'partnerName'), 'Original')
  }
})

test('partner overview searches include all current cluster names and discard detached aliases after splitting', () => {
  const members = [{ id: 'a', companyName: 'A', shortName: 'Alias A', mergedIntoPartnerId: 'b' }, { id: 'b', companyName: 'B' }]
  assert.deepEqual(partnerClusterSearchNames(members).get('b'), ['A', 'Alias A', 'B'])
  delete members[0].mergedIntoPartnerId
  const detached = partnerClusterSearchNames(members)
  assert.deepEqual(detached.get('a'), ['A', 'Alias A'])
  assert.deepEqual(detached.get('b'), ['B'])
})
