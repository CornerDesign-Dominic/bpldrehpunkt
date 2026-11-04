import test from 'node:test'
import assert from 'node:assert/strict'
import { invoiceTaReferenceHints, inferInvoices, invoiceCents, validateInvoiceExtraction, compareInvoiceTransport, invoiceTotals, resolveInvoiceOrder, reviewMailboxInvoices } from './invoiceReview.js'
const value = (value, quote = value) => ({ value, quote })
const row = (ta = '260000001', amount = '500,00') => ({ ta: value(ta), net: value(amount), loadingDate: value(''), unloadingDate: value(''), loadingCity: value(''), unloadingCity: value(''), licensePlate: value('') })
const invoice = (transports = [row()]) => ({ sourceId:'pdf', invoiceEvidence:'Rechnung', number:value('RG1'), date:value('2026-02-10','10.02.2026'), issuer:value('Carrier GmbH'), issuerVatId:value(''), recipient:value('Brennpunkt Logistik GmbH'), recipientVatId:value(''), currency:value('EUR'), netTotal:value('500,00'), vatTotal:value('0,00'), grossTotal:value('500,00'), transports, warnings:[] })
const imported = { carrier:{originalName:'Carrier GmbH'}, financial:{costNet:9999, currency:'EUR',costPositions:[{amountNet:500}]},loading:{city:'Berlin',window:{from:'2026-02-10T08:00'}},unloading:{city:'Hamburg',window:{until:'2026-02-11T08:00'}},shipment:{licensePlate:'A-BC 12'} }
const company={legalName:'Brennpunkt Logistik GmbH'}
function database() {
  const records=new Map()
  const snap=path=>({id:path.split('/').at(-1),exists:records.has(path),data:()=>records.get(path)})
  const db = {
    records,
    doc: path => ({ path, get: async () => snap(path) }),
    collection: path => ({
      where: (key, op, value) => ({
        limit: count => ({ get: async () => ({ docs: [...records].filter(([p,v]) => p.startsWith(path+'/') && p.split('/').length === 2 && v[key] === value).slice(0,count).map(([p]) => snap(p)) }) }),
      }),
    }),
  }
  let queue=Promise.resolve()
  db.runTransaction=fn=>{const run=queue.then(async()=>{const writes=[];const result=await fn({get:async ref=>{assert.equal(writes.length,0);return snap(ref.path)},set:(ref,v)=>writes.push(['set',ref,v]),create:(ref,v)=>writes.push(['create',ref,v])});for(const[k,ref]of writes)if(k==='create')assert.ok(!records.has(ref.path));for(const[,ref,v]of writes)records.set(ref.path,v);return result});queue=run.catch(()=>{});return run}
  return db
}
test('money uses exact cents, currencies do not collapse missing amounts to zero',()=>{
  for(const[a,b]of [['500,00',50000],['1.234,56',123456],['1,234.56',123456],['0,00',0],['-50,10',-5010],['',null],['not money',null]])assert.equal(invoiceCents(a),b)
})
test('a match compares transport-specific costs, never tour totals or sales revenue',()=>{
  const checked=compareInvoiceTransport({rows:[row()],invoice:invoice(),imported,company})
  assert.equal(checked.checks.find(check=>check.key==='net').status,'match');assert.equal(checked.checks.find(check=>check.key==='net').expected,50000);assert.equal(checked.status,'unknown')
  assert.equal(compareInvoiceTransport({rows:[row('260000001','501,00')],invoice:invoice(),imported,company}).status,'mismatch')
  assert.equal(compareInvoiceTransport({rows:[row()],invoice:invoice(),imported:{...imported,financial:{costNet:500,currency:'EUR'}},company}).status,'unknown')
})
test('missing comparison facts cannot be green; known differences are red',()=>{
  assert.equal(compareInvoiceTransport({rows:[row()],invoice:invoice(),imported,company:{}}).status,'unknown')
  const wrong=invoice();wrong.currency=value('PLN');const wrongResult=compareInvoiceTransport({rows:[row()],invoice:wrong,imported,company});assert.equal(wrongResult.status,'mismatch');assert.equal(wrongResult.checks.find(check=>check.key==='currency').color,'red');assert.equal(wrongResult.checks.find(check=>check.key==='net').color,'yellow')
  const plate=row();plate.licensePlate=value('OTHER');assert.equal(compareInvoiceTransport({rows:[plate],invoice:invoice(),imported,company}).checks.find(check=>check.key==='licensePlate-0').color,'red')
})
test('collection invoice combines charges per TA and checks sums, net/tax/gross separately',()=>{
  assert.equal(compareInvoiceTransport({rows:[row('260000001','300,00'),row('260000001','200,00')],invoice:invoice(),imported,company}).checks.find(check=>check.key==='net').status,'match')
  const bill=invoice([row('260000001','300,00'),row('260000002','200,00')]);assert.equal(invoiceTotals(bill).detailChecks.find(check=>check.key==='positionSum').status,'match');assert.equal(invoiceTotals(bill).detailChecks.find(check=>check.key==='taxSum').status,'match');assert.equal(invoiceTotals(bill).status,'unknown')
  bill.grossTotal=value('999,00');assert.equal(invoiceTotals(bill).status,'mismatch')
  bill.grossTotal=value('');assert.equal(invoiceTotals(bill).status,'unknown')
})
test('untrusted extraction requires document evidence; TA must be nine whole digits in invoice text',()=>{
  const text='Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 500,00 0,00 TA 260000001'
  let checked=validateInvoiceExtraction({invoices:[invoice()]},[{id:'pdf',name:'a.pdf',text}])[0]
  assert.equal(checked.transports[0].ta.value,'260000001')
  const forged=invoice();forged.transports[0].ta=value('260000999','TA 260000999');checked=validateInvoiceExtraction({invoices:[forged]},[{id:'pdf',name:'a.pdf',text}])[0];assert.equal(checked.transports[0].ta.value,'')
  const anchored=invoice();anchored.issuer.quote='Seller: Carrier GmbH';checked=validateInvoiceExtraction({invoices:[anchored]},[{id:'pdf',name:'a.pdf',text}])[0];assert.equal(checked.issuer.value,'Carrier GmbH');assert.equal(checked.issuer.quote,'Carrier GmbH')
})
test('complete local order prevents API calls; ambiguous TA never chooses first result',async()=>{
 const db=database();db.records.set('transportOrders/a',{externalNumber:'260000001',imported});const result=await resolveInvoiceOrder({db,ta:'260000001',fetchOrder:()=>assert.fail('must prefer local')});assert.equal(result.orderId,'a')
 db.records.set('transportOrders/b',{externalNumber:'260000001',imported});assert.equal((await resolveInvoiceOrder({db,ta:'260000001',fetchOrder:()=>assert.fail('must not guess')})).status,'ambiguous')
})
test('full report persists once and is attached to every matched TA without copying mail or changing orders',async()=>{
 const db=database();db.records.set('transportOrders/a',{externalNumber:'260000001',imported});db.records.set('transportOrders/b',{externalNumber:'260000002',imported});db.records.set('appSettings/companyMasterData',company)
 const original=JSON.stringify([...db.records])
 const bill=invoice([row('260000001','500,00'),row('260000002','500,00')]);bill.netTotal=value('1000,00');bill.grossTotal=value('1000,00')
 const args={db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'invoice.pdf',contentBytes:'YQ=='}],operationId:'request-000000001',now:1000,extract:async()=>({text:'Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 500,00 1000,00 0,00 TA 260000001 TA 260000002',pageCount:1}),infer:async()=>({invoices:[bill]}),fetchOrder:()=>assert.fail('local order complete')}
 const report=await reviewMailboxInvoices(args);assert.equal(report.status,'unknown');assert.equal(report.version,5);assert.equal(report.invoices[0].transports.length,2)
 assert.ok(db.records.has(`transportOrders/a/invoiceChecks/${report.id}`));assert.ok(db.records.has(`transportOrders/b/invoiceChecks/${report.id}`))
 assert.equal(JSON.stringify([...db.records].slice(0,3)),original)
 assert.equal((await reviewMailboxInvoices({...args,infer:()=>assert.fail('duplicate request should use receipt')})).id,report.id)
})
test('a filename alone never creates a TA candidate and missing reference stays yellow',async()=>{
 const db=database();let queried=false;db.collection=()=>{queried=true;assert.fail('no lookup without invoice TA')}
 const bill=invoice([row('','500,00')]);const report=await reviewMailboxInvoices({db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'TA 260000001.pdf',contentBytes:'YQ=='}],operationId:'request-000000001',extract:async()=>({text:'Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 500,00 0,00',pageCount:1}),infer:async()=>({invoices:[bill]})})
 assert.equal(queried,false);assert.match(report.message,/keine eindeutige TA-Zuordnung/);assert.equal(report.invoices[0].transports[0].status,'unknown')
 assert.equal([...db.records.keys()].some(key=>key.includes('/invoiceChecks/')),false)
})

