import { Buffer } from 'node:buffer'
import test from 'node:test'
import assert from 'node:assert/strict'
import { invoiceContextTaCandidates, invoiceTaReferenceHints, validateInvoiceExtraction, validateInvoiceAttachments, validateInvoiceAttachmentBytes, inferInvoices, extractInvoiceAttachment } from './invoiceReview.js'

const field = (value, quote = value) => ({ value, quote })
const invoice = extra => ({ sourceId: 'invoice', invoiceEvidence: 'Rechnung', transports: [], warnings: [], ...extra })

test('mail and accompanying documents supply traceable candidates without inventing invoice TA or financial values', () => {
  const documents = [{ id: 'invoice', name: 'bill.pdf', text: 'Rechnung 180,00 EUR', pageCount: 1 }, { id: 'cmr', name: 'proof.png', text: 'Transportauftrag 261000824 Kosten 999,00', pageCount: 1 }]
  const mail = { subject: 'TA 261000561', body: { content: 'Auftrag 261000865' } }
  const candidates = invoiceContextTaCandidates(documents, mail)
  assert.deepEqual(candidates.map(candidate => [candidate.value, candidate.sourceType]), [['261000824', 'attachment'], ['261000561', 'subject'], ['261000865', 'body']])
  const checked = validateInvoiceExtraction({ invoices: [invoice({ netTotal: field('999,00'), currency: field('EUR') })] }, documents, mail)[0]
  assert.equal(checked.netTotal.value, '')
  assert.equal(checked.documentTaCandidates[0].sourceName, 'proof.png')
  assert.equal(checked.transports.length, 0)
})

test('Transport Auftrag and Komm.-Nr. are eligible references, not invoice number labels', () => {
  assert.deepEqual(invoiceTaReferenceHints('Rechnung 261999999 Transport Auftrag 261000561 Komm.-Nr.: 261000865 Auftrag: 261000824').map(item => item.number), ['261000561', '261000865', '261000824'])
})

test('table euro symbol is sufficient evidence for ISO EUR and delivery date remains separate', () => {
  const documents = [{ id: 'invoice', text: 'Rechnung Einzel € Gesamt € 230,00 Lieferdatum 19.10.2026', pageCount: 1 }]
  const checked = validateInvoiceExtraction({ invoices: [invoice({ currency: field('EUR', 'Gesamt €'), deliveryDate: field('2026-10-19', '19.10.2026') })] }, documents)[0]
  assert.equal(checked.currency.value, 'EUR')
  assert.equal(checked.deliveryDate.value, '2026-10-19')
})

test('mixed PDF evidence is limited to selected invoice pages while other pages remain assignment context', () => {
  const documents = [{ id: 'invoice', name: 'bundle.pdf', text: 'Rechnung 180,00\nTransportauftrag 261000824 999,00', pageCount: 2, pages: ['Rechnung 180,00', 'Transportauftrag 261000824 999,00'] }]
  const checked = validateInvoiceExtraction({ invoices: [invoice({ invoicePages: [1], netTotal: field('999,00') })] }, documents)[0]
  assert.equal(checked.netTotal.value, '')
  assert.equal(checked.documentTaCandidates[0].value, '261000824')
  assert.deepEqual(checked.invoicePages, [1])
  assert.throws(() => validateInvoiceExtraction({ invoices: [invoice({ invoicePages: [3] })] }, documents), error => error.details.technicalCode === 'invoice_page_reference_invalid')
})

const attachment = extra => ({ id: 'image', name: 'invoice.png', contentType: 'image/png', size: 68, '@odata.type': '#microsoft.graph.fileAttachment', ...extra })
test('invoice loader accepts image attachments, skips inline signatures, rejects incomplete lists and mismatched bytes', () => {
  assert.equal(validateInvoiceAttachments({ value: [attachment(), attachment({ isInline: true })] }).length, 1)
  assert.throws(() => validateInvoiceAttachments({ value: [attachment()], '@odata.nextLink': 'next' }))
  const png = Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')
  assert.equal(validateInvoiceAttachmentBytes(attachment({ contentBytes: png }), attachment()).contentType, 'image/png')
  assert.throws(() => validateInvoiceAttachmentBytes(attachment({ contentBytes: Buffer.from('%PDF-1.7').toString('base64') }), attachment()))
  assert.throws(() => validateInvoiceAttachmentBytes({ ...attachment({ contentBytes: png }), '@odata.type': '#microsoft.graph.itemAttachment' }, attachment()))
})

