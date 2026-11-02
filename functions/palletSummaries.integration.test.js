import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { PALLET_SUMMARY_STATE, advancePalletSummaryRebuild, listPalletAccountSummariesHandler, listTransportOrderPalletMovementsHandler, rebuildPalletSummariesHandler, savePalletRecordHandler } from './palletSummaries.js'

const request = (data) => ({ auth: { uid: 'tester' }, data })
const movement = (count) => ({ tourNumber: ' TA-1 ', date: '2026-10-31', customerId: 'a', carrierId: 'b', loadingPoint: { received: 0, delivered: count }, unloadingPoint: {}, note: '' })
test('emulator: resumed build, atomic mutation, replay, conflict, closing deletion, merge/separation, legacy and indexed tour links', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
 const app = initializeApp({ projectId: `demo-pallet-${Date.now()}` }, `pallet-${Date.now()}`), db = getFirestore(app)
 const authorize = async () => ({ role: 'superadmin' }), options = { db, authorize }
 const list = () => listPalletAccountSummariesHandler(request({}), options)
 const mutate = (data) => savePalletRecordHandler(request(data), options)
 try {
  await Promise.all(['a','b','c'].map((id) => db.doc(`businessPartners/${id}`).set({ companyName: id })))
  await db.doc('transportOrders/order').set({ externalNumber: 'ta-1' })
  const batch = db.batch(); for (let i=0; i<101; i++) batch.set(db.doc(`palletMovements/old-${String(i).padStart(3,'0')}`), { ...movement(1), carrierBalance: 1, customerBalance: -1 }); await batch.commit()
  assert.equal((await list()).mode, 'legacy')
  assert.equal((await listTransportOrderPalletMovementsHandler(request({ orderId: 'order' }), options)).movements.length, 101)
  const first = await advancePalletSummaryRebuild(db); assert.equal(first.complete, false)
  await assert.rejects(mutate({ kind:'movement', action:'create', operationId:'operation-locked-01', values:movement(2) }), { code:'failed-precondition' })
  let result; do { result = await advancePalletSummaryRebuild(db) } while (!result.complete)
  assert.equal((await list()).mode, 'summaries')
  const readPaths = []
  const boundedDb = { doc: (path) => db.doc(path), collection: (path) => { readPaths.push(path); return db.collection(path) }, runTransaction: (fn) => db.runTransaction(fn) }
  await listPalletAccountSummariesHandler(request({}), { db: boundedDb, authorize })
  assert(!readPaths.includes('palletMovements')); assert(!readPaths.includes('palletClosings'))
  const noRights = { db, authorize: async () => ({ role:'admin', permissions: { pallets:'none' } }) }
  await assert.rejects(listPalletAccountSummariesHandler(request({}), noRights), { code:'permission-denied' })
  await assert.rejects(savePalletRecordHandler(request({}), noRights), { code:'permission-denied' })
  await assert.rejects(listTransportOrderPalletMovementsHandler(request({ orderId:'order' }), { db, authorize: async()=>({ permissions:{pallets:'view'} }) }), { code:'permission-denied' })
  assert.equal((await listTransportOrderPalletMovementsHandler(request({ orderId: 'order' }), options)).mode, 'indexed')
  const before = (await list()).accounts.find((entry)=>entry.partner.id==='b').account.balance; assert.equal(before, 101)
  const create = { kind:'movement', action:'create', operationId:'operation-create-01', values:movement(5) }
  await mutate(create); await mutate(create)
  assert.equal((await list()).accounts.find((entry)=>entry.partner.id==='b').account.balance,106)
  await mutate({ kind:'movement', action:'update', id:'operation-create-01', operationId:'operation-update-01', expectedRevision:1, values:movement(8) })
  await assert.rejects(mutate({ kind:'movement', action:'update', id:'operation-create-01', operationId:'operation-update-02', expectedRevision:1, values:movement(999) }), {code:'aborted'})
  assert.equal((await list()).accounts.find((entry)=>entry.partner.id==='b').account.balance,109)
  await db.doc('businessPartners/b').update({ mergedIntoPartnerId:'a', status:'merged' })
  assert.equal((await list()).accounts.find((entry)=>entry.partner.id==='a').account.balance,0)
  await db.doc('businessPartners/b').update({ mergedIntoPartnerId:null, status:'active' })
  assert.equal((await list()).accounts.find((entry)=>entry.partner.id==='b').account.balance,109)
  for (let i=0;i<3;i++) await mutate({kind:'closing',action:'create',operationId:`operation-closing-${i}`,values:{partnerId:'b',date:`2026-10-${20+i}`,adjustment:2,previousBalance:0,newBalance:2}})
  assert.equal((await list()).accounts.find((entry)=>entry.partner.id==='b').account.balance,115)
  await mutate({kind:'closing',action:'update',id:'operation-closing-2',operationId:'operation-closing-update',expectedRevision:1,values:{date:'2026-10-01',adjustment:-4}})
  let account=(await list()).accounts.find((entry)=>entry.partner.id==='b').account; assert.equal(account.balance,109); assert.equal(account.latestClosing.date,'2026-10-21')
  await mutate({kind:'closing',action:'delete',id:'operation-closing-1',operationId:'operation-closing-delete',expectedRevision:1})
  account=(await list()).accounts.find((entry)=>entry.partner.id==='b').account; assert.equal(account.balance,107); assert.equal(account.latestClosing.date,'2026-10-20')
  await mutate({kind:'movement',action:'delete',id:'operation-create-01',operationId:'operation-movement-delete',expectedRevision:2})
  assert.equal((await list()).accounts.find((entry)=>entry.partner.id==='b').account.balance,99)
  assert.equal((await db.doc(PALLET_SUMMARY_STATE).get()).data().status,'ready')
  // Simulate the atomically invalidated legacy reference rewrite. A fresh build
  // must preserve missing historic timestamps and exact latest-closing ties.
  await db.doc(PALLET_SUMMARY_STATE).update({status:'dirty',tourCoverage:false})
  await db.doc('palletClosings/historical-a').set({partnerId:'b',date:'2027-01-01',adjustment:3})
  await db.doc('palletClosings/historical-z').set({partnerId:'b',date:'2027-01-01',adjustment:4})
  let built; do { built=await rebuildPalletSummariesHandler(request({}),options) } while(!built.complete)
  assert.equal((await list()).accounts.find(entry=>entry.partner.id==='b').account.latestClosing.id,'historical-z')
  await mutate({kind:'closing',action:'delete',id:'historical-z',operationId:'historical-delete-z',expectedRevision:0})
  assert.equal((await list()).accounts.find(entry=>entry.partner.id==='b').account.latestClosing.id,'historical-a')
 } finally { await deleteApp(app) }
})