test('uncertain OCR cannot become a green transport even when recognized amounts match',async()=>{
 const db=database();db.records.set('transportOrders/a',{externalNumber:'260000001',imported});db.records.set('appSettings/companyMasterData',company)
 const report=await reviewMailboxInvoices({db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'scan.pdf',contentBytes:'YQ=='}],operationId:'request-ocr-00001',extract:async()=>({text:'Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 500,00 0,00 TA 260000001',pageCount:1,ocrPages:[1],ocrUncertainPages:[1]}),infer:async()=>({invoices:[invoice()]}),fetchOrder:()=>assert.fail('local facts complete')})
 assert.equal(report.status,'unknown');assert.equal(report.invoices[0].transports[0].status,'unknown');assert.deepEqual(report.invoices[0].ocrPages,[1]);assert.ok(report.invoices[0].transports[0].checks.some(check=>check.key==='ocr'&&check.status==='unknown'))
})

test('inference uses schema-constrained short references and maps them back to opaque Graph IDs', async () => {
 const graphIds = ['A'.repeat(95)+'1', 'A'.repeat(95)+'2']
 const documents = graphIds.map((id,index)=>({id,name:`document-${index}.pdf`,text:'Rechnung RG1',contentBytes:'cGRm',pageCount:1}))
 let request
 const result = await inferInvoices({documents,actorId:'owner',apiKey:'unit-test-only',execute:async({operation})=>operation(),fetchImpl:async(url,options)=>{
   request=JSON.parse(options.body)
   return {ok:true,headers:{get:()=>null},json:async()=>({status:'completed',output_text:JSON.stringify({invoices:[{...invoice(),sourceId:'pdf-2'}]})})}
 }})
 assert.deepEqual(request.text.format.schema.properties.invoices.items.properties.sourceId.enum,['pdf-1','pdf-2'])
 assert.deepEqual(JSON.parse(request.input[0].content[0].text).map(doc=>doc.sourceId),['pdf-1','pdf-2'])
 assert.ok(graphIds.every(id=>!JSON.stringify(request).includes(id)))
 assert.equal(result.invoices[0].sourceId,graphIds[1])
})
test('unknown model references fail closed with a content-free diagnostic code',async()=>{
 await assert.rejects(inferInvoices({documents:[{id:'opaque-graph-id',name:'invoice.pdf',text:'Rechnung',contentBytes:'cGRm',pageCount:1}],actorId:'owner',apiKey:'unit-test-only',execute:async({operation})=>operation(),fetchImpl:async()=>({ok:true,headers:{get:()=>null},json:async()=>({status:'completed',output_text:JSON.stringify({invoices:[{...invoice(),sourceId:'pdf-9'}]})})})}),error=>error.code==='unavailable'&&error.details?.technicalCode==='invoice_source_reference_invalid')
})

