import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseInvoiceAssignment, rankInvoiceAssignments } from './invoiceReviewAssignment.js'
const candidate = (ta, keys) => ({ ta, checks: keys.map(key => ({ key, color: 'green' })) })
test('carrier and matching price select a unique candidate without confirmation', () => {
  const a = candidate('261000001', ['issuer', 'net'])
  const b = candidate('261000002', ['issuer'])
  assert.equal(chooseInvoiceAssignment([b, a]).ta, a.ta)
  assert.equal(rankInvoiceAssignments([b, a])[0].ta, a.ta)
})
test('exact labelled reference and carrier identify order even with wrong invoice amount', () => {
  const a = candidate('261000001', ['issuer'])
  a.checks.push({ key: 'net', color: 'red' })
  assert.equal(chooseInvoiceAssignment([a], { explicitTa: a.ta }).ta, a.ta)
  assert.equal(chooseInvoiceAssignment([a]), null)
})
test('equal alternatives, incomplete lookups and recipient-only matches never assign', () => {
  const a = candidate('261000001', ['issuer', 'net'])
  assert.equal(chooseInvoiceAssignment([a, candidate('261000002', ['issuer', 'net'])]), null)
  assert.equal(chooseInvoiceAssignment([a], { complete: false }), null)
  assert.equal(chooseInvoiceAssignment([candidate('261000001', ['recipient', 'recipientVatId', 'net'])]), null)
})
test('independent route and date matches can assign despite mismatched price', () => {
  const a = candidate('261000001', ['issuer', 'loadingCity-0', 'unloadingDate-0'])
  a.checks.push({ key: 'net', color: 'red' })
  assert.equal(chooseInvoiceAssignment([a]).ta, a.ta)
})

test('route and separately documented delivery date can corroborate assignment', () => {
  const a = candidate('261000001', ['issuer', 'unloadingCity-0', 'deliveryDate-0'])
  assert.equal(chooseInvoiceAssignment([a]).ta, a.ta)
  assert.equal(chooseInvoiceAssignment([candidate('261000001', ['issuer', 'unloadingDate-0', 'deliveryDate-0'])]), null)
})

test('a company-name match proved by VAT is not counted as a second independent identity signal',()=>{
 const a=candidate('261000001',['issuer','issuerVatId']);a.checks[0].matchedBy='vatId'
 const ranked=rankInvoiceAssignments([a])[0]
 assert.equal(ranked.assignmentEvidence.issuer,false)
 assert.equal(ranked.assignmentEvidence.vat,true)
 assert.equal(ranked.assignmentEvidence.strong,false)
})