test('emulator: concurrent updates/replays, changed participant bucket, malformed timestamps and binary closing tie order', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
 const app=initializeApp({projectId:`demo-pallet-review-${Date.now()}`},`pallet-review-${Date.now()}`),db=getFirestore(app)
 const options={db,authorize:async()=>({role:'superadmin'})}
 const mutate=data=>savePalletRecordHandler(request(data),options)
 const list=()=>listPalletAccountSummariesHandler(request({}),options)
 try {
  await Promise.all(['a','b','c'].map(id=>db.doc(`businessPartners/${id}`).set({companyName:id})))
  // Invalid historic timestamp types had the same effective zero value as
  // missing timestamps in the existing detail sorter.
  for(const [id,createdAt] of [['Z','invalid'],['a',{bad:true}],['z',null]]) await db.doc(`palletClosings/${id}`).set({partnerId:'b',date:'2026-01-01',createdAt,adjustment:1})
  let built;do{built=await rebuildPalletSummariesHandler(request({}),options)}while(!built.complete)
  assert.equal((await list()).accounts.find(entry=>entry.partner.id==='b').account.latestClosing.id,'z')
  await mutate({kind:'closing',action:'delete',id:'z',operationId:'review-delete-latest',expectedRevision:0})
  assert.equal((await list()).accounts.find(entry=>entry.partner.id==='b').account.latestClosing.id,'a')
  const create={kind:'movement',action:'create',operationId:'review-create-first',values:movement(5)}
  await Promise.all([mutate(create),mutate(create)])
  assert.equal((await db.collection('palletMovements').get()).size,1)
  const common={kind:'movement',action:'update',id:create.operationId,expectedRevision:1}
  const results=await Promise.allSettled([mutate({...common,operationId:'review-update-first',values:movement(6)}),mutate({...common,operationId:'review-update-second',values:movement(7)})])
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1)
  assert.equal(results.find(result=>result.status==='rejected').reason.code,'aborted')
  const current=(await db.doc(`palletMovements/${create.operationId}`).get()).data()
  await mutate({kind:'movement',action:'update',id:create.operationId,expectedRevision:2,operationId:'review-change-participants',values:{...movement(9),carrierId:'c'}})
  const accounts=(await list()).accounts
  assert.equal(accounts.find(entry=>entry.partner.id==='a').account.balance,-9)
  assert.equal(accounts.find(entry=>entry.partner.id==='b').account.balance,2)
  assert.equal(accounts.find(entry=>entry.partner.id==='c').account.balance,9)
  assert.equal(current.revision,2)
  await assert.rejects(mutate({kind:'movement',action:'delete',id:create.operationId,expectedRevision:2,operationId:'review-delete-stale'}),{code:'aborted'})
  const updateClosing={kind:'closing',action:'update',id:'a',expectedRevision:0,operationId:'review-update-closing',values:{partnerId:'c',date:'2026-01-02',adjustment:3}}
  await mutate(updateClosing);await mutate(updateClosing)
  assert.equal((await db.doc('palletClosings/a').get()).data().partnerId,'b')
  assert.equal((await list()).accounts.find(entry=>entry.partner.id==='b').account.balance,4)
 } finally{await deleteApp(app)}
})

test('emulator: a historic cluster member without companyName remains included in the overview', {skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
 const app=initializeApp({projectId:`demo-pallet-legacy-${Date.now()}`},`pallet-legacy-${Date.now()}`),db=getFirestore(app)
 const options={db,authorize:async()=>({role:'superadmin'})}
 try{
  await db.doc('businessPartners/root').set({companyName:'Root'})
  await db.doc('businessPartners/unnamed').set({status:'merged',mergedIntoPartnerId:'root'})
  await db.doc('palletMovements/legacy').set({date:'2026-10-31',partnerId:'unnamed',incoming:7,outgoing:2})
  const list=()=>listPalletAccountSummariesHandler(request({}),options)
  assert.equal((await list()).accounts.find(entry=>entry.partner.id==='root').account.balance,5)
  let done;do{done=await rebuildPalletSummariesHandler(request({}),options)}while(!done.complete)
  assert.equal((await list()).accounts.find(entry=>entry.partner.id==='root').account.balance,5)
 }finally{await deleteApp(app)}
})
