import assert from 'node:assert/strict'
import test from 'node:test'
import { orderFinancialDocumentGroups, orderFinancialDocumentOriginal } from './orderFinancialDocuments.js'

test('groups by partner side and preserves original, cancellation and new invoice separately', () => {
  const documents = [
    { sourceId: '1', side: 'customer', internalNumber: '66718', cancelled: true },
    { sourceId: '2', side: 'customer', internalNumber: '66718', originalDocumentSourceId: '1' },
    { sourceId: '3', side: 'customer', internalNumber: '66821' },
    { sourceId: '4', side: 'carrier', internalNumber: '118538', externalNumber: 'EXT/2026/7' },
  ]
  const groups = orderFinancialDocumentGroups(documents)
  assert.deepEqual(groups.map(group => group.entries.length), [3, 1, 0])
  assert.notEqual(groups[0].entries[0].anchor, groups[0].entries[1].anchor)
  assert.equal(orderFinancialDocumentOriginal(documents[1], groups).document, documents[0])
  assert.equal(groups[1].entries[0].document.externalNumber, 'EXT/2026/7')
})

test('unconfirmed side stays separate; missing source links never guess by matching numbers', () => {
  const documents = [{ sourceId: '1', side: 'customer', internalNumber: '55' }, { id: 'legacy', side: 'unknown', internalNumber: '55', originalDocumentSourceId: 'missing' }, { id: 'other', side: '__proto__' }]
  const groups = orderFinancialDocumentGroups(documents)
  assert.deepEqual(groups.map(group => group.entries.length), [1, 0, 2])
  assert.equal(orderFinancialDocumentOriginal(documents[1], groups), null)
  assert.equal(orderFinancialDocumentOriginal({ originalDocumentNumber: '55' }, groups), null)
})
