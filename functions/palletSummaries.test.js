import assert from 'node:assert/strict'
import test from 'node:test'
import { accountFromBuckets, applyMovementToBucket, movementBucketId, palletTourNumberKey, requirePalletAccess, savePalletRecordHandler, advancePalletSummaryRebuild, rebuildPalletSummariesHandler } from './palletSummaries.js'
import { summarizePalletAccount, isPalletMovementForPartner } from '../src/lib/palletAccountCalculations.js'

test('participant buckets preserve every cluster intersection, including legacy precedence and internal transfers', () => {
  const movements = Array.from({ length: 90 }, (_, index) => ({ id: String(index), date: '2026-10-31', partnerId: index % 3 ? null : ['a','b','c'][index % 4 % 3], customerId: ['a','b','c'][index % 3], carrierId: ['c','b','a'][Math.floor(index / 3) % 3], carrierBalance: index - 20, customerBalance: 20 - index, incoming: index % 4, outgoing: index % 7 }))
  const buckets = new Map()
  movements.forEach((movement) => { const key = movementBucketId(movement); buckets.set(key, applyMovementToBucket(buckets.get(key), movement, 1)) })
  for (let mask = 1; mask < 8; mask += 1) {
    const members = ['a','b','c'].filter((_, index) => mask & (1 << index))
    const expected = summarizePalletAccount(movements.filter((movement) => isPalletMovementForPartner(movement, members[0], members)), [], members[0], members)
    const actual = accountFromBuckets([...buckets.values()], [], members)
    assert.equal(actual.totalIncoming, expected.totalIncoming)
    assert.equal(actual.totalOutgoing, expected.totalOutgoing)
    assert.equal(actual.balance, expected.balance)
  }
  movements.forEach((movement) => { const key = movementBucketId(movement); buckets.set(key, applyMovementToBucket(buckets.get(key), movement, -1)) })
  assert.deepEqual(accountFromBuckets([...buckets.values()], [], ['a','b','c']), { totalIncoming: 0, totalOutgoing: 0, balance: 0, latestClosing: null })
})
test('pallet access requires assigned module level, administrators have no implicit override', () => {
  for (const profile of [{ role: 'admin' }, { permissions: { pallets: 'none' } }, {}]) assert.throws(() => requirePalletAccess(profile), { code: 'permission-denied' })
  requirePalletAccess({ permissions: { pallets: 'view' } })
  assert.throws(() => requirePalletAccess({ permissions: { pallets: 'view' } }, 'edit'), { code: 'permission-denied' })
  requirePalletAccess({ role: 'superadmin' }, 'edit')
})
test('tour keys preserve the existing trimmed case-insensitive link semantics', () => { assert.equal(palletTourNumberKey('  AbC-123  '), 'abc-123') })

test('malformed dates, fractional station counts and numeric coercion objects never reach persistence', async () => {
 const base={tourNumber:'TA-1',date:'2026-10-31',customerId:'a',loadingPoint:{received:0,delivered:1},unloadingPoint:{}}
 const options={db:{},authorize:async()=>({role:'superadmin'})}
 for(const values of [{...base,date:'2026-02-31'},{...base,loadingPoint:{received:0,delivered:0.5}},{...base,loadingPoint:{received:true,delivered:1}},{...base,loadingPoint:{received:0,delivered:Number.MAX_SAFE_INTEGER},unloadingPoint:{delivered:Number.MAX_SAFE_INTEGER}}]) {
  await assert.rejects(savePalletRecordHandler({auth:{uid:'u'},data:{kind:'movement',action:'create',operationId:'invalid-operation-id',values}},options),{code:'invalid-argument'})
 }
})

test('administrative rebuild core accepts an explicit database client and preserves the completed-state no-op', async () => {
 let transactions=0, reads=0
 const db={doc:(path)=>({path}),runTransaction:async operation=>{transactions++;return operation({get:async ref=>{reads++;assert.equal(ref.path,'palletSummaryState/current');return{data:()=>({version:1,status:'ready',generation:'complete'})}}})}}
 assert.deepEqual(await advancePalletSummaryRebuild(db),{complete:true})
 assert.equal(transactions,1);assert.equal(reads,1)
})
test('public rebuild callable still rejects anonymous and non-superadmin calls before accessing rebuild state', async () => {
 const db={runTransaction:()=>{assert.fail('unauthorized rebuild reached persistence')}}
 await assert.rejects(rebuildPalletSummariesHandler({}, {db}),{code:'unauthenticated'})
 await assert.rejects(rebuildPalletSummariesHandler({auth:{uid:'admin'},data:{}},{db,authorize:async()=>({active:true,role:'admin'})}),{code:'permission-denied'})
})
