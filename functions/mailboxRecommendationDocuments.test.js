import { Buffer } from 'node:buffer'
import test from 'node:test'
import assert from 'node:assert/strict'
import { recommendationDocumentType, extractRecommendationDocument } from './mailboxRecommendationDocuments.js'

const nativeText = 'Transport invoice for completed carriage. Invoice number 123. Customer reference 260000001. Agreed freight 500 EUR.'
const pdfBytes = Buffer.from('%PDF-1.7\nsynthetic')
const pdfFile = { name: 'Order.pdf', contentType: 'application/pdf', contentBytes: pdfBytes }
const imageUrl = 'data:image/png;base64,AAA='

function inspection(pages = [nativeText, nativeText], extra = {}) {
  const calls = { pages: [], cleaned: [], destroyed: 0, options: null }
  const loadPdf = async () => ({ getDocument: options => {
    calls.options = options
    return { promise: Promise.resolve({ numPages: extra.numPages || pages.length, getPage: async number => {
      calls.pages.push(number)
      if (number > 2) assert.fail('Only the first two PDF pages may be inspected')
      return { getTextContent: async () => { if (extra.failText) throw new Error('Unreadable PDF'); return { items: [{ str: pages[number - 1] || '' }] } }, cleanup: () => calls.cleaned.push(number) }
    } }), destroy: async () => { calls.destroyed++ } }
  } })
  return { calls, loadPdf }
}

function ocr(overrides = {}) {
  const calls = { fetch: 0, render: [], body: null, signal: null, operation: null, metadata: null }
  const renderPages = async (_, numbers) => { calls.render.push(numbers); return numbers.map(number => ({ number, dataUrl: imageUrl })) }
  const execute = async input => { calls.operation = input; const result = await input.operation(); calls.metadata = result; return result }
  const fetchImpl = async (_, options) => {
    calls.fetch++; calls.body = JSON.parse(options.body); calls.signal = options.signal
    return { ok: true, headers: { get: () => 'request-id' }, json: async () => ({ status: 'completed', usage: { input_tokens: 10, output_tokens: 10 }, output_text: JSON.stringify({ text: 'Rechnung 123 für unseren Transport.', uncertain: false, ...overrides }) }) }
  }
  return { calls, renderPages, execute, fetchImpl, actorId: 'actor', apiKey: 'synthetic' }
}

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.write('IHDR', 12, 'ascii'); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20)
  return bytes
}

function realPdf(texts) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count ${texts.length} /Kids [${texts.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  for (const [index, text] of texts.entries()) {
    const content = `BT /F1 12 Tf 20 100 Td (${text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')}) Tj ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`)
  }
  let source = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(source)
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(source)
}

test('metadata selects only supported noninline documents and accepts a PDF suffix', () => {
  assert.equal(recommendationDocumentType({ name: 'invoice.PDF', contentType: 'application/octet-stream' }), 'pdf')
  assert.equal(recommendationDocumentType({ contentType: 'text/plain; charset=utf-8' }), 'text')
  for (const contentType of ['image/png', 'image/jpeg', 'image/webp']) assert.equal(recommendationDocumentType({ contentType }), 'image')
  for (const file of [{ contentType: 'image/gif' }, { contentType: 'application/msword' }, { contentType: 'application/pdf', isInline: true }, { contentType: 'image/png', supported: false }, null]) assert.equal(recommendationDocumentType(file), null)
})

test('inline logos and unsupported attachments perform no decoding or AI request', async () => {
  const result = await extractRecommendationDocument({ contentType: 'image/png', isInline: true, contentBytes: Buffer.from('not even an image') }, { fetchImpl: () => assert.fail('No AI call') })
  assert.deepEqual(result, { text: '', method: 'unsupported', inspectedPages: [], uncertain: false })
})