test('external order-number labels remain valid TA hints without accepting invoice or account numbers',()=>{
 const hints=invoiceTaReferenceHints('Rechnung 260999999 Kundenkonto 260888888 Auftrags-Nr.: 1234567 ext. Auftrags-Nr.: 260000001 // 12345 Ihre Auftragsnummer: 260000002 Auftragsnummer: 260000001')
 assert.deepEqual(hints.map(hint=>hint.number),['260000001','260000002'])
 assert.equal(hints[0].quote,'ext. Auftrags-Nr.: 260000001')
 assert.deepEqual(invoiceTaReferenceHints('Rechnung 260999999 ext. Auftrags-Nr.: 2600000019'),[])
})

test('unlabeled but literal TA candidates are checked, ranked, and never multiply the billed amount', async () => {
 const db=database();db.records.set('transportOrders/a',{externalNumber:'260000001',imported});db.records.set('transportOrders/b',{externalNumber:'260000002',imported:{...imported,financial:{...imported.financial,costPositions:[{amountNet:700}]}}});db.records.set('appSettings/companyMasterData',company)
 const bill=invoice([row('','500,00')]);let ocrRequested=false
 const report=await reviewMailboxInvoices({db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'invoice.pdf',contentBytes:'YQ=='}],operationId:'request-candidates-001',extract:async(_bytes,options)=>{ocrRequested=options.alwaysOcr;return{text:'Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 500,00 0,00 Referenzen 260000001 oder 260000002',pageCount:1}},infer:async()=>({invoices:[bill]}),fetchOrder:()=>assert.fail('local facts complete')})
 assert.equal(ocrRequested,true)
 const transport=report.invoices[0].transports[0]
 assert.equal(transport.uncertainTa,false);assert.equal(transport.ta,'260000001');assert.equal(transport.checks.find(check=>check.key==='ta').color,'green');assert.equal(transport.assignmentMethod,'corroborated')
 assert.equal(report.invoices[0].totals.detailChecks.find(check=>check.key==='positionSum').actual,50000)
 assert.ok(db.records.has(`transportOrders/a/invoiceChecks/${report.id}`));assert.equal(db.records.has(`transportOrders/b/invoiceChecks/${report.id}`),false)
})

