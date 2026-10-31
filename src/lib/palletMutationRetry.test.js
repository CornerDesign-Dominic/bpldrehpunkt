import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createPalletMutationRetrier } from './palletMutationRetry.js'

const fingerprint = async (value) => createHash('sha256').update(value).digest('hex')
function memoryStorage() {
 const entries = new Map()
 return { entries, getItem: (key) => entries.get(key), setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) }
}
test('lost mutation responses retain identity across retries, reordered input and reload without storing note contents', async () => {
 const store = memoryStorage(), seen = []
 let fail = true, number = 0
 const create = () => createPalletMutationRetrier({ send: async (data) => { seen.push(data.operationId); if (fail) throw { code:'functions/unavailable' }; return {id: data.operationId} }, userId: ()=>'user-a', randomId:()=>`operation-identity-${++number}`, fingerprint, storage:()=>store })
 const payload = {kind:'movement',action:'create',values:{note:'private note',date:'2026-10-31'}}
 await assert.rejects(create()(payload))
 assert(!JSON.stringify([...store.entries]).includes('private note'))
 fail=false
 const retry=create()
 await retry({values:{date:'2026-10-31',note:'private note'},action:'create',kind:'movement'})
 assert.equal(seen[0],seen[1]);assert.equal(store.entries.size,0)
 await retry(payload);assert.notEqual(seen[1],seen[2])
})
test('same input joins an in-flight mutation and confirmed validation refusal discards its identity', async () => {
 const store=memoryStorage();let calls=0, release
 const deferred=new Promise(resolve=>{release=resolve})
 const send=createPalletMutationRetrier({send:async()=>{calls++;await deferred;return{}},userId:()=> 'a',randomId:()=> 'operation-in-flight',fingerprint,storage:()=>store})
 const one=send({id:'x'}),two=send({id:'x'});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,1);release();await Promise.all([one,two])
 const refused=createPalletMutationRetrier({send:async()=>{throw{code:'functions/aborted'}},userId:()=> 'a',randomId:()=> 'operation-conflict',fingerprint,storage:()=>store})
 await assert.rejects(refused({id:'x'}));assert.equal(store.entries.size,0)
})
test('storage unavailable does not prevent saving, and identities remain scoped to the authenticated user', async () => {
 const store=memoryStorage(),seen=[];let user='a',count=0
 const send=createPalletMutationRetrier({send:async data=>{seen.push(data.operationId);throw{code:'unavailable'}},userId:()=>user,randomId:()=>`operation-user-${++count}`,fingerprint,storage:()=>store})
 await assert.rejects(send({id:'x'}));user='b';await assert.rejects(send({id:'x'}));assert.notEqual(seen[0],seen[1])
 const unavailable=createPalletMutationRetrier({send:async()=>({saved:true}),userId:()=>user,randomId:()=> 'operation-no-storage',fingerprint,storage:()=>{throw new Error('storage denied')}})
 assert.deepEqual(await unavailable({id:'x'}),{saved:true})
})
