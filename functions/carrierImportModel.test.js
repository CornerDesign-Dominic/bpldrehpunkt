import assert from 'node:assert/strict'
import test from 'node:test'
import { carrierActions, carrierAdditions, carrierDecisionDetails, carrierIdentity, carrierPayload, carrierReadPath, carrierReviewId, hasCarrierImportAccess, sameCarrierValue } from './carrierImportModel.js'

const row = { creditorNumber: '75397', companyName: 'Spedition GmbH', data: { linkedDebtorNumber: '', street: 'Musterstraße 1', city: 'Berlin', country: 'DE', postalCode: '10115', vatId: 'DE123', taxNumber: '12', website: 'www.example.test', contacts: [{ id: '1', name: 'Anna', email: 'anna@example.test' }], paymentTermsOriginal: '45 Tage Netto', paymentTermDays: 45, iban: 'DE123', bic: 'TESTDEFF', ibanVerifiedAt: '21.09.2026', dycosCreatedAt: '01.01.2020', timocomNumber: '42' } }

test('new creditor without opposite ID creates an independent partner', () => {
  assert.equal(carrierIdentity([], row.creditorNumber, '').assignment.kind, 'new')
  const payload = carrierPayload(row, 'run-a', 'now')
  assert.equal(payload.id, 'dycos-creditor-75397')
  assert.equal(payload.creditorNumber, '75397')
  assert.deepEqual(payload.dycosReferences, { creditorNumbers: ['75397'], debtorNumbers: [] })
  assert.equal(payload.bankData.iban, 'DE123')
  assert.equal(payload.bankData.ibanVerifiedAt, '21.09.2026')
  assert.equal(payload.dycosCreatedAt, '01.01.2020')
  assert.equal(payload.paymentTermDays, '45 Tage Netto')
  assert.deepEqual(carrierActions(null, row, { created: true }), ['created'])
})

test('exact creditor match wins and re-import keeps one stable review identity', () => {
  const partner = { id: 'A', creditorNumber: '75397', dycosReferences: { creditorNumbers: ['75397'] } }
  const match = carrierIdentity([partner], '75397', '')
  assert.equal(match.partner.id, 'A')
  assert.deepEqual(match.assignment, { kind: 'creditor', number: '75397' })
  assert.equal(carrierReviewId(' 75397 '), carrierReviewId(75397))
  assert.deepEqual(carrierActions(partner, row, {}), ['unchanged'])
})

test('unknown creditor with exact debtor match adds the number to that same partner', () => {
  const partner = { id: 'A', debtorNumber: '10689', creditorNumber: '', dycosReferences: { debtorNumbers: ['10689'], creditorNumbers: [] }, companyName: row.companyName, address: {}, contact: {}, companyData: {}, contacts: [] }
  const withDebtor = { ...row, data: { ...row.data, linkedDebtorNumber: '10689' } }
  const match = carrierIdentity([partner], '75397', '10689')
  assert.equal(match.partner.id, 'A')
  assert.equal(match.merge, null)
  const additions = carrierAdditions(partner, withDebtor)
  assert.equal(additions.patch.creditorNumber, '75397')
  assert.deepEqual(additions.patch.dycosReferences.creditorNumbers, ['75397'])
  assert.ok(carrierActions(partner, withDebtor, additions.patch).includes('creditorAdded'))
})

test('two exact IDs on different active partners require a conscious merge', () => {
  const found = carrierIdentity([{ id: 'A', creditorNumber: '75397' }, { id: 'B', debtorNumber: '10689' }], '75397', '10689')
  assert.deepEqual(found.merge.partnerIds, ['A', 'B'])
  assert.equal(found.merge.suggestedTargetId, 'A')
})

test('name and VAT ID are never matching keys; equal VAT across branches is allowed', () => {
  const partners = [{ id: 'A', companyName: row.companyName, companyData: { vatId: 'DE123' }, creditorNumber: '100' }]
  assert.equal(carrierIdentity(partners, '200', '').partner, null)
  assert.equal(carrierIdentity(partners, '200', '').assignment.kind, 'new')
})

