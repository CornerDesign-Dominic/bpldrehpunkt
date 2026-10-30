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
  assert.equal(checked.status,'match');assert.equal(checked.checks[0].expected,50000)
  assert.equal(compareInvoiceTransport({rows:[row('260000001','501,00')],invoice:invoice(),imported,company}).status,'mismatch')
  assert.equal(compareInvoiceTransport({rows:[row()],invoice:invoice(),imported:{...imported,financial:{costNet:500,currency:'EUR'}},company}).status,'unknown')
})
test('missing comparison facts cannot be green; known differences are red',()=>{
  assert.equal(compareInvoiceTransport({rows:[row()],invoice:invoice(),imported,company:{}}).status,'unknown')
  const wrong=invoice();wrong.currency=value('PLN');assert.equal(compareInvoiceTransport({rows:[row()],invoice:wrong,imported,company}).status,'mismatch')
  const plate=row();plate.licensePlate=value('OTHER');assert.equal(compareInvoiceTransport({rows:[plate],invoice:invoice(),imported,company}).status,'mismatch')
})
test('collection invoice combines charges per TA and checks sums, net/tax/gross separately',()=>{
  assert.equal(compareInvoiceTransport({rows:[row('260000001','300,00'),row('260000001','200,00')],invoice:invoice(),imported,company}).status,'match')
  const bill=invoice([row('260000001','300,00'),row('260000002','200,00')]);assert.equal(invoiceTotals(bill).status,'match')
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
 const report=await reviewMailboxInvoices(args);assert.equal(report.status,'match');assert.equal(report.invoices[0].transports.length,2)
 assert.ok(db.records.has(`transportOrders/a/invoiceChecks/${report.id}`));assert.ok(db.records.has(`transportOrders/b/invoiceChecks/${report.id}`))
 assert.equal(JSON.stringify([...db.records].slice(0,3)),original)
 assert.equal((await reviewMailboxInvoices({...args,infer:()=>assert.fail('duplicate request should use receipt')})).id,report.id)
})
test('no TA in invoice aborts matching even if filenames or other sources contain a TA',async()=>{
 const db=database();let queried=false;db.collection=()=>{queried=true;assert.fail('no lookup without invoice TA')}
 const bill=invoice([row('','500,00')]);const report=await reviewMailboxInvoices({db,context:{uid:'owner',profile:{active:true,permissions:{transportOrders:'edit'}}},files:[{id:'pdf',name:'TA 260000001.pdf',contentBytes:'YQ=='}],operationId:'request-000000001',extract:async()=>({text:'Rechnung RG1 10.02.2026 Carrier GmbH Brennpunkt Logistik GmbH EUR 500,00 0,00',pageCount:1}),infer:async()=>({invoices:[bill]})})
 assert.equal(queried,false);assert.match(report.message,/Keine Zuordnung/);assert.equal(report.invoices[0].transports[0].status,'unassigned')
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