test('a single corroborated candidate is assigned automatically and used by the aggregate amounts',async()=>{
 const db=database();db.records.set('transportOrders/a',{externalNumber:'260000001',imported});db.records.set('appSettings/companyMasterData',company)
 const report=await reviewMailboxInvoices({db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'invoice.pdf',contentBytes:'YQ=='}],operationId:'request-one-candidate-001',extract:async()=>({text:'Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 500,00 0,00 Referenz 260000001',pageCount:1}),infer:async()=>({invoices:[invoice([row('','500,00')])]}),fetchOrder:()=>assert.fail('local facts complete')})
 assert.equal(report.invoices[0].transports[0].checks[0].color,'green')
 assert.equal(report.invoices[0].transports[0].orderId,'a')
 assert.ok(db.records.has(`transportOrders/a/invoiceChecks/${report.id}`))
 assert.equal(report.invoices[0].totals.checks.find(check=>check.key==='netTotal').color,'green')
})

test('only genuine OCR/native invoice evidence can recover a missing TA; filenames still cannot',()=>{
 const raw=invoice([row('260000001')]);raw.invoiceEvidence='Rechnung';raw.recipientAddress=value('Reinshagenstraße 1, 42369 Wuppertal')
 const result=validateInvoiceExtraction({invoices:[raw]},[{id:'pdf',name:'other.pdf',text:'Rechnung',nativeText:'Rechnung',evidenceText:'[Textebene] Rechnung [OCR] TA 260000001 Reinshagenstraße 1, 42369 Wuppertal 500,00',extractionMethod:'text_and_ocr',ocrPages:[1]}])[0]
 assert.equal(result.transports[0].ta.value,'260000001')
 assert.equal(result.recipientAddress.value,'Reinshagenstraße 1, 42369 Wuppertal')
 assert.equal(result.extractionMethod,'text_and_ocr')
})

test('empty extracted positions still show document TA candidates without assigning the invoice total to them',async()=>{
 const db=database();db.records.set('transportOrders/a',{externalNumber:'260000001',imported});db.records.set('appSettings/companyMasterData',company)
 const report=await reviewMailboxInvoices({db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'invoice.pdf',contentBytes:'YQ=='}],operationId:'request-empty-positions-001',extract:async()=>({text:'Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 500,00 0,00 Referenz 260000001',pageCount:1}),infer:async()=>({invoices:[invoice([])]}),fetchOrder:()=>assert.fail('local facts complete')})
 const transport=report.invoices[0].transports[0]
 assert.equal(transport.color,'yellow');assert.equal(transport.candidates[0].ta,'260000001');assert.equal(transport.candidates[0].netCents,null)
 assert.equal(report.invoices[0].totals.detailChecks.find(check=>check.key==='positionSum').actual,null)
})

