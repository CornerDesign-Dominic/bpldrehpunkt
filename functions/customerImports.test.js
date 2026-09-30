import assert from 'node:assert/strict'
import test from 'node:test'
import { canApproveCustomerImportRow, canClaimCustomerImportRow, customerAdditions, customerImportDecisionDetails, customerImportMergeCandidate, customerPayload, customerReviewId, hasCustomerImportAccess, matchesDebtorReference, resolveCarrier, reviewedQueueRow, sameCustomerImportValue } from './customerImports.js'

const row = {
  debtorNumber: '10042',
  companyName: 'Frachtzahler GmbH',
  data: {
    street: 'Importstraße 7', country: 'DE', postalCode: '40210', city: 'Düsseldorf',
    paymentTermDays: 30, paymentTermsOriginal: '30 Tage Netto', creditNoteProcedure: true,
    language: 'de', vatId: 'DE123', taxNumber: '123/456', website: 'www.example.test',
    linkedCreditorNumber: '90001', contacts: [{ id: 'dycos-1', name: 'Anne', department: 'Disposition', phone: '', mobile: '', email: 'anne@example.test', website: '', raw: ['Anne'] }], rawValues: { Firma: 'Frachtzahler GmbH' },
  },
}

test('new customer payload contains both DyCoS identities on the same partner', () => {
  const payload = customerPayload(row, { id: 'run-1' }, 'now')
  assert.equal(payload.id, 'dycos-debtor-10042')
  assert.equal(payload.debtorNumber, '10042')
  assert.equal(payload.address.city, 'Düsseldorf')
  assert.equal(payload.paymentTermDays, '30 Tage Netto')
  assert.equal(payload.contacts[0].email, 'anne@example.test')
  assert.equal(payload.creditorNumber, '90001')
  assert.deepEqual(payload.dycosReferences, { debtorNumbers: ['10042'], creditorNumbers: ['90001'] })
})

test('existing customer is safely enriched without overwriting manual data or duplicating contacts', () => {
  const existing = {
    companyName: 'Frachtzahler GmbH', debtorNumber: '10042', address: { street: '', city: 'Düsseldorf' }, contact: { email: 'manual@example.test' }, companyData: {}, contacts: [{ id: 'dycos-1', name: '', department: '', email: 'anne@example.test' }], dycosReferences: { debtorNumbers: [] }, linkedCarrierReference: {}, creditNoteProcedure: false,
  }
  const change = customerAdditions(existing, row)
  assert.equal(change.patch.address.street, 'Importstraße 7')
  assert.equal(change.patch.contact.email, 'manual@example.test')
  assert.equal(change.patch.contact.website, 'www.example.test')
  assert.equal(change.patch.contacts.length, 1)
  assert.equal(change.patch.contacts[0].name, 'Anne')
  assert.equal(change.patch.creditorNumber, '90001')
})

test('conflicting manual master data requires review instead of an overwrite', () => {
  const change = customerAdditions({ companyName: 'Manuell GmbH', address: {}, contact: {}, companyData: {}, contacts: [], dycosReferences: {} }, row, null)
  assert.ok(change.conflicts.includes('companyName'))
  assert.equal(change.patch.companyName, undefined)
})

test('payment wording without a day count is valid text and does not require review', () => {
  const payload = customerPayload(row, { id: 'run-1' }, 'now')
  const safe = customerImportDecisionDetails({ row: { ...row, data: { ...row.data, unusualValues: [] } }, existing: null, payload, additions: { conflicts: [] }, carrier: { id: 'carrier-1' } })
  const ambiguous = customerImportDecisionDetails({ row: { ...row, data: { ...row.data, paymentTermDays: null, paymentTermsOriginal: 'nach Vereinbarung', unusualValues: [] } }, existing: null, payload, additions: { conflicts: [] }, carrier: { id: 'carrier-1' } })
  assert.deepEqual(safe, { reasons: [], comparisons: [] })
  assert.deepEqual(ambiguous, { reasons: [], comparisons: [] })
})

test('a legacy numeric target with the same DyCoS wording is safely converted to text', () => {
  const existing = { companyName: row.companyName, paymentTermDays: 30, paymentTermsOriginal: '30 Tage Netto', address: {}, contact: {}, companyData: {}, contacts: [], dycosReferences: {}, creditNoteProcedure: false }
  const additions = customerAdditions(existing, row)
  assert.equal(additions.patch.paymentTermDays, '30 Tage Netto')
  assert.ok(!additions.conflicts.includes('paymentTermDays'))
  const changed = customerAdditions({ ...existing, paymentTermsOriginal: '14 Tage Netto' }, row)
  assert.ok(changed.conflicts.includes('paymentTermDays'))
  const details = customerImportDecisionDetails({ row, existing: { ...existing, paymentTermsOriginal: '14 Tage Netto' }, payload: customerPayload(row, { id: 'run-1' }, 'now'), additions: changed })
  assert.equal(details.comparisons.find((item) => item.path === 'paymentTermDays').label, 'Zahlungsziel')
  assert.equal(details.comparisons.find((item) => item.path === 'paymentTermDays').current, '14 Tage Netto')
})