test('native PDF inspection reads at most two pages and releases each page and the document', async () => {
  const pdf = inspection([nativeText, `Second page ${nativeText}`], { numPages: 1000 })
  const result = await extractRecommendationDocument(pdfFile, { loadPdf: pdf.loadPdf, renderPages: () => assert.fail('Native text must not trigger OCR') })
  assert.equal(result.method, 'pdf_text'); assert.match(result.text, /Second page/)
  assert.deepEqual(result.inspectedPages, [1, 2]); assert.deepEqual(pdf.calls.pages, [1, 2]); assert.deepEqual(pdf.calls.cleaned, [1, 2]); assert.equal(pdf.calls.destroyed, 1)
  assert.equal(pdf.calls.options.isEvalSupported, false); assert.equal(pdf.calls.options.enableScripting, false)
})

test('real three-page PDF exposes only first and second page text', async () => {
  const result = await extractRecommendationDocument({ ...pdfFile, contentBytes: realPdf([nativeText, `SECOND PAGE CONTENT ${nativeText}`, 'THIRD PAGE MUST NOT BE READ']) })
  assert.equal(result.method, 'pdf_text'); assert.match(result.text, /SECOND PAGE CONTENT/)
  assert.doesNotMatch(result.text, /THIRD PAGE/); assert.deepEqual(result.inspectedPages, [1, 2])
})

test('PDF failure still releases the current page and loading task', async () => {
  const pdf = inspection([''], { failText: true })
  await assert.rejects(extractRecommendationDocument(pdfFile, { loadPdf: pdf.loadPdf }))
  assert.deepEqual(pdf.calls.cleaned, [1]); assert.equal(pdf.calls.destroyed, 1)
})

test('scan fallback renders only missing native text and uses bounded lightweight OCR with usage metadata', async () => {
  const pdf = inspection(['scanner heading', nativeText]), ai = ocr()
  const result = await extractRecommendationDocument(pdfFile, { ...ai, loadPdf: pdf.loadPdf })
  assert.equal(result.method, 'pdf_ocr'); assert.equal(result.uncertain, false); assert.match(result.text, /Rechnung 123/); assert.match(result.text, /Transport invoice/)
  assert.deepEqual(ai.calls.render, [[1]]); assert.equal(ai.calls.fetch, 1)
  assert.equal(ai.calls.body.store, false); assert.equal(ai.calls.body.model, 'gpt-5.4'); assert.equal(ai.calls.body.max_output_tokens, 1200); assert.equal(ai.calls.body.tools, undefined)
  assert.match(ai.calls.body.instructions, /Dokumentüberschrift/); assert.match(ai.calls.body.instructions, /ersten zwei einleitenden Sätze/)
  assert.match(ai.calls.body.instructions, /maximal 1\.500 Zeichen/); assert.match(ai.calls.body.instructions, /Tabellen, Zahlungsdaten und Kleingedrucktes vollständig auslassen/)
  assert.match(ai.calls.body.instructions, /uncertain bezieht sich ausschließlich auf die Dokumentüberschrift/)
  assert.equal(ai.calls.operation.feature, 'mailbox_recommendation_attachment_ocr'); assert.equal(ai.calls.operation.userId, 'actor')
  assert.equal(ai.calls.metadata.pageCount, 1); assert.equal(ai.calls.metadata.fileSize, pdfBytes.length)
  assert.equal(ai.calls.body.input[0].content.filter(item => item.type === 'input_image').length, 1)
})