test('disputed text/OCR monetary values remain yellow even when the selected channel happens to match the database',()=>{
 const raw=invoice();const native='Rechnung TA 260000001 Netto 500,00 MwSt 0,00 Brutto 500,00';const ocr='Rechnung TA 260000001 Netto 800,00 MwSt 0,00 Brutto 800,00'
 const checked=validateInvoiceExtraction({invoices:[raw]},[{id:'pdf',name:'a.pdf',text:native,nativeText:native,ocrText:ocr,evidenceText:native+'\n'+ocr,extractionMethod:'text_and_ocr',ocrDifferencePages:[1]}])[0]
 assert.deepEqual(checked.amountUncertainKeys,['netTotal','grossTotal']);assert.equal(checked.transports[0].netOcrUncertain,true)
 assert.equal(compareInvoiceTransport({rows:checked.transports,invoice:checked,imported,company}).checks.find(check=>check.key==='net').color,'yellow')
 assert.equal(invoiceTotals(checked).detailChecks.find(check=>check.key==='taxSum').color,'yellow')
 const sameMoney=validateInvoiceExtraction({invoices:[raw]},[{id:'pdf',name:'a.pdf',text:native,nativeText:native+' Telefon 123456',ocrText:native+' Telefon 123457',evidenceText:native,extractionMethod:'text_and_ocr',ocrDifferencePages:[1]}])[0]
 assert.deepEqual(sameMoney.amountUncertainKeys,[]);assert.equal(sameMoney.transports[0].netOcrUncertain,false)
})

test('combined native and OCR evidence cannot bypass the total text budget',async()=>{
 const db=database()
 await assert.rejects(reviewMailboxInvoices({db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'oversized-ocr.pdf',contentBytes:'YQ=='}],operationId:'request-ocr-budget-001',extract:async()=>({text:'Rechnung',nativeText:'Rechnung',ocrText:'x'.repeat(400000),evidenceText:'Rechnung',pageCount:1}),infer:()=>assert.fail('Oversized OCR must never reach invoice inference')}),{code:'failed-precondition'})
 assert.equal([...db.records.keys()].some(key=>key.startsWith('invoiceCheckReports/')),false)
})

test('corroborated uncertain positions for the same labelled TA compare their combined amount once', async () => {
 const db=database()
 const order={...imported,financial:{...imported.financial,costPositions:[{amountNet:230}]}}
 db.records.set('transportOrders/a',{externalNumber:'260000001',imported:order})
 db.records.set('transportOrders/b',{externalNumber:'260000002',imported:{...order,financial:{...order.financial,costPositions:[{amountNet:900}]}}})
 db.records.set('appSettings/companyMasterData',company)
 const positions=['100,00','130,00'].map(amount=>({...row('260000001',amount),ta:value('260000001','Auftrag 260000001'),taCandidates:[value('260000002','TA 260000002')]}))
 const bill={...invoice(positions),netTotal:value('230,00'),grossTotal:value('230,00')}
 const report=await reviewMailboxInvoices({db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'invoice.pdf',contentBytes:'YQ=='}],operationId:'request-grouped-corroborated-001',extract:async()=>({text:'Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 100,00 130,00 230,00 0,00 Auftrag 260000001 TA 260000002',pageCount:1}),infer:async()=>({invoices:[bill]}),fetchOrder:()=>assert.fail('local facts complete')})
 const transports=report.invoices[0].transports
 assert.equal(transports.length,1)
 assert.equal(transports[0].ta,'260000001')
 assert.equal(transports[0].checks.find(check=>check.key==='net').actual,23000)
 assert.equal(transports[0].checks.find(check=>check.key==='net').color,'green')
 assert.equal(report.invoices[0].totals.checks.find(check=>check.key==='netTotal').color,'green')
 assert.equal(db.records.has(`transportOrders/b/invoiceChecks/${report.id}`),false)
})

