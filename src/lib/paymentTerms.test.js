import assert from 'node:assert/strict'
import test from 'node:test'
import { paymentTermText } from './paymentTerms.js'

test('shows the DyCoS wording for legacy numeric records and keeps newer text edits', () => {
  assert.equal(paymentTermText({ paymentTermDays: 45, paymentTermsOriginal: '45 Tage Netto' }), '45 Tage Netto')
  assert.equal(paymentTermText({ paymentTermDays: 'nach Vereinbarung', paymentTermsOriginal: '45 Tage Netto' }), 'nach Vereinbarung')
  assert.equal(paymentTermText({ paymentTermDays: '', paymentTermsOriginal: '45 Tage Netto' }), '')
  assert.equal(paymentTermText({ paymentTermDays: 45 }), '45')
  assert.equal(paymentTermText({ paymentTermsOriginal: 'sofort' }), 'sofort')
})
