import assert from 'node:assert/strict'
import test from 'node:test'
import { linkedTodoCreationMessage, linkedTodoPartnerChoices, linkedTodoSubmission } from './linkedTodoCreation.js'

const fixed = { field: 'damageCaseId', id: 'case% with space', values: { customerId: 'origin', customerName: 'Historical customer', carrierId: 'old-carrier', carrierName: 'Historical carrier', reference: 'Original reference' } }

test('failed saves give actionable messages without claiming that an unknown write definitely failed', () => {
  const denied = linkedTodoCreationMessage({ code: 'permission-denied', message: 'Missing or insufficient permissions' })
  assert.match(denied, /Verknüpfungen und deine Berechtigungen/)
  assert.equal(linkedTodoCreationMessage({ code: 'firestore/permission-denied' }), denied)
  for (const code of ['unavailable', 'deadline-exceeded', 'unknown']) assert.match(linkedTodoCreationMessage({ code }), /nicht bestätigt.*To-do-Liste/)
  assert.equal(linkedTodoCreationMessage(new Error('Bitte Titel und Zielgruppe erfassen.')), 'Bitte Titel und Zielgruppe erfassen.')
})

test('only the originating case is fixed; deliberate partner, reference and audience changes survive submission', () => {
  const values = { damageCaseId: 'forged-case', customerId: 'merge-target', customerName: 'Current target', carrierId: '', carrierName: '', reference: 'Changed reference', transportOrderLinks: [{ id: 'new-order', number: 'TA-2' }], audienceType: 'people', audienceIds: ['person-2'], dueDate: '2026-11-03', reminderDate: '2026-11-02', priority: 'high', title: 'Follow-up', description: 'Edited description' }
  const beforeValues = structuredClone(values), beforeFixed = structuredClone(fixed)
  const result = linkedTodoSubmission(values, fixed)
  assert.deepEqual(result, { ...beforeValues, damageCaseId: fixed.id })
  assert.deepEqual(values, beforeValues)
  assert.deepEqual(fixed, beforeFixed)
  assert.notEqual(result, values)
})

test('all four source cases retain inherited IDs without turning them into merge targets', () => {
  for (const field of ['damageCaseId', 'inkassoCaseId', 'insolvencyId', 'legalDisputeId']) {
    const values = { ...fixed.values, customerId: 'origin', transportOrderLinks: [] }
    const result = linkedTodoSubmission(values, { ...fixed, field })
    assert.equal(result.customerId, 'origin')
    assert.equal(result.carrierId, 'old-carrier')
    assert.equal(result[field], fixed.id)
  }
})

test('invalid fixed fields and source IDs fail before a write can be submitted', () => {
  for (const field of ['', 'customerId', 'creatorUserId', '__proto__', undefined]) assert.throws(() => linkedTodoSubmission({}, { field, id: 'case' }), { code: 'invalid-argument' })
  for (const id of ['', ' ', '.', '..', 'path/case', 'case\nother', 'case\u007f', 'a'.repeat(241), 42, null]) assert.throws(() => linkedTodoSubmission({}, { field: 'damageCaseId', id }), { code: 'invalid-argument' })
})

test('an inherited archived origin remains selectable without adding arbitrary archived partners', () => {
  const partners = [{ id: 'origin', companyName: 'Archived name', status: 'merged', mergedIntoPartnerId: 'merge-target', businessPartnerRoles: ['customer'] }, { id: 'merge-target', companyName: 'Current target', businessPartnerRoles: ['customer'] }, { id: 'other-archive', companyName: 'Other archive', status: 'merged', businessPartnerRoles: ['customer'] }, { id: 'carrier', companyName: 'Carrier', businessPartnerRoles: ['carrier'] }]
  const before = structuredClone(partners)
  const choices = linkedTodoPartnerChoices(partners, 'customer', fixed)
  assert.deepEqual(choices.map((choice) => choice.id), ['merge-target', 'origin'])
  assert.deepEqual(choices.at(-1), { id: 'origin', companyName: 'Historical customer', inheritedTodoOrigin: true })
  assert.deepEqual(linkedTodoPartnerChoices([], 'customer', fixed), [{ id: 'origin', companyName: 'Historical customer', inheritedTodoOrigin: true }])
  assert.deepEqual(linkedTodoPartnerChoices([], 'carrier', fixed), [{ id: 'old-carrier', companyName: 'Historical carrier', inheritedTodoOrigin: true }])
  assert.deepEqual(partners, before)
})

test('after separation the regular original option returns once and keeps its current name', () => {
  const partners = [{ id: 'origin', companyName: 'Independent again', businessPartnerRoles: ['customer'] }, { id: 'merge-target', companyName: 'Target', businessPartnerRoles: ['customer'] }]
  const choices = linkedTodoPartnerChoices(partners, 'customer', fixed)
  assert.deepEqual(choices.map((choice) => choice.id), ['origin', 'merge-target'])
  assert.equal(choices[0].companyName, 'Independent again')
  assert.equal(choices[0].inheritedTodoOrigin, undefined)
  assert.deepEqual(linkedTodoPartnerChoices(partners, 'carrier', null), [])
})