test('scanned CMR and invoice in the first two pages share one bounded OCR request', async () => {
  const pdf = inspection(['', ''], { numPages: 7 }), ai = ocr({ text: '[Seite 1]\nCMR Internationaler Frachtbrief\n[Seite 2]\nRechnung für Transportleistungen', uncertain: false })
  const result = await extractRecommendationDocument(pdfFile, { ...ai, loadPdf: pdf.loadPdf })
  assert.deepEqual(pdf.calls.pages, [1, 2]); assert.deepEqual(ai.calls.render, [[1, 2]])
  assert.equal(ai.calls.fetch, 1); assert.equal(ai.calls.metadata.pageCount, 2)
  assert.equal(ai.calls.body.max_output_tokens, 1200); assert.equal(ai.calls.body.store, false)
  const content = ai.calls.body.input[0].content
  assert.deepEqual(content.filter(item => item.type === 'input_text').map(item => JSON.parse(item.text).page), [1, 2])
  assert.equal(content.filter(item => item.type === 'input_image').length, 2)
  assert.match(ai.calls.body.instructions, /Verschiedene Dokumentarten auf verschiedenen Seiten sind kein Widerspruch/)
  assert.match(result.text, /CMR Internationaler Frachtbrief/); assert.match(result.text, /Rechnung für Transportleistungen/)
  assert.deepEqual(result.inspectedPages, [1, 2]); assert.equal(result.uncertain, false)
})

test('a scanned second page is inspected even if the first page has usable native text', async () => {
  const pdf = inspection([nativeText, '']), ai = ocr({ text: '[Seite 2]\nRechnung für Transportleistungen', uncertain: false })
  const result = await extractRecommendationDocument(pdfFile, { ...ai, loadPdf: pdf.loadPdf })
  assert.deepEqual(ai.calls.render, [[2]]); assert.equal(ai.calls.fetch, 1)
  assert.equal(JSON.parse(ai.calls.body.input[0].content[0].text).page, 2)
  assert.match(result.text, /Transport invoice/); assert.match(result.text, /\[Seite 2\]\nRechnung/)
})

test('uncertain OCR cannot provide usable text even when the second page has native text', async () => {
  for (const output of [{ text: 'Maybe an invoice', uncertain: true }, { text: 'Rechnung [unleserlich]', uncertain: false }]) {
    const pdf = inspection(['', nativeText]), ai = ocr(output)
    const result = await extractRecommendationDocument(pdfFile, { ...ai, loadPdf: pdf.loadPdf })
    assert.equal(result.text, ''); assert.equal(result.uncertain, true)
  }
})

test('OCR is not permitted to render additional PDF pages', async () => {
  const pdf = inspection(['', ''], { numPages: 3 }), ai = ocr()
  await assert.rejects(extractRecommendationDocument(pdfFile, { ...ai, loadPdf: pdf.loadPdf, renderPages: async () => [{ number: 1, dataUrl: imageUrl }, { number: 2, dataUrl: imageUrl }, { number: 3, dataUrl: imageUrl }] }))
  assert.equal(ai.calls.fetch, 0)
})

test('raster PNG, JPEG and WebP attachments use a single resized image without PDF processing', async () => {
  const { createCanvas } = await import('@napi-rs/canvas')
  const canvas = createCanvas(32, 24)
  try {
    canvas.getContext('2d').fillText('Invoice', 1, 12)
    for (const contentType of ['image/png', 'image/jpeg', 'image/webp']) {
      const ai = ocr()
      const result = await extractRecommendationDocument({ name: 'scan', contentType, contentBytes: canvas.toBuffer(contentType) }, { ...ai, loadPdf: () => assert.fail('No PDF parsing') })
      assert.equal(result.method, 'image_ocr'); assert.match(result.text, /Rechnung/); assert.equal(ai.calls.fetch, 1); assert.deepEqual(result.inspectedPages, [1])
    }
  } finally { canvas.width = 1; canvas.height = 1 }
})

test('pixel bombs and incorrect image or PDF signatures are rejected before decoding or AI', async () => {
  for (const file of [{ contentType: 'image/png', contentBytes: pngHeader(5000, 5000) }, { contentType: 'image/png', contentBytes: pngHeader(20001, 1) }, { contentType: 'image/png', contentBytes: pdfBytes }, { contentType: 'image/jpeg', contentBytes: pdfBytes }, { contentType: 'image/webp', contentBytes: pdfBytes }, { ...pdfFile, contentBytes: Buffer.from('not a PDF') }]) {
    await assert.rejects(extractRecommendationDocument(file, { renderImage: () => assert.fail('No raster decoding'), loadPdf: () => assert.fail('No PDF parsing'), fetchImpl: () => assert.fail('No AI call') }))
  }
})

