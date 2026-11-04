import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { reviewMailboxInvoices } from './invoiceReview.js'

test('invoice snapshot and transport links commit atomically to real Firestore and remain idempotent', {skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
 const projectId=process.env.GCLOUD_PROJECT||'demo-drehpunkt-mailboxes';assert.ok(projectId.startsWith('demo-'))
 const app=initializeApp({projectId},'invoice-integration'),db=getFirestore(app)
 try{
 const val=value=>({value,quote:value})
 const ta='260111111',orderId='invoice-integration-order'
 const imported={carrier:{originalName:'Carrier'},financial:{currency:'EUR',costPositions:[{amountNet:500}]},loading:{city:'Berlin'},unloading:{city:'Hamburg'}}
 await db.doc(`transportOrders/${orderId}`).set({externalNumber:ta,imported})
 const fields={ta:val(ta),net:val('500,00'),loadingDate:val(''),unloadingDate:val(''),loadingCity:val(''),unloadingCity:val(''),licensePlate:val('')}
 const factoring='Diese Forderung wurde an Example Factor AG abgetreten.'
 const invoice={sourceId:'pdf',invoiceEvidence:'Rechnung',number:val('RG1'),date:{value:'2026-05-14',quote:'14.05.2026'},issuer:val('Carrier'),issuerVatId:val(''),recipient:val('Brennpunkt Logistik GmbH'),recipientVatId:val(''),currency:val('EUR'),netTotal:val('500,00'),vatTotal:val('0,00'),grossTotal:val('500,00'),paymentTerms:val('45 Tage ab Rechnungsdatum'),paymentDays:{value:'45',quote:'45 Tage'},paymentBasis:val('Rechnungsdatum'),dueDate:{value:'2026-06-28',quote:'28.06.2026'},factoring:val(factoring),factoringCompany:val('Example Factor AG'),transports:[fields],warnings:[]}
 const args={db,context:{uid:'invoice-integration-user',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'synthetic.pdf',contentBytes:'YQ=='}],operationId:'invoice-integration-request',extract:async()=>({text:`Rechnung RG1 Rechnungsdatum: 14.05.2026 Carrier Brennpunkt Logistik GmbH EUR 500,00 0,00 TA ${ta} Zahlungsziel: 28.06.2026 (45 Tage ab Rechnungsdatum). ${factoring}`,pageCount:1}),infer:async()=>({invoices:[invoice]}),fetchOrder:()=>assert.fail('local facts complete')}
 const report=await reviewMailboxInvoices(args)
 const link=await db.doc(`transportOrders/${orderId}/invoiceChecks/${report.id}`).get();assert.equal(link.data().reportId,report.id)
 assert.ok((await db.doc(`invoiceCheckReports/${report.id}`).get()).data().report.invoices.length)
 assert.equal(report.version,6)
 assert.equal(report.invoices[0].paymentChecks.length,1)
 assert.equal(report.invoices[0].paymentChecks[0].key,'paymentTerms')
 assert.match(String(report.invoices[0].paymentChecks[0].actual),/45/)
 const factoringCheck=report.invoices[0].headerChecks.find(check=>check.key==='factoring')
 assert.equal(factoringCheck.color,'yellow');assert.equal(factoringCheck.found,true)
 assert.ok(report.invoices[0].alerts.some(alert=>alert.kind==='factoring'&&alert.color==='yellow'))
 assert.deepEqual((await db.doc(`transportOrders/${orderId}`).get()).data(),{externalNumber:ta,imported})
 const again=await reviewMailboxInvoices({...args,infer:()=>assert.fail('duplicate request')});assert.equal(again.id,report.id)
 assert.equal((await db.collection(`transportOrders/${orderId}/invoiceChecks`).orderBy('createdAt','desc').get()).size,1)
 }finally{await db.terminate();await deleteApp(app)}
})