test('one partner with debtor and creditor references is found independently for both roles', () => {
  const dualRolePartner = { id: 'partner-dual', debtorNumber: '10689', creditorNumber: '75397', dycosReferences: { debtorNumbers: ['10690'], creditorNumbers: ['75398'] } }
  assert.equal(matchesDebtorReference(dualRolePartner, '10689'), true)
  assert.equal(matchesDebtorReference(dualRolePartner, '10690'), true)
  assert.equal(resolveCarrier([dualRolePartner], '75397')?.id, 'partner-dual')
  assert.equal(resolveCarrier([dualRolePartner], '75398')?.id, 'partner-dual')
})

test('a customer import keeps both identities on the same dual-role partner', () => {
  const change = customerAdditions({ companyName: row.companyName, debtorNumber: '10689', creditorNumber: '90001', address: {}, contact: {}, companyData: {}, contacts: [], dycosReferences: {}, creditNoteProcedure: false }, row)
  assert.deepEqual(change.patch.dycosReferences.debtorNumbers, ['10042'])
})

test('a creditor number without an existing partner stays on the imported customer and does not itself require review', () => {
  const payload = customerPayload(row, { id: 'run-1' }, 'now')
  const details = customerImportDecisionDetails({ row: { ...row, data: { ...row.data, unusualValues: [] } }, existing: null, payload, additions: { conflicts: [] }, carrier: null })
  assert.deepEqual(details, { reasons: [], comparisons: [] })
  assert.equal(payload.creditorNumber, '90001')
})

test('two separate partners for the imported debtor and creditor require a merge', () => {
  const merge = customerImportMergeCandidate({ id: 'partner-a' }, { id: 'partner-b' })
  assert.deepEqual(merge, { partnerIds: ['partner-a', 'partner-b'], suggestedTargetId: 'partner-a', debtorPartnerId: 'partner-a', creditorPartnerId: 'partner-b' })
  assert.equal(customerImportMergeCandidate({ id: 'partner-a' }, { id: 'partner-a' }), null)
})

test('a claimed review row cannot be claimed or completed contradictorily by another user', () => {
  const futureLock = { userId: 'user-a', expiresAt: { toMillis: () => Date.now() + 60_000 } }
  const row = { state: 'open', lock: futureLock }
  assert.equal(canClaimCustomerImportRow(row, 'user-a'), true)
  assert.equal(canClaimCustomerImportRow(row, 'user-b'), false)
  assert.equal(canApproveCustomerImportRow(row, 'user-a'), true)
  assert.equal(canApproveCustomerImportRow(row, 'user-b'), false)
})

test('re-importing the same debtor number addresses the same durable open review row', () => {
  assert.equal(customerReviewId('10689'), customerReviewId(' 10689 '))
  assert.equal(customerReviewId('10689'), 'customer-review-10689')
})

test('a numeric and textual creditor number are semantically equal, while a real concurrent change remains a conflict', () => {
  assert.equal(sameCustomerImportValue('linkedCreditorNumber', 75397, '75397'), true)
  assert.equal(sameCustomerImportValue('linkedCreditorNumber', ' 75397 ', 75397), true)
  assert.equal(sameCustomerImportValue('linkedCreditorNumber', '75397', '75398'), false)
})

test('a reviewed queue row moves from open to accepted immediately', () => {
  const completed = reviewedQueueRow({ id: 'customer-review-10689', state: 'open', debtorNumber: '10689' }, { type: 'reviewed' })
  assert.equal(completed.state, 'accepted')
  assert.equal(completed.approval.type, 'reviewed')
  assert.equal(canApproveCustomerImportRow(completed, 'user-a'), false)
})

test('the queue requires both import and master-data edit permission', () => {
  assert.equal(hasCustomerImportAccess({ permissions: { dataImports: 'edit', masterData: 'edit' } }), true)
  assert.equal(hasCustomerImportAccess({ permissions: { dataImports: 'edit', masterData: 'view' } }), false)
  assert.equal(hasCustomerImportAccess({ role: 'superadmin', permissions: {} }), true)
})