test('UTF-8 text is capped, accepts canonical base64 and rejects malformed or binary input', async () => {
  const text = 'Transport completed. '.repeat(500)
  const result = await extractRecommendationDocument({ contentType: 'text/plain', contentBytes: Buffer.from(text).toString('base64') })
  assert.equal(result.method, 'text'); assert.equal(result.text.length, 6000); assert.equal(result.uncertain, false)
  for (const contentBytes of ['SGk', 'SGk= ', 'SGk-', 'SGn=', Buffer.from([255]), Buffer.from('binary\u0000data'), Buffer.alloc(5 * 1024 * 1024 + 1)]) await assert.rejects(extractRecommendationDocument({ contentType: 'text/plain', contentBytes }))
})

test('canonical base64 PDF is decoded before signature checks and byte usage logging', async () => {
  const pdf = inspection(['']), ai = ocr()
  await extractRecommendationDocument({ ...pdfFile, contentBytes: pdfBytes.toString('base64') }, { ...ai, loadPdf: pdf.loadPdf })
  assert.equal(ai.calls.metadata.fileSize, pdfBytes.length)
})

test('truncated or invalid OCR responses fail once without retry or usable text', async () => {
  for (const payload of [{ status: 'incomplete' }, { status: 'completed', output_text: '{bad' }, { status: 'completed', output_text: JSON.stringify({ text: 'invoice', uncertain: 'no' }) }]) {
    const pdf = inspection(['']), ai = ocr()
    let requests = 0
    await assert.rejects(extractRecommendationDocument(pdfFile, { ...ai, loadPdf: pdf.loadPdf, fetchImpl: async () => { requests++; return { ok: true, json: async () => payload } } }), { errorType: 'recommendation_document_ocr_failed' })
    assert.equal(requests, 1)
  }
})

test('aborted budget stops before parsing, rendering or starting an OCR request', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(extractRecommendationDocument(pdfFile, { signal: controller.signal, loadPdf: () => assert.fail('No parsing after cancellation') }), { name: 'AbortError' })
})

test('an aborted OCR request is bounded and never retried', async () => {
  const controller = new AbortController(), pdf = inspection(['']), ai = ocr()
  let requests = 0
  const timer = setTimeout(() => controller.abort(), 10)
  try {
    await assert.rejects(extractRecommendationDocument(pdfFile, { ...ai, loadPdf: pdf.loadPdf, signal: controller.signal, fetchImpl: async () => { requests++; return new Promise(() => {}) } }), { name: 'AbortError' })
    assert.equal(requests, 1); assert.equal(pdf.calls.destroyed, 1)
  } finally { clearTimeout(timer) }
})

test('an aborted document budget propagates to rendering and stops remaining page work with cleanup', async () => {
  const controller = new AbortController(), pdf = inspection(['', '']), ai = ocr()
  let rendered = false, cleaned = false, aborted = false
  const renderPages = async (_, numbers, { signal }) => {
    assert.deepEqual(numbers, [1, 2]); assert.equal(signal.aborted, false)
    rendered = true
    try {
      await new Promise((_, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(signal.reason) }, { once: true })
        controller.abort()
      })
      assert.fail('No page work may continue after cancellation')
    } finally { cleaned = true }
  }
  await assert.rejects(extractRecommendationDocument(pdfFile, { ...ai, loadPdf: pdf.loadPdf, renderPages, signal: controller.signal }), { name: 'AbortError' })
  assert.equal(rendered, true); assert.equal(aborted, true); assert.equal(cleaned, true)
  assert.equal(ai.calls.fetch, 0); assert.equal(pdf.calls.destroyed, 1)
})
