import assert from 'node:assert/strict'
import test from 'node:test'
import { responsibilityLabel, transportOrderNumbers } from './todoListPresentation.js'

test('todo list and table use the same labels for personal, departmental and group responsibility', () => {
  assert.equal(responsibilityLabel({ audienceType: 'person', audienceId: 'user', creatorUserId: 'user' }), 'Persönlich')
  assert.equal(responsibilityLabel({ audienceType: 'person', audienceId: 'other', creatorUserId: 'user', audienceLabel: 'Other' }), 'Other')
  assert.equal(responsibilityLabel({ audienceType: 'department', audienceId: 'Disposition' }), 'Disposition')
  assert.equal(responsibilityLabel({ audienceType: 'all' }), 'Alle')
  assert.equal(responsibilityLabel({ audienceType: 'people', audienceIds: ['a', 'b'] }), 'Personengruppe')
  assert.equal(responsibilityLabel({ audienceType: 'people', audienceIds: ['a'], audienceLabel: 'Personen: Example' }), 'Example')
})

test('todo transport numbers preserve multiple links and the historical single-order reference', () => {
  assert.deepEqual(transportOrderNumbers({ transportOrderLinks: [{ id: 'order-a', number: ' 123 ' }, { id: 'order-b' }] }), ['123', 'order-b'])
  assert.deepEqual(transportOrderNumbers({ transportOrderId: 'legacy', reference: '456' }), ['456'])
  assert.deepEqual(transportOrderNumbers({}), [])
})
