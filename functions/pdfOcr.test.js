import { addOcrMetadata } from './agbChecker.js'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import assert from 'node:assert/strict'
import { needsPdfOcr, validatePdfOcr, extractPdfWithOcr, recognizePdfPages } from './pdfOcr.js'

test('OCR recognizes missing text, short image captions and broken glyphs, preserving actual native text',()=>{
 assert.equal(needsPdfOcr(''),true);assert.equal(needsPdfOcr('Scanned by office scanner'),true)
 assert.equal(needsPdfOcr('Test GmbH',false),false)
 assert.equal(needsPdfOcr('Rechnung 260000001 '.repeat(20)),false)
 assert.equal(needsPdfOcr('Some text \uFFFD',false),true)
})
test('native text makes zero OCR requests and returns original page order',async()=>{
 const result=await extractPdfWithOcr(Buffer.from('synthetic'),{inspect:async()=>({pages:['Native invoice data: '+'invoice '.repeat(20)],imagePages:[]}),recognize:()=>assert.fail('no OCR for native text')})
 assert.deepEqual(result.ocrPages,[]);assert.match(result.text,/Native invoice data/)
})

test('invoice mode always OCRs every page while preserving native and OCR evidence separately', async () => {
 let calls = 0
 const native = 'Rechnung RG1 TA 260000001 Betrag 500,00 EUR '.repeat(3)
 const result = await extractPdfWithOcr(Buffer.from('native-invoice'), { alwaysOcr: true, inspect: async () => ({ pages: [native, ''], imagePages: [] }), recognize: async ({ pageNumbers }) => {
  calls++; assert.deepEqual(pageNumbers, [1, 2])
  return [{ number: 1, text: native.replaceAll('500,00', '600,00'), blank: false, uncertain: false }, { number: 2, text: 'Weitere Angaben 250,00 EUR', blank: false, uncertain: false }]
 } })
 assert.equal(calls, 1); assert.equal(result.extractionMethod, 'text_and_ocr')
 assert.equal(result.pages[0], native); assert.match(result.ocrPageTexts[0], /600,00/)
 assert.deepEqual(result.ocrDifferencePages, [1]); assert.deepEqual(result.ocrPages, [1, 2])
 assert.match(result.evidenceText, /PDF-Textebene/); assert.match(result.evidenceText, /Zusätzliche OCR/)
 assert.match(result.nativeText, /500,00/); assert.match(result.ocrText, /600,00/)
})

test('invoice OCR-only metadata distinguishes scans and ignores text-order differences in numeric evidence', async () => {
 const scan = await extractPdfWithOcr(Buffer.from('scan-only'), { alwaysOcr: true, inspect: async () => ({ pages: [''], imagePages: [1] }), recognize: async () => [{ number: 1, text: 'Rechnung 123 Betrag 50,00 EUR', blank: false, uncertain: false }] })
 assert.equal(scan.extractionMethod, 'ocr_only'); assert.equal(scan.nativeText, ''); assert.deepEqual(scan.ocrDifferencePages, [])
 const native = 'Rechnung 123 Betrag 50,00 EUR Auftrag 260000001 '.repeat(3)
 const reordered = await extractPdfWithOcr(Buffer.from('reordered-native'), { alwaysOcr: true, inspect: async () => ({ pages: [native], imagePages: [] }), recognize: async () => [{ number: 1, text: 'Auftrag 260000001 Betrag 50,00 EUR Rechnung 123 '.repeat(3), blank: false, uncertain: false }] })
 assert.deepEqual(reordered.ocrDifferencePages, [])
 const formatted = await extractPdfWithOcr(Buffer.from('formatted-native'), { alwaysOcr: true, inspect: async () => ({ pages: ['Rechnung 123, Betrag 1.250,00 EUR, Datum 02.11.2026, Transport 260000001. '.repeat(3)], imagePages: [] }), recognize: async () => [{ number: 1, text: 'Transport 260000001. Date 2026-11-02, amount 1,250.00 EUR, Invoice 123. '.repeat(3), blank: false, uncertain: false }] })
 assert.deepEqual(formatted.ocrDifferencePages, [])
})
test('mixed PDF OCRs only missing page once, then splices text in original order',async()=>{
 let calls=0
 const args={inspect:async()=>['Original text '.repeat(20),'','More native text '.repeat(20)],recognize:async({pageNumbers})=>{calls++;assert.deepEqual(pageNumbers,[2]);return[{number:2,text:'Rechnung RG1 TA 260000001 Betrag 500,00 EUR',blank:false,uncertain:false}]},cache:new Map()}
 const bytes=Buffer.from('same-document')
 const first=await extractPdfWithOcr(bytes,args);const again=await extractPdfWithOcr(bytes,args)
 assert.equal(calls,1);assert.deepEqual(first.ocrPages,[2]);assert.deepEqual(first.ocrUncertainPages,[]);assert.match(first.text,/\[Seite 2\][\s\S]*260000001[\s\S]*\[Seite 3\]/);assert.equal(first.text,again.text)
})
test('OCR uncertainty and unreadable markers persist; blank pages do not fabricate data',async()=>{
 const result=await extractPdfWithOcr(Buffer.from('scan'),{inspect:async()=>['',''],recognize:async()=>[{number:1,text:'TA [unleserlich]',blank:false,uncertain:false},{number:2,text:'',blank:true,uncertain:false}]})
 assert.deepEqual(result.ocrUncertainPages,[1]);assert.equal(result.pageCount,2)
 await assert.rejects(extractPdfWithOcr(Buffer.from('blank'),{inspect:async()=>[''],recognize:async()=>[{number:1,text:'',blank:true,uncertain:false}]}),{errorType:'empty_pdf_text'})
})
test('missing, duplicated, wrong pages and invalid blank declarations are rejected',()=>{
 for(const pages of [[],[{number:1,text:'text',blank:false,uncertain:false},{number:1,text:'other',blank:false,uncertain:false}],[{number:2,text:'text',blank:false,uncertain:false}],[{number:1,text:'text',blank:true,uncertain:false}]])assert.throws(()=>validatePdfOcr({pages},[1]))
})
test('OCR provider failures and incomplete output fail once without automatic retry',async()=>{
 let calls=0
 const params={bytes:Buffer.from('pdf'),pageNumbers:[1],actorId:'test',apiKey:'synthetic',renderPages:async()=>[{number:1,dataUrl:'data:image/png;base64,synthetic'}],execute:async({operation})=>operation()}
 await assert.rejects(recognizePdfPages({...params,fetchImpl:async()=>{calls++;return{ok:true,json:async()=>({status:'incomplete'})}}}),{errorType:'pdf_ocr_failed'})
 assert.equal(calls,1)
})

test('uncertain OCR lowers AGB finding confidence and preserves the source-page notice',()=>{
 const analysis=addOcrMetadata({results:[{status:'found',confidence:'high'}],contacts:[],findings:[]},[{name:'scan.pdf',ocrPages:[1],ocrUncertainPages:[1]}])
 assert.equal(analysis.results[0].confidence,'low');assert.deepEqual(analysis.ocr[0].uncertainPages,[1]);assert.match(analysis.findings[0],/OCR/)
})
