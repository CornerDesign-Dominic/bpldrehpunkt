import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPartnerMergeDecisions, buildPartnerMergeRows, initialPartnerMergeDecisions, mergeComparison, mergeDecisionSummary, mergeValueWarning } from './partnerMergeDecisions.js'

const target = { id: 'a', companyName: 'Ziel GmbH', address: { street: '', city: 'Hamburg' }, contact: { email: 'ziel@example.test' }, contacts: [{ id: 'a1', name: '', email: 'Same@Example.test', phone: '' }] }
const source = { id: 'b', companyName: 'Quelle GmbH', address: { street: 'Hafenstraße 4', city: 'Berlin' }, contact: { email: '' }, contacts: [{ id: 'b1', name: 'Anne', email: 'same@example.test', phone: '+49 40 1234' }, { id: 'b2', name: 'Bela', email: 'bela@example.test', mobile: '0151 1234' }] }

test('source-only values are prefilled, target-only and equal values are omitted', () => {
  const rows = buildPartnerMergeRows(target, source)
  assert.equal(rows.find((row) => row.key === 'address.street')?.kind, 'addition')
  assert.equal(rows.find((row) => row.key === 'address.city')?.kind, 'conflict')
  assert.equal(rows.some((row) => row.key === 'contact.email'), false)
  assert.equal(rows.some((row) => row.key === 'contacts.0.email'), false)
  const decisions = initialPartnerMergeDecisions(rows)
  assert.equal(decisions['address.street'].value, 'Hafenstraße 4')
  assert.equal(mergeDecisionSummary(rows, decisions).open, 2)
  decisions['address.city'] = { value: 'Berlin', resolution: 'source' }
  decisions.companyName = { value: 'Ziel GmbH', resolution: 'target' }
  const applied = applyPartnerMergeDecisions(target, source, decisions)
  assert.equal(applied.patch.address.street, 'Hafenstraße 4')
  assert.equal(applied.patch.address.city, 'Berlin')
  assert.equal(applied.patch.companyName, undefined)
  assert.equal(applied.patch.contacts.length, 2)
  assert.equal(applied.patch.contacts[0].name, 'Anne')
  assert.equal(applied.patch.contacts[0].email, 'Same@Example.test')
  assert.equal(applied.patch.contacts[1].email, 'bela@example.test')
})

test('a conflicting value needs an explicit choice and records the actual manual result', () => {
  const rows = buildPartnerMergeRows(target, source)
  const decisions = initialPartnerMergeDecisions(rows)
  assert.throws(() => applyPartnerMergeDecisions(target, source, decisions), /Bitte über Firma entscheiden/)
  decisions.companyName = { value: 'Gemeinsame GmbH', resolution: 'manual' }
  decisions['address.city'] = { value: 'Hamburg', resolution: 'omit' }
  decisions['address.street'] = { value: '', resolution: 'manual' }
  const applied = applyPartnerMergeDecisions(target, source, decisions)
  assert.equal(applied.patch.companyName, 'Gemeinsame GmbH')
  assert.equal(applied.patch.address?.city, undefined)
  assert.equal(applied.patch.address?.street, undefined)
  assert.deepEqual(applied.audit.find((item) => item.key === 'address.street'), { key: 'address.street', label: 'Straße', sourceValue: 'Hafenstraße 4', targetValue: '', resultValue: '', resolution: 'manual' })
  assert.equal(source.address.street, 'Hafenstraße 4')
})

test('switching the target reverses source and target and resets suggested decisions', () => {
  const forward = buildPartnerMergeRows(target, source)
  const reverse = buildPartnerMergeRows(source, target)
  assert.equal(forward.find((row) => row.key === 'address.street')?.kind, 'addition')
  assert.equal(reverse.some((row) => row.key === 'address.street'), false)
  assert.equal(reverse.find((row) => row.key === 'contact.email')?.kind, 'addition')
  assert.equal(initialPartnerMergeDecisions(reverse)['contact.email'].value, 'ziel@example.test')
  const merge = { partners: [target, source] }
  assert.equal(mergeComparison(merge, 'a').rows.find((row) => row.key === 'address.city').sourceValue, 'Berlin')
  assert.equal(mergeComparison(merge, 'b').rows.find((row) => row.key === 'address.city').sourceValue, 'Hamburg')
})

test('manual contact result is kept and duplicate normalized emails are consolidated', () => {
  const rows = buildPartnerMergeRows(target, source)
  const decisions = initialPartnerMergeDecisions(rows)
  decisions.companyName = { value: 'Ziel GmbH', resolution: 'target' }
  decisions['address.city'] = { value: 'Hamburg', resolution: 'target' }
  decisions['contacts.1.email'] = { value: ' SAME@example.test ', resolution: 'manual' }
  const applied = applyPartnerMergeDecisions(target, source, decisions)
  assert.equal(applied.patch.contacts.length, 1)
  assert.equal(applied.patch.contacts[0].id, 'a1')
  assert.equal(applied.patch.contacts[0].email, ' SAME@example.test ')
  assert.equal(applied.patch.contacts[0].name, 'Bela')
  assert.equal(mergeValueWarning({ path: 'contact.email' }, 'keine E-Mail'), 'Die E-Mail-Adresse sieht ungewöhnlich aus.')
  assert.equal(mergeValueWarning({ path: 'contacts.0.phone' }, 'abc'), 'Die Telefonnummer sieht ungewöhnlich aus.')
})

test('merge compares and applies the full payment wording as one editable text field', () => {
  const legacyTarget = { paymentTermDays: 30, paymentTermsOriginal: '30 Tage Netto' }
  const textSource = { paymentTermDays: 'nach Vereinbarung', paymentTermsOriginal: 'nach Vereinbarung' }
  const rows = buildPartnerMergeRows(legacyTarget, textSource)
  assert.deepEqual(rows.map((row) => row.key), ['paymentTermDays'])
  assert.equal(rows[0].label, 'Zahlungsziel')
  assert.equal(rows[0].targetValue, '30 Tage Netto')
  assert.equal(mergeValueWarning(rows[0], 'nach Vereinbarung'), '')
  const result = applyPartnerMergeDecisions(legacyTarget, textSource, { paymentTermDays: { value: '14 Tage netto', resolution: 'manual' } })
  assert.equal(result.patch.paymentTermDays, '14 Tage netto')
})
