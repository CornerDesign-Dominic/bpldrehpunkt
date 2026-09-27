import assert from 'node:assert/strict'
import test from 'node:test'
import { inkassoTodoPartnerValues } from './inkassoPartnerLinks.js'

test('inkasso-linked to-dos retain the selected canonical debtor role and ID', () => {
  const id = 'vorlaeufiger%20unternehmer/mit-sonderzeichen'
  assert.deepEqual(inkassoTodoPartnerValues({ debtorPartnerId: id, debtorName: 'Unternehmer ohne Kreditor', debtorPartnerRole: 'carrier' }), { carrierId: id, carrierName: 'Unternehmer ohne Kreditor' })
  assert.deepEqual(inkassoTodoPartnerValues({ debtorPartnerId: id, debtorName: 'Kunde ohne Debitor', debtorPartnerRole: 'customer' }), { customerId: id, customerName: 'Kunde ohne Debitor' })
  assert.deepEqual(inkassoTodoPartnerValues({ debtorPartnerId: id, debtorName: 'Altfalldaten' }), { carrierId: id, carrierName: 'Altfalldaten' })
  assert.deepEqual(inkassoTodoPartnerValues({ debtorPartnerRole: 'customer' }), {})
})
