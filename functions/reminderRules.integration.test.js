import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { collection, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, setLogLevel, terminate, updateDoc, writeBatch } from 'firebase/firestore'

// Uses the repository's existing SDK/mock-token pattern. The optional
// @firebase/rules-unit-testing package is not installed; this test loads the
// exact rules text through the equivalent LOCAL emulator rules endpoint.
test('reminder source rules preserve legacy edits, validate new schedules and deny private-state access', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
 const [host, portText] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
 assert(['127.0.0.1','localhost'].includes(host), 'Only a local Firestore emulator is allowed')
 const port=Number(portText);assert(Number.isInteger(port)&&port>0)
 // The emulator needs no ADC; prevent the SDK's automatic metadata probe.
 const previousMetadataDetection=process.env.METADATA_SERVER_DETECTION
 process.env.METADATA_SERVER_DETECTION='none'
 t.after(()=>{if(previousMetadataDetection===undefined)delete process.env.METADATA_SERVER_DETECTION;else process.env.METADATA_SERVER_DETECTION=previousMetadataDetection})
 const projectId=`demo-reminder-rules-${process.pid}`
 const response=await fetch(`http://${host}:${port}/emulator/v1/projects/${projectId}:securityRules`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}]}})})
 assert.equal(response.status,200,await response.text())
 const adminApp=initializeAdminApp({projectId},`${projectId}-admin`),admin=getAdminFirestore(adminApp),clients=[]
 const modules=['calendar','todos','damages','inkasso','legalDisputes','insolvencies']
 const profiles=[
  {uid:'editor',active:true,role:'user',permissions:Object.fromEntries(modules.map(key=>[key,'edit']))},
  {uid:'viewer',active:true,role:'user',permissions:Object.fromEntries(modules.map(key=>[key,'view']))},
  {uid:'other',active:true,role:'user',permissions:Object.fromEntries(modules.map(key=>[key,'edit']))},
  {uid:'disabled',active:false,role:'superadmin',permissions:{}},
  {uid:'super',active:true,role:'superadmin',permissions:{}},
  {uid:'wrong-module',active:true,role:'user',permissions:Object.fromEntries(modules.map(key=>[key,'none']))},
 ]
 setLogLevel('silent')
 try{
  for(const profile of profiles){
   await admin.doc(`users/${profile.uid}`).set({...profile,firstName:'Test',lastName:profile.uid,email:`${profile.uid}@example.invalid`})
   const app=initializeApp({projectId,apiKey:'emulator-only'},`${projectId}-${profile.uid}`),db=getFirestore(app)
   connectFirestoreEmulator(db,host,port,{mockUserToken:{sub:profile.uid}});clients.push({db,app,profile})
  }
  const editor=clients[0].db,viewer=clients[1].db,other=clients[2].db,superuser=clients[4].db
  const denied=async operation=>assert.rejects(operation,{code:'permission-denied'})
  const stamp=AdminTimestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
  const metadata={createdAt:stamp,createdBy:'editor',createdByName:'Test editor',updatedAt:stamp,updatedBy:'editor',updatedByName:'Test editor'}
  const actorUpdate=(uid='editor')=>({updatedAt:serverTimestamp(),updatedBy:uid,updatedByName:`Test ${uid}`})
  const nulls=keys=>Object.fromEntries(keys.map(key=>[key,null]))
  const parents={
   damageCases:{caseNumber:'S-2026-0001',caseYear:'2026',caseSequence:1,status:'new',damageDate:'2026-10-31',title:'S-2026-0001 – 2026-10-31',...nulls(['description','transportReference','claimant','contractor','responsibleUserId','responsibleUserName','openBplRisk']),damageAmount:0,...metadata},
   inkassoCases:{caseNumber:'I-2026-0001',title:'Test inkasso',description:null,status:'open',isClosed:false,...nulls(['debtorName','debtorNumber','debtorContactName','debtorAddress','debtorEmail','debtorPhone','responsibleUserId','responsibleUserName','invoiceNumbers','invoiceDate','originalDueDate','lastReminderDate','lawFirm','lawyerReference','lawFirmContactName','lawFirmEmail','lawFirmPhone','lawyerHandoverDate','court','courtReference','paymentOrderDate','enforcementOrderDate','completedAt']),titleAvailable:false,...metadata},
   legalDisputes:{caseNumber:'G-legacy',title:'Test legal',description:null,status:'open',isClosed:false,...nulls(['caseType','participant','counterparty','opposingCounsel','responsibleUserId','responsibleUserName','lawFirm','ownCounsel','lawyerReference','lawyerPhone','lawyerEmail','court','courtReference','judgeOrChamber','nextDeadline','nextDeadlineLabel','nextHearing','nextHearingTime','procedureType','proceedingStage','instance','startedAt','completedAt','originalClaim','counterClaim','amountInDispute','paidAmount','openAmount','legalFees','courtCosts','otherCosts']),...metadata},
   insolvencies:{partnerId:'case',partnerName:'Synthetic partner',...nulls(['insolvencyDate','knownDate','courtReference','courtVenue','description']),...metadata},
   todos:{title:'Test todo',description:'',dueDate:null,reminderDate:null,creatorUserId:'editor',creatorName:'Test editor',audienceType:'all',audienceId:null,audienceLabel:'Alle',assignedUserId:null,assignedUserName:null,assignedAt:null,status:'open',completedAt:null,completedByUserId:null,completedByName:null,withdrawnAt:null,withdrawnByUserId:null,createdAt:stamp,updatedAt:stamp},
  }
  for(const[root,value]of Object.entries(parents))await admin.doc(`${root}/case`).set(value)
  const deadline=(root,extra={},uid='editor')=>({date:'2026-10-25',time:'02:30',reminderEnabled:true,reminderOccurrence:'later',note:'Synthetic deadline',...(root==='legalDisputes'||root==='todos'?{type:'deadline'}:{}),...(root==='todos'?{calendarEntryId:'unused-test-entry'}:{}),createdAt:serverTimestamp(),createdBy:uid,createdByName:`Test ${uid}`,...actorUpdate(uid),...extra})
  const createDeadline=(db,root,id,extra={})=>{const uid=clients.find(entry=>entry.db===db).profile.uid;const batch=writeBatch(db);batch.update(doc(db,`${root}/case`),root==='todos'?{updatedAt:serverTimestamp()}:actorUpdate(uid));batch.set(doc(db,`${root}/case/deadlines/${id}`),deadline(root,extra,uid));return batch.commit()}
  const updateDeadline=(db,root,id,patch)=>{const uid=clients.find(entry=>entry.db===db).profile.uid;const batch=writeBatch(db);batch.update(doc(db,`${root}/case`),root==='todos'?{updatedAt:serverTimestamp()}:actorUpdate(uid));batch.update(doc(db,`${root}/case/deadlines/${id}`),{...patch,...actorUpdate(uid)});return batch.commit()}
  for(const root of Object.keys(parents))await t.test(`${root}: new reminders need no creator email, occurrence is allowed and source ACL is preserved`,async()=>{
   await createDeadline(editor,root,'new')
   assert.equal((await getDoc(doc(viewer,`${root}/case/deadlines/new`))).get('reminderOccurrence'),'later')
   assert.equal((await admin.doc(`${root}/case/deadlines/new`).get()).get('reminderRecipientEmail'),undefined)
   await createDeadline(editor,root,'legacy-client-create',{reminderRecipientEmail:'editor@example.invalid'})
   await denied(createDeadline(editor,root,'foreign-client-create',{reminderRecipientEmail:'other@example.invalid'}))
   await denied(createDeadline(viewer,root,'viewer'))
   await denied(createDeadline(clients[3].db,root,'inactive'))
   await denied(createDeadline(clients[5].db,root,'wrong-module'))
   if(root==='todos')await denied(createDeadline(other,root,'other-creator'));else await createDeadline(other,root,'other-editor')
   await denied(getDoc(doc(clients[3].db,`${root}/case/deadlines/new`)))
   await denied(getDoc(doc(clients[5].db,`${root}/case/deadlines/new`)))
   for(const[id,patch]of Object.entries({clock:{time:'24:00'},missingClock:{time:null},date:{date:'2026-02-30'},leap:{date:'2100-02-29'},occurrence:{reminderOccurrence:'first'},recipient:{reminderRecipientEmail:'forged@example.invalid'}}))await denied(createDeadline(editor,root,`invalid-${id}`,patch))
   await createDeadline(editor,root,'leap-valid',{date:'2028-02-29',time:'09:00',reminderOccurrence:null})
   await updateDeadline(editor,root,'new',{time:'02:45',reminderOccurrence:'earlier'})
   await denied(updateDeadline(editor,root,'new',{reminderRecipientEmail:'forged@example.invalid'}))
   const stored=(await admin.doc(`${root}/case/deadlines/new`).get()).data()
   await admin.doc(`${root}/case/deadlines/legacy`).set({...stored,reminderRecipientEmail:'legacy@example.invalid'})
   await updateDeadline(editor,root,'legacy',{note:'Updated note'})
   await denied(updateDeadline(editor,root,'legacy',{reminderRecipientEmail:'editor@example.invalid'}))
   await denied(updateDeadline(editor,root,'legacy',{reminderRecipientEmail:deleteField()}))
   const batch=writeBatch(editor);batch.update(doc(editor,`${root}/case`),root==='todos'?{updatedAt:serverTimestamp()}:actorUpdate());batch.delete(doc(editor,`${root}/case/deadlines/new`));await batch.commit()
   await denied(deleteDoc(doc(viewer,`${root}/case/deadlines/legacy`)))
  })
  await t.test('todo main: explicit new/changed time required, unchanged date-only legacy remains editable',async()=>{
   await admin.doc('todos/main-legacy').set({...parents.todos,reminderDate:'2026-10-31'})
   await updateDoc(doc(editor,'todos/main-legacy'),{description:'Ordinary edit',updatedAt:serverTimestamp()})
   await updateDoc(doc(editor,'todos/main-legacy'),{reminderTime:null,reminderOccurrence:null,description:'Normalized absent fields',updatedAt:serverTimestamp()})
   await denied(updateDoc(doc(editor,'todos/main-legacy'),{reminderDate:'2026-11-01',updatedAt:serverTimestamp()}))
   await denied(updateDoc(doc(editor,'todos/main-legacy'),{reminderTime:'25:00',updatedAt:serverTimestamp()}))
   await updateDoc(doc(editor,'todos/main-legacy'),{reminderTime:'09:00',reminderOccurrence:null,updatedAt:serverTimestamp()})
   await denied(updateDoc(doc(editor,'todos/main-legacy'),{reminderDate:'2026-11-02',reminderTime:null,updatedAt:serverTimestamp()}))
   const fresh={...parents.todos,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),reminderDate:'2026-11-01',reminderTime:'09:00',reminderOccurrence:null}
   await setDoc(doc(editor,'todos/new-main'),fresh)
   await denied(setDoc(doc(editor,'todos/new-main-invalid'),{...fresh,reminderTime:null}))
   await denied(updateDoc(doc(viewer,'todos/main-legacy'),{description:'Forbidden edit',updatedAt:serverTimestamp()}))
  })
  await t.test('calendar reminders preserve legacy events and calendar permissions',async()=>{
   await admin.doc('calendars/shared').set({name:'Shared',ownerUserId:'editor',kind:'shared',active:true})
   await admin.doc('calendarPermissions/shared_viewer').set({calendarId:'shared',userId:'viewer',level:'view'})
   const event={title:'Event',description:'',startDate:'2026-10-31',endDate:'2026-10-31',allDay:false,startTime:'09:00',endTime:'10:00',createdByUserId:'editor',createdAt:serverTimestamp(),updatedAt:serverTimestamp()}
   await setDoc(doc(editor,'calendars/shared/events/legacy'),event)
   await updateDoc(doc(editor,'calendars/shared/events/legacy'),{description:'Legacy event edit',updatedAt:serverTimestamp()})
   await updateDoc(doc(editor,'calendars/shared/events/legacy'),{reminderEnabled:true,reminderDate:'2026-10-25',reminderTime:'02:30',reminderOccurrence:'later',updatedAt:serverTimestamp()})
   for(const patch of [{reminderTime:null},{reminderDate:'2026-02-30'},{reminderTime:'23:60'},{reminderOccurrence:'second'}])await denied(updateDoc(doc(editor,'calendars/shared/events/legacy'),{...patch,updatedAt:serverTimestamp()}))
   await getDoc(doc(viewer,'calendars/shared/events/legacy'))
   await denied(updateDoc(doc(viewer,'calendars/shared/events/legacy'),{title:'Forbidden',updatedAt:serverTimestamp()}))
   await denied(getDoc(doc(other,'calendars/shared/events/legacy')))
   await denied(setDoc(doc(clients[3].db,'calendars/shared/events/disabled'),{...event,createdByUserId:'disabled'}))
   await denied(setDoc(doc(editor,'calendars/system-damages/events/injected'),event))
  })
  await t.test('case responsibility snapshots survive normal edits; canonical and safe legacy assignment rights remain separated',async()=>{
   for(const[root,module]of [['damageCases','damages'],['inkassoCases','inkasso'],['legalDisputes','legalDisputes'],['insolvencies','insolvencies']]){
    await admin.doc(`${root}/case`).update({responsibleUserId:'disabled',responsibleUserName:'Former responsible'})
    await updateDoc(doc(editor,`${root}/case`),{description:'Normal edit after responsible user deactivation',...actorUpdate()})
    if(['damageCases','inkassoCases'].includes(root)){
     await updateDoc(doc(editor,`${root}/case`),{responsibleUserId:'viewer',responsibleUserName:'Test viewer',...actorUpdate()})
     await denied(updateDoc(doc(editor,`${root}/case`),{responsibleUserId:'wrong-module',responsibleUserName:'Test wrong-module',...actorUpdate()}))
     await denied(updateDoc(doc(editor,`${root}/case`),{responsibleUserId:'disabled',responsibleUserName:'Test disabled',...actorUpdate()}))
     await denied(updateDoc(doc(editor,`${root}/case`),{responsibleUserId:'viewer',responsibleUserName:'Forged name',...actorUpdate()}))
     await updateDoc(doc(editor,`${root}/case`),{responsibleUserId:null,responsibleUserName:null,...actorUpdate()})
    }else await denied(updateDoc(doc(editor,`${root}/case`),{responsibleUserId:'viewer',responsibleUserName:'Test viewer',...actorUpdate()}))
    await denied(updateDoc(doc(viewer,`${root}/case`),{responsibleUserId:null,responsibleUserName:null,...actorUpdate()}))
    assert(['view','edit'].includes(profiles[1].permissions[module]))
   }
  })
  for(const root of ['damageCases','inkassoCases','legalDisputes','insolvencies'])await t.test(`${root}: ten full-document ordinary edits preserve server responsibility`,async()=>{
   await admin.doc(`${root}/case`).update({responsibleUserId:'disabled',responsibleUserName:'Former responsible'})
   for(let iteration=0;iteration<10;iteration++){
    const reference=doc(editor,`${root}/case`)
    const current=await getDoc(reference)
    await assert.doesNotReject(updateDoc(reference,{...current.data(),description:`Full ordinary edit ${iteration}`,...actorUpdate()}),`${root} full ordinary edit ${iteration}`)
   }
  })
  await t.test('private reminder work, receipts, state and status reject get/list/create/update/delete even for active superadmins',async()=>{
   for(const name of ['reminderWork','reminderDeliveries','reminderSourceStatus','reminderState']){
    await admin.doc(`${name}/record`).set({status:'private'})
    for(const db of [editor,viewer,superuser,clients[3].db]){
     await denied(getDoc(doc(db,`${name}/record`)));await denied(getDocs(collection(db,name)))
     await denied(setDoc(doc(db,`${name}/injected`),{status:'fake'}));await denied(updateDoc(doc(db,`${name}/record`),{status:'fake'}));await denied(deleteDoc(doc(db,`${name}/record`)))
    }
   }
  })
 }finally{
  for(const {db,app}of clients){await terminate(db);await deleteApp(app)}
  await deleteAdminApp(adminApp)
 }
})