test('mail subject and accompanying PDF identify an invoice without its own TA and preserve source without mail text',async()=>{
 const db=database();db.records.set('transportOrders/a',{externalNumber:'260000001',imported});db.records.set('appSettings/companyMasterData',company)
 const report=await reviewMailboxInvoices({db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'invoice.pdf',contentBytes:'YQ=='},{id:'cmr',name:'cmr.pdf',contentBytes:'Yg=='}],mail:{subject:'Transport 260000001',body:{content:'Private mail body not stored'}},operationId:'request-context-link-001',extract:async(_bytes,{fileName})=>({text:fileName==='invoice.pdf'?'Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 500,00 0,00 USt-IdNr DE317701646':'Ablieferbeleg TA 260000001',pageCount:1}),infer:async()=>({invoices:[invoice([row('','500,00')])]}),fetchOrder:()=>assert.fail('VAT digits must not trigger lookup')})
 const transport=report.invoices[0].transports[0]
 assert.equal(transport.ta,'260000001');assert.equal(transport.uncertainTa,false)
 assert.deepEqual(transport.assignmentSources.map(source=>source.sourceType),['attachment','subject'])
 assert.ok(!JSON.stringify(report).includes('Private mail body not stored'))
 assert.equal(report.documents.length,2)
 assert.equal(report.invoices[0].totals.checks.find(check=>check.key==='netTotal').color,'green')
})

test('equal context candidates stay unresolved and never create misleading order links',async()=>{
 const db=database();for(const [id,ta]of [['a','260000001'],['b','260000002']])db.records.set(`transportOrders/${id}`,{externalNumber:ta,imported});db.records.set('appSettings/companyMasterData',company)
 const report=await reviewMailboxInvoices({db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'invoice.pdf',contentBytes:'YQ=='}],mail:{subject:'TA 260000001 / TA 260000002'},operationId:'request-equal-context-001',extract:async()=>({text:'Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 500,00 0,00',pageCount:1}),infer:async()=>({invoices:[invoice([row('','500,00')])]}),fetchOrder:()=>assert.fail('all local')})
 assert.equal(report.invoices[0].transports[0].uncertainTa,true)
 assert.equal(report.invoices[0].transports[0].candidates.length,2)
 assert.equal([...db.records.keys()].some(key=>key.includes('/invoiceChecks/')),false)
})

test('confirmed DyCoS absence is distinct from failed transport lookup',async()=>{
 const db=database()
 const result=await resolveInvoiceOrder({db,ta:'260000001',fetchOrder:async()=>{throw Object.assign(new Error('missing'),{code:'ta_not_found'})}})
 assert.equal(result.status,'not_found');assert.equal(result.lookupFailed,undefined)
})

test('remote order resolution preserves only mapped carrier reference data from the same authenticated response',async()=>{
 const db=database()
 const payload={auftrag:{ID:71,Nummer:260000001,TourenID:13},tour:{ID:13,UnternehmerID:15},unternehmerstamm:{ID:15,Bezeichnung:'Carrier GmbH',USTID:'DE123456789',Land:'DE',Zahlungsbedingung:23,Logenios_ApiKey:'not-a-reference'},zahlungsbedingungUnternehmer:{ID:23,Bezeichnung:'30 Kalendertage ab Rechnungsdatum'},ladeEntladestellen:[],kunde:null,fahrzeugart:null,auftragspreise:[],tourkosten:[],relation:null,zahlungsbedingungKunde:null,fakturaZeilen:[],fakturaKopf:[],LadeEntladestellen2:[]}
 const result=await resolveInvoiceOrder({db,ta:'260000001',fetchOrder:async()=>payload})
 assert.equal(result.sourcePartner.sourceId,result.imported.source.carrierId)
 assert.equal(result.sourcePartner.fields.companyData.vatId,'DE123456789')
 assert.equal(result.sourcePartner.fields.paymentTermDays,'30 Kalendertage ab Rechnungsdatum')
 assert.ok(!JSON.stringify(result).includes('not-a-reference'))
})

