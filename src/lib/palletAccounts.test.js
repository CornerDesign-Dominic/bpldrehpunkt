import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizePalletAccount } from './palletAccountCalculations.js'

test('merged pallet accounts consolidate historical source movements without changing their IDs', () => {
  const movements = [
    { id: 'source-movement', date: '2026-09-01', carrierId: 'carrier-old', carrierBalance: 8, customerId: 'outside', customerBalance: -8 },
    { id: 'target-movement', date: '2026-09-02', carrierId: 'carrier-main', carrierBalance: -3, customerId: 'outside', customerBalance: 3 },
  ]
  const account = summarizePalletAccount(movements, [], 'carrier-main', ['carrier-main', 'carrier-old'])

  assert.equal(account.balance, 5)
  assert.equal(account.entries[0].id, 'source-movement')
  assert.equal(movements[0].carrierId, 'carrier-old')
})

test('a separated partner no longer contributes its historical pallet balance to the former target', () => {
  const movements = [
    { id: 'source-movement', date: '2026-09-01', carrierId: 'carrier-old', carrierBalance: 8 },
    { id: 'target-movement', date: '2026-09-02', carrierId: 'carrier-main', carrierBalance: -3 },
  ]

  assert.equal(summarizePalletAccount(movements, [], 'carrier-main', ['carrier-main', 'carrier-old']).balance, 5)
  assert.equal(summarizePalletAccount(movements, [], 'carrier-main', ['carrier-main']).balance, -3)
  assert.equal(summarizePalletAccount(movements, [], 'carrier-old', ['carrier-old']).balance, 8)
})

test('a merged customer account includes several historical customer movements and keeps a historical closing visible', () => {
  const movements = [
    { id: 'customer-origin-one', date: '2026-09-01', customerId: 'customer-old-one', customerBalance: 9, carrierId: 'outside', carrierBalance: -9 },
    { id: 'customer-origin-two', date: '2026-09-02', customerId: 'customer-old-two', customerBalance: -4, carrierId: 'outside', carrierBalance: 4 },
    { id: 'customer-main', date: '2026-09-03', customerId: 'customer-main', customerBalance: 3, carrierId: 'outside', carrierBalance: -3 },
  ]
  const closings = [{ id: 'closing-origin-one', date: '2026-09-04', partnerId: 'customer-old-one', adjustment: -2 }]
  const account = summarizePalletAccount(movements, closings, 'customer-main', ['customer-main', 'customer-old-one', 'customer-old-two'])

  assert.equal(account.totalIncoming, 12)
  assert.equal(account.totalOutgoing, 4)
  assert.equal(account.balance, 6)
  assert.deepEqual(account.entries.map((entry) => entry.id), ['customer-origin-one', 'customer-origin-two', 'customer-main', 'closing-origin-one'])
  assert.equal(movements[0].customerId, 'customer-old-one')
  assert.equal(closings[0].partnerId, 'customer-old-one')
})

test('a merged carrier account handles multiple origins and gives each separated carrier its own unchanged history back', () => {
  const movements = [
    { id: 'carrier-origin-one', date: '2026-09-01', carrierId: 'carrier-old-one', carrierBalance: 11 },
    { id: 'carrier-origin-two', date: '2026-09-02', carrierId: 'carrier-old-two', carrierBalance: -6 },
    { id: 'carrier-main', date: '2026-09-03', carrierId: 'carrier-main', carrierBalance: 2 },
  ]
  const allMemberIds = ['carrier-main', 'carrier-old-one', 'carrier-old-two']

  assert.equal(summarizePalletAccount(movements, [], 'carrier-main', allMemberIds).balance, 7)
  assert.equal(summarizePalletAccount(movements, [], 'carrier-main', ['carrier-main', 'carrier-old-two']).balance, -4)
  assert.equal(summarizePalletAccount(movements, [], 'carrier-old-one', ['carrier-old-one']).balance, 11)
  assert.equal(summarizePalletAccount(movements, [], 'carrier-old-two', ['carrier-old-two']).balance, -6)
  assert.deepEqual(movements.map((movement) => movement.carrierId), ['carrier-old-one', 'carrier-old-two', 'carrier-main'])
})
