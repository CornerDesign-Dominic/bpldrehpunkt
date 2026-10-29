import assert from 'node:assert/strict'
import test from 'node:test'
import { businessPartnerHistoryChanges, mergePartnerHistoryPatch } from './businessPartnerHistory.js'

test('records individual fields including blank, removed, zero and false values without technical import metadata', () => {
  const before = { companyName: 'Alt', contact: { email: '', phone: '123' }, creditLimit: null, creditNoteProcedure: true }
  const after = { companyName: 'Neu', contact: { email: 'neu@example.test', phone: '' }, creditLimit: 0, creditNoteProcedure: false, dycosImport: { conflicts: [] }, updatedAt: 'now' }
  const changes = businessPartnerHistoryChanges(before, after)
  assert.deepEqual(changes.map((change) => [change.path, change.oldValue, change.newValue]), [
    ['companyName', 'Alt', 'Neu'], ['creditNoteProcedure', true, false], ['creditLimit', null, 0],
    ['contact.email', null, 'neu@example.test'], ['contact.phone', '123', null],
  ])
  assert.equal(changes.find((change) => change.path === 'creditLimit').category, 'creditLimit')
  assert.deepEqual(businessPartnerHistoryChanges(after, structuredClone(after)), [])
})

test('partial import patches preserve siblings and compare against actual old values', () => {
  const before = { companyName: 'Firma', contact: { phone: '123', email: '' }, bankData: { bic: 'BIC' } }
  const after = mergePartnerHistoryPatch(before, { contact: { email: 'office@example.test' }, bankData: { iban: 'DE-SYNTHETIC' } })
  assert.equal(after.contact.phone, '123')
  assert.equal(before.contact.email, '')
  assert.deepEqual(businessPartnerHistoryChanges(before, after).map((entry) => entry.path), ['contact.email', 'bankData.iban'])
})

test('contacts retain identity on reorder and portal credentials are never copied into history', () => {
  const before = { contacts: [{ id: 'a', name: 'A', phone: '1' }, { id: 'b', name: 'B' }], portals: [{ id: 'portal', name: 'Portal', accessNumber: 'OLD_SECRET' }] }
  const after = { contacts: [{ id: 'b', name: 'B' }, { id: 'a', name: 'A', phone: '2' }], portals: [{ id: 'portal', name: 'Portal', accessNumber: 'NEW_SECRET' }] }
  const changes = businessPartnerHistoryChanges(before, after)
  assert.equal(changes.length, 2)
  assert.match(changes[0].label, /A · Telefon/)
  assert.equal(changes[0].oldValue, '1')
  assert.equal(changes[0].newValue, '2')
  assert.doesNotMatch(JSON.stringify(changes), /OLD_SECRET|NEW_SECRET/)
  assert.equal(changes[1].newValue, 'Geschützt')
})