test('inference receives full context and image input, with no opaque IDs in provider request', async () => {
  let request
  const documents = [{ id: 'opaque-image-id', name: 'bill.png', contentType: 'image/png', text: 'Rechnung', contentBytes: 'YWJj', pageCount: 1 }]
  await inferInvoices({ documents, mail: { subject: 'TA 261000561', body: { content: 'Auftrag 261000824' } }, actorId: 'owner', apiKey: 'test-only', execute: async ({ operation }) => operation(), fetchImpl: async (_url, options) => {
    request = JSON.parse(options.body)
    return { ok: true, headers: { get: () => null }, json: async () => ({ status: 'completed', output_text: JSON.stringify({ invoices: [] }) }) }
  } })
  assert.equal(request.input[0].content.find(item => item.type === 'input_image').image_url, 'data:image/png;base64,YWJj')
  assert.match(JSON.stringify(request), /TA 261000561/)
  assert.ok(!JSON.stringify(request).includes('opaque-image-id'))
  assert.ok(request.text.format.schema.properties.invoices.items.required.includes('invoicePages'))
})

test('image OCR provides the same page-grounded evidence shape as PDF extraction', async () => {
  const { createCanvas } = await import('@napi-rs/canvas')
  const bytes = createCanvas(100, 100).toBuffer('image/png')
  const result = await extractInvoiceAttachment(bytes, { contentType: 'image/png', actorId: 'owner', apiKey: 'test-only', execute: async ({ operation }) => operation(), fetchImpl: async () => ({ ok: true, headers: { get: () => null }, json: async () => ({ status: 'completed', output_text: JSON.stringify({ pages: [{ number: 1, text: 'Rechnung 180,00 EUR', blank: false, uncertain: false }] }) }) }) })
  assert.equal(result.pageCount, 1)
  assert.deepEqual(result.pages, ['Rechnung 180,00 EUR'])
  assert.equal(result.extractionMethod, 'ocr_only')
})

test('oversized image dimensions stop before any OCR request', async () => {
  const { createCanvas } = await import('@napi-rs/canvas')
  const bytes = createCanvas(12001, 1).toBuffer('image/png')
  await assert.rejects(extractInvoiceAttachment(bytes, { contentType: 'image/png', actorId: 'owner', apiKey: 'test-only', fetchImpl: () => assert.fail('no request for oversized image') }), error => error.code === 'failed-precondition')
})

test('genuinely blank image is noninvoice context; animated image attachments fail explicitly', async () => {
  const { createCanvas } = await import('@napi-rs/canvas')
  const bytes = createCanvas(100, 100).toBuffer('image/png')
  const result = await extractInvoiceAttachment(bytes, { contentType: 'image/png', actorId: 'owner', apiKey: 'test-only', execute: async ({ operation }) => operation(), fetchImpl: async () => ({ ok: true, headers: { get: () => null }, json: async () => ({ status: 'completed', output_text: JSON.stringify({ pages: [{ number: 1, text: '', blank: true, uncertain: false }] }) }) }) })
  assert.equal(result.text, '')
  const header = Buffer.from([137,80,78,71,13,10,26,10])
  const animationChunk = Buffer.concat([Buffer.from([0,0,0,0]), Buffer.from('acTL'), Buffer.alloc(4)])
  assert.throws(() => validateInvoiceAttachmentBytes(attachment({ contentBytes: Buffer.concat([header, animationChunk]).toString('base64') }), attachment()), /Animierte/)
  assert.throws(() => validateInvoiceAttachmentBytes(attachment({ contentBytes: Buffer.from('GIF89a').toString('base64') }), attachment({ contentType: 'image/gif', name: 'proof.gif' })), /GIF/)
})

test('noninvoice OCR differences do not contaminate selected invoice pages or an explicit invoice TA', () => {
  const documents = [{ id: 'invoice', name: 'bundle.pdf', text: 'Rechnung Transport Auftrag 261000561\nCMR', pageCount: 2, pages: ['Rechnung Transport Auftrag 261000561', 'CMR'], ocrPages: [1,2], ocrUncertainPages: [2], ocrDifferencePages: [2] }]
  const raw = invoice({ invoicePages: [1], transports: [{ ta: field('261000561', 'Transport Auftrag 261000561'), taUncertain: true, taCandidates: [] }] })
  let checked = validateInvoiceExtraction({ invoices: [raw] }, documents)[0]
  assert.deepEqual(checked.ocrPages, [1])
  assert.deepEqual(checked.ocrUncertainPages, [])
  assert.deepEqual(checked.ocrDifferencePages, [])
  assert.equal(checked.transports[0].taUncertain, false)
  documents[0].pages[0] += ' oder TA 261000824'
  raw.transports[0].taCandidates = [field('261000824')]
  checked = validateInvoiceExtraction({ invoices: [raw] }, documents)[0]
  assert.equal(checked.transports[0].taUncertain, true)
})

test('VAT IDs and labelled invoice/account numbers do not become unrelated TA candidates',()=>{
 const candidates=invoiceContextTaCandidates([{id:'bill',name:'bill.pdf',text:'Rechnung 261999999 USt-IdNr DE317701646 VAT ID 317701647 Telefon: 317701648 Kundenkonto 317701649 TA 261000561'}])
 assert.deepEqual(candidates.map(candidate=>candidate.value),['261000561'])
})