function invoiceBillingPayload({cancelled=false,externalNumber='RG1',amount=500}={}) {
 return {auftrag:{ID:71,Nummer:260000001,TourenID:13},tour:{ID:13,UnternehmerID:15},unternehmerstamm:{ID:15,Bezeichnung:'Carrier GmbH'},zahlungsbedingungUnternehmer:null,ladeEntladestellen:[],kunde:null,fahrzeugart:null,auftragspreise:[],tourkosten:[],relation:null,zahlungsbedingungKunde:null,fakturaZeilen:[{AuftragID:71,KopfID:91}],fakturaKopf:[{KopfID:91,AdressID:15,ExterneBelegnummer:externalNumber,Nettowert:amount,Mwst:0,Gesamt:amount,WaehrungBezFW:'EUR',bUnternehmer:true,bProformabeleg:true,bRechnungskorrektur:false,Storniert:cancelled,StornoRechungNr:0,PDFDateinameMitPfadFakturaBelegOriginal:'Z:\\private\\ProformaGutschriftUTN_91.pdf'}],LadeEntladestellen2:[]}
}
function billingReportArgs(db,bill=invoice()) {
 db.records.set('transportOrders/a',{externalNumber:'260000001',imported:{...imported,source:{carrierId:'15',orderId:'71'}}})
 db.records.set('appSettings/companyMasterData',company)
 return {db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'invoice.pdf',contentBytes:'YQ=='}],operationId:'request-billing-fresh-001',extract:async()=>({text:'Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 500,00 501,00 0,00 TA 260000001',pageCount:1}),infer:async()=>({invoices:[bill]})}
}
test('actual review refreshes billing for a complete local order and exposes exact duplicate alert without changing the order',async()=>{
 const db=database();let reads=0
 const args=billingReportArgs(db),original=JSON.stringify(db.records.get('transportOrders/a'))
 const result=await reviewMailboxInvoices({...args,fetchOrder:async()=>{reads++;return invoiceBillingPayload()}})
 assert.equal(reads,1)
 assert.equal(result.invoices[0].headerChecks.find(check=>check.key==='billingStatus').color,'red')
 assert.equal(result.invoices[0].alerts.filter(alert=>alert.kind==='duplicate').length,1)
 assert.equal(result.invoices[0].duplicateMatches[0].sourceId,'91')
 assert.equal(JSON.stringify(db.records.get('transportOrders/a')),original)
 assert.ok(!JSON.stringify(result).includes('private'))
})
test('fresh cancellation prevents a duplicate even if the cached order contains an old active document',async()=>{
 const db=database(),args=billingReportArgs(db)
 db.records.get('transportOrders/a').imported.financial={...imported.financial,documents:[{sourceId:'91',cancelled:false,externalNumber:'RG1'}]}
 const result=await reviewMailboxInvoices({...args,fetchOrder:async()=>invoiceBillingPayload({cancelled:true})})
 assert.equal(result.invoices[0].headerChecks.find(check=>check.key==='billingStatus').color,'green')
 assert.deepEqual(result.invoices[0].alerts,[])
})
test('confirmed wrong net appears once in report alerts rather than aggregate and single-TA duplicates',async()=>{
 const db=database(),bill=invoice([row('260000001','501,00')]);bill.netTotal=value('501,00');bill.grossTotal=value('501,00')
 const result=await reviewMailboxInvoices({...billingReportArgs(db,bill),fetchOrder:async()=>invoiceBillingPayload({externalNumber:'OTHER'})})
 const alerts=result.invoices[0].alerts.filter(alert=>alert.kind==='amount')
 assert.equal(alerts.length,1);assert.equal(alerts[0].actual,50100);assert.equal(alerts[0].expected,50000)
})
test('billing failure stays unknown, reports diagnosis once across multiple invoices, and diagnosis failure never hides the review',async()=>{
 const db=database(),args=billingReportArgs(db);let reads=0,diagnoses=0
 const result=await reviewMailboxInvoices({...args,infer:async()=>({invoices:[invoice(),invoice()]}),fetchOrder:async()=>{reads++;throw new Error('source timeout')},onBillingError:async()=>{diagnoses++;throw new Error('diagnosis unavailable')}})
 assert.equal(reads,1);assert.equal(diagnoses,1)
 assert.ok(result.invoices.every(bill=>bill.headerChecks.find(check=>check.key==='billingStatus').color==='yellow'))
 assert.ok(result.invoices.every(bill=>bill.alerts.length===0))
})