test('an archived matching partner forwards to the active merged target', () => {
  const partners = [{ id: 'old', creditorNumber: '75397', mergedIntoPartnerId: 'new' }, { id: 'new', creditorNumber: '75397' }]
  assert.equal(carrierIdentity(partners, '75397', '').partner.id, 'new')
})

test('ambiguous exact references and broken archive forwarding never select a partner automatically', () => {
  assert.match(carrierIdentity([{ id: 'A', creditorNumber: '75397' }, { id: 'B', creditorNumber: '75397' }], '75397', '').ambiguity, /mehreren/)
  assert.match(carrierIdentity([{ id: 'old', creditorNumber: '75397', mergedIntoPartnerId: 'missing' }], '75397', '').ambiguity, /archiviertes/)
})

test('safe additions do not duplicate normalized emails or overwrite filled values', () => {
  const partner = { creditorNumber: '75397', dycosReferences: { creditorNumbers: ['75397'] }, companyName: 'Manuell GmbH', address: { street: '' }, contact: {}, companyData: { vatId: 'DE123' }, bankData: {}, contacts: [{ id: 'existing', name: '', email: 'ANNA@example.test' }] }
  const additions = carrierAdditions(partner, row)
  assert.equal(additions.patch.address.street, 'Musterstraße 1')
  assert.equal(additions.patch.bankData.iban, 'DE123')
  assert.equal(additions.patch.contacts.length, 1)
  assert.equal(additions.patch.contacts[0].name, 'Anna')
  assert.ok(additions.conflicts.some((item) => item.path === 'companyName'))
  assert.equal(carrierDecisionDetails(row, additions).comparisons[0].label, 'Unternehmer')
})

test('payment wording without a day count is stored as text without an extra review', () => {
  const ambiguous = { ...row, data: { ...row.data, paymentTermsOriginal: 'nach Vereinbarung', paymentTermDays: null } }
  const details = carrierDecisionDetails(ambiguous, { conflicts: [] })
  assert.deepEqual(details, { reasons: [], comparisons: [] })
  assert.equal(carrierPayload(ambiguous, 'run', 'now').paymentTermDays, 'nach Vereinbarung')
  assert.equal(carrierPayload(ambiguous, 'run', 'now').paymentTermsOriginal, 'nach Vereinbarung')
})

test('the same DyCoS wording converts a legacy numeric creditor target without conflict', () => {
  const existing = { creditorNumber: row.creditorNumber, paymentTermDays: 45, paymentTermsOriginal: '45 Tage Netto', dycosReferences: {}, address: {}, contact: {}, companyData: {}, bankData: {}, contacts: [] }
  const additions = carrierAdditions(existing, row)
  assert.equal(additions.patch.paymentTermDays, '45 Tage Netto')
  assert.ok(!additions.conflicts.some((item) => item.path === 'paymentTermDays'))
  const changed = carrierAdditions({ ...existing, paymentTermsOriginal: '14 Tage Netto' }, row)
  assert.ok(changed.conflicts.some((item) => item.path === 'paymentTermDays' && item.label === 'Zahlungsziel'))
  assert.equal(carrierReadPath(existing, 'paymentTermDays'), '45 Tage Netto')
})

test('creditor number types compare semantically and permissions require both rights', () => {
  assert.equal(sameCarrierValue('creditorNumber', 75397, '75397'), true)
  assert.equal(sameCarrierValue('creditorNumber', 75397, '75398'), false)
  assert.equal(hasCarrierImportAccess({ permissions: { dataImports: 'edit', masterData: 'edit' } }), true)
  assert.equal(hasCarrierImportAccess({ permissions: { dataImports: 'edit', masterData: 'view' } }), false)
  assert.equal(hasCarrierImportAccess({ role: 'superadmin' }), true)
})
