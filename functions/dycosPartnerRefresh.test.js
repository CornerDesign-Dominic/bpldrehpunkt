import assert from 'node:assert/strict'
import test from 'node:test'
import { dycosPartnerRefreshAccounts, dycosPartnerRefreshTargets } from './shared/dycosPartnerRefresh.js'

test('refresh options include only valid stored accounts, deduplicated by role, with primaries first', () => {
  const partner = { debtorNumber: '10001', creditorNumber: '70001', dycosReferences: { debtorNumbers: ['10001', '10002', '001', 'abc'], creditorNumbers: ['70002'], accounts: [{ entity: 'customer', number: '10002', sourceId: '1' }, { entity: 'carrier', number: '70001', sourceId: '2' }, { entity: 'other', number: '123' }] } }
  assert.deepEqual(dycosPartnerRefreshAccounts(partner), [{ typ: 'kunde', nummer: '10001' }, { typ: 'kunde', nummer: '10002' }, { typ: 'utn', nummer: '70001' }, { typ: 'utn', nummer: '70002' }])
  assert.deepEqual(dycosPartnerRefreshTargets(partner), [{ typ: 'kunde', nummer: '10001' }, { typ: 'utn', nummer: '70001' }])
  assert.deepEqual(dycosPartnerRefreshAccounts({ debtorNumber: '2147483648', creditorNumber: '', dycosReferences: { debtorNumbers: '123', accounts: {} } }), [])
})

test('refresh never guesses between aliases when a primary account is missing', () => {
  assert.deepEqual(dycosPartnerRefreshTargets({ dycosReferences: { debtorNumbers: ['10001'] } }), [{ typ: 'kunde', nummer: '10001' }])
  assert.equal(dycosPartnerRefreshTargets({ dycosReferences: { debtorNumbers: ['10001', '10002'] } }), null)
  assert.deepEqual(dycosPartnerRefreshTargets({}), [])
})
