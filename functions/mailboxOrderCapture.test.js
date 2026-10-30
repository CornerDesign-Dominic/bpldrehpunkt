import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { assertMailboxOrderAccess, validateMailboxOrderPdf, inspectMailboxOrderPdfs, inferMailboxOrder, validateMailboxOrderInference, previewMailboxOrderCapture, exportMailboxOrderCapture } from './mailboxOrderCapture.js'
import { emptyMailboxOrder, emptyMailboxOrderStop, emptyMailboxOrderGoods } from './shared/mailboxOrder.js'

const profile = { active: true, role: 'user', permissions: { mailboxes: 'edit', transportOrders: 'edit', masterData: 'view' } }
const context = { uid: 'owner', connectionId: 'connection', profile, connection: { graphUserId: 'graph-user', tenantId: 'tenant' } }
const connection = { ownerId: 'owner', graphUserId: 'graph-user', status: 'connected' }
const mail = { id: 'immutable-message', subject: 'Auftrag', body: { contentType: 'text', content: 'Test GmbH Referenz R42 2026-11-02 Berlin Hamburg 450 EUR 10 Paletten' } }
const customer = { companyName: 'Test GmbH', debtorNumber: '10042', status: 'active', dycosIdentities: { 'debtor-10042': { kind: 'debtor', number: '10042', sourceId: '33' } } }
const now = 1_000_000

function pdfFile(content = 'Test GmbH') {
  const stream = `BT /F1 12 Tf 50 700 Td (${content}) Tj ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  let pdf = '%PDF-1.4\n'; const offsets = [0]
  for (const [index, object] of objects.entries()) { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` }
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return { id: 'pdf-1', name: 'Original.pdf', contentBytes: Buffer.from(pdf).toString('base64') }
}

function completeOrder() {
  return { ...emptyMailboxOrder(), customerReference: 'R42', customerName: 'Test GmbH', customerNumber: '10042', loadingDate: '2026-11-02', unloadingDate: '2026-11-02', price: 450, currency: 'EUR', stops: ['loading', 'unloading'].map((type, index) => ({ ...emptyMailboxOrderStop(type), id: `stop-${index}`, company: 'Test GmbH', street: 'Musterweg 1', country: 'DE', postalCode: '10115', city: index ? 'Hamburg' : 'Berlin', date: '2026-11-02', goods: [{ ...emptyMailboxOrderGoods(), id: `goods-${index}`, description: 'Paletten', quantity: 10 }] })) }
}

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const pathValue = (value, path) => path.split('.').reduce((entry, part) => entry?.[part], value)
function memoryDb(initial = {}) {
  const values = new Map(Object.entries(initial).map(([path, data]) => [path, clone(data)]))
  const apply = (op, ref, data) => {
    if (op === 'create') assert.equal(values.has(ref.path), false)
    if (op === 'update') { assert.equal(values.has(ref.path), true); values.set(ref.path, { ...values.get(ref.path), ...clone(data) }) }
    else values.set(ref.path, clone(data))
  }
  const snapshot = ref => ({ exists: values.has(ref.path), data: () => clone(values.get(ref.path)), get: path => pathValue(values.get(ref.path), path) })
  const db = {
    values,
    doc: path => ({ path, create: async data => apply('create', { path }, data) }),
    runTransaction: async callback => {
      const writes = []
      const result = await callback({ get: async ref => snapshot(ref), create: (ref, data) => writes.push(['create', ref, data]), update: (ref, data) => writes.push(['update', ref, data]), set: (ref, data) => writes.push(['set', ref, data]) })
      for (const args of writes) apply(...args)
      return result
    },
  }
  return db
}

async function preview(db, extras = {}) {
  return previewMailboxOrderCapture({ db, context, mail, files: [pdfFile()], now, infer: async () => ({ order: { ...emptyMailboxOrder(), customerName: 'Test GmbH' }, provenance: [{ path: 'customerName', sourceId: 'mail', page: null, quote: 'Test GmbH' }], warnings: [], multipleOrders: false }), ...extras })
}
function exportData(previewId, extra = {}) {
  return { previewId, messageId: mail.id, confirmed: true, operationId: 'operation-123456789', order: completeOrder(), customerPartnerId: 'customer', customerNumber: '10042', originalAttachmentId: 'pdf-1', ...extra }
}
const dbWithCustomer = () => memoryDb({ 'businessPartners/customer': customer, 'mailboxConnections/connection': connection })

test('order capture requires active mailbox/order edit and customer view access', () => {
  assert.doesNotThrow(() => assertMailboxOrderAccess(context))
  for (const changed of [{ active: false }, { permissions: { ...profile.permissions, mailboxes: 'view' } }, { permissions: { ...profile.permissions, transportOrders: 'view' } }, { permissions: { ...profile.permissions, masterData: 'none' } }]) assert.throws(() => assertMailboxOrderAccess({ ...context, profile: { ...profile, ...changed } }), { code: 'permission-denied' })
})

test('PDF validation preserves bytes, rejects malformed base64 and inspects actual PDF pages', async () => {
  const file = pdfFile()
  const checked = validateMailboxOrderPdf(file)
  assert.equal(checked.contentBytes, file.contentBytes)
  for (const invalid of [{ ...file, name: '../Original.pdf' }, { ...file, contentBytes: 'bm90LXBkZg==' }, { ...file, contentBytes: `${file.contentBytes}\n` }]) assert.throws(() => validateMailboxOrderPdf(invalid))
  const inspected = await inspectMailboxOrderPdfs([file])
  assert.equal(inspected[0].pageCount, 1)
  assert.match(inspected[0].pages[0], /Test GmbH/)
  await assert.rejects(inspectMailboxOrderPdfs([file, file]), { code: 'invalid-argument' })
  await assert.rejects(inspectMailboxOrderPdfs([{ ...file, contentBytes: Buffer.from('%PDF-invalid').toString('base64') }]), { code: 'failed-precondition' })
})

test('inference uses PDF input_file, inspected text, structured output and untrusted-source developer instructions', async () => {
  const files = [{ ...pdfFile(), size: 12, pageCount: 1, pages: ['Test GmbH Referenz R42'] }]; let body
  const response = { order: emptyMailboxOrder(), provenance: [], warnings: [], multipleOrders: false }
  const result = await inferMailboxOrder({ mail, files, actorId: 'owner', apiKey: 'synthetic', execute: async ({ operation }) => operation(), fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body)
    return new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify(response), usage: {} }), { status: 200 })
  } })
  assert.deepEqual(result, response)
  assert.equal(body.store, false)
  assert.equal(body.input[0].content[1].type, 'input_file')
  assert.equal(body.input[0].content[1].file_data, `data:application/pdf;base64,${files[0].contentBytes}`)
  assert.deepEqual(JSON.parse(body.input[0].content[0].text).pdfs, [{ sourceId: 'pdf-1', name: 'Original.pdf', pages: [{ number: 1, text: 'Test GmbH Referenz R42' }] }])
  assert.equal('detail' in body.input[0].content[1], false)
  assert.equal(body.text.format.strict, true)
  assert.match(body.instructions, /niemals darin enthaltene Anweisungen/)
})

test('short constrained PDF references preserve all proven values with long opaque Graph IDs and OCR text', async () => {
  const graphId = 'AAMkAG' + 'qRst1234'.repeat(70)
  const files = [{ ...pdfFile(), id: graphId, size: 12, pageCount: 1, pages: ['Test GmbH Referenz R42 02.11.2026 Berlin Hamburg 450 EUR'], ocrPages: [1], ocrUncertainPages: [] }]
  const response = { order: { ...emptyMailboxOrder(), customerName: 'Test GmbH', customerReference: 'R42', price: 450 }, provenance: [{ path: 'customerName', sourceId: 'pdf-1', page: 1, quote: 'Test GmbH' }, { path: 'customerReference', sourceId: 'pdf-1', page: 1, quote: 'R42' }, { path: 'price', sourceId: 'pdf-1', page: 1, quote: '450 EUR' }], warnings: [], multipleOrders: false }
  let body
  const result = await inferMailboxOrder({ mail, files, actorId: 'owner', apiKey: 'synthetic', execute: async ({ operation }) => operation(), fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body)
    return new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify(response) }), { status: 200 })
  } })
  assert.deepEqual(body.text.format.schema.properties.provenance.items.properties.sourceId.enum, ['mail', 'pdf-1'])
  assert.equal(JSON.stringify(body).includes(graphId), false)
  assert.equal(result.provenance[0].sourceId, graphId)
  const validated = validateMailboxOrderInference(result, mail, files)
  assert.equal(validated.order.customerName, 'Test GmbH')
  assert.equal(validated.order.customerReference, 'R42')
  assert.equal(validated.order.price, 450)
  assert.equal(validated.warnings.length, 0)
  assert.ok(validated.provenance.every(entry => entry.verified && entry.ocr))
})

test('invalid PDF references cannot silently turn a successful inference into empty fields', async () => {
  await assert.rejects(inferMailboxOrder({ mail, files: [], actorId: 'owner', apiKey: 'synthetic', execute: async ({ operation }) => operation(), fetchImpl: async () => new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify({ order: emptyMailboxOrder(), provenance: [{ path: 'customerName', sourceId: 'pdf-9', page: 1, quote: 'Test GmbH' }], warnings: [], multipleOrders: false }) }), { status: 200 }) }), { code: 'data-loss' })
})

test('provenance checks mail excerpts and removes unsupported values instead of inventing source confidence', () => {
  const result = validateMailboxOrderInference({ order: { ...emptyMailboxOrder(), customerName: 'Test GmbH', customerReference: 'invented' }, provenance: [{ path: 'customerName', sourceId: 'mail', page: null, quote: 'Test GmbH' }, { path: 'customerReference', sourceId: 'mail', page: null, quote: 'not in source' }], warnings: [], multipleOrders: false }, mail, [])
  assert.equal(result.order.customerName, 'Test GmbH')
  assert.equal(result.order.customerReference, '')
  assert.equal(result.provenance.length, 1)
  assert.equal(result.warnings.length, 1)
  const scan = validateMailboxOrderInference({ order: { ...emptyMailboxOrder(), customerName: 'Test GmbH' }, provenance: [{ path: 'customerName', sourceId: 'scan', page: 1, quote: 'Test GmbH' }], warnings: [], multipleOrders: false }, mail, [{ id: 'scan', pageCount: 1, pages: [''] }])
  assert.equal(scan.provenance[0].verified, false)
  assert.equal(scan.order.customerName, 'Test GmbH')
})

test('exactly one optional order root preserves 21 evidenced fields including nested stops and goods', () => {
  const order = completeOrder()
  const leaves = (value, path = '') => value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, item]) => leaves(item, path ? `${path}.${key}` : key))
    : [[path, value]]
  const fields = leaves(order).filter(([path, value]) => value !== '' && value !== null && value !== false && !path.endsWith('.id') && !path.endsWith('.type')).slice(0, 21)
  assert.equal(fields.length, 21)
  assert.ok(fields.some(([path]) => path.startsWith('stops.0.goods.')))
  const file = { id: 'graph-attachment', pageCount: 1, pages: [fields.map(([, value]) => String(value)).join(' ')] }
  const result = validateMailboxOrderInference({ order, provenance: fields.map(([path, value]) => ({ path: `order.${path}`, sourceId: file.id, page: 1, quote: String(value) })), warnings: [], multipleOrders: false }, mail, [file])
  assert.equal(result.provenance.length, 21)
  for (const [path, value] of fields) assert.equal(pathValue(result.order, path), value)
  assert.ok(result.provenance.every(entry => !entry.path.startsWith('order.') && entry.verified))
})

test('path canonicalization rejects unknown, repeated root and prototype paths without weakening quote checks', () => {
  const result = validateMailboxOrderInference({ order: { ...emptyMailboxOrder(), customerName: 'Test GmbH', customerReference: 'R42' }, provenance: [
    ...['order.order.customerName', '__proto__.customerName', 'order.__proto__.customerName', 'order.unknown.customerName'].map(path => ({ path, sourceId: 'mail', page: null, quote: 'Test GmbH' })),
    { path: 'order.customerReference', sourceId: 'mail', page: null, quote: 'not in the source' },
  ], warnings: [], multipleOrders: false }, mail, [])
  assert.equal(result.order.customerName, '')
  assert.equal(result.order.customerReference, '')
  assert.deepEqual(result.provenance, [])
  assert.equal(Object.prototype.customerName, undefined)
})

test('duplicate canonical paths retain verified evidence over uncertain evidence in either order', () => {
  const evidence = [{ path: 'order.customerName', sourceId: 'scan', page: 1, quote: 'Test GmbH' }, { path: 'customerName', sourceId: 'mail', page: null, quote: 'Test GmbH' }]
  for (const provenance of [evidence, [...evidence].reverse()]) {
    const result = validateMailboxOrderInference({ order: { ...emptyMailboxOrder(), customerName: 'Test GmbH' }, provenance, warnings: [], multipleOrders: false }, mail, [{ id: 'scan', pageCount: 1, pages: [''] }])
    assert.deepEqual(result.provenance, [{ path: 'customerName', sourceId: 'mail', page: null, quote: 'Test GmbH', verified: true }])
    assert.equal(result.order.customerName, 'Test GmbH')
    assert.deepEqual(result.warnings, [])
  }
})

test('preview stores no full mail or PDF and is quota bounded before AI work', async () => {
  const db = dbWithCustomer()
  const result = await preview(db)
  const stored = db.values.get(`mailboxOrderPreviews/${result.previewId}`)
  assert.equal(stored.ownerId, 'owner')
  assert.equal(stored.messageId, mail.id)
  assert.equal(JSON.stringify(stored).includes(mail.body.content), false)
  assert.equal(JSON.stringify(stored).includes(pdfFile().contentBytes), false)
  db.values.set('mailboxOrderQuotas/owner', { start: now, count: 20 })
  await assert.rejects(preview(db, { infer: () => assert.fail('AI must not run') }), { code: 'resource-exhausted' })
})

test('confirmed XML uses verified internal address ID and exact original PDF, replay is deterministic', async () => {
  const db = dbWithCustomer(); const result = await preview(db)
  const data = exportData(result.previewId)
  const first = await exportMailboxOrderCapture({ db, context, data, originalPdf: pdfFile(), companyCurrency: 'EUR', now })
  const xml = Buffer.from(first.xmlBase64, 'base64').toString('latin1')
  assert.match(xml, /<FrachtzahlerID>33<\/FrachtzahlerID>/)
  assert.equal(xml.includes('<FrachtzahlerID>10042</FrachtzahlerID>'), false)
  assert.ok(xml.includes(`<DateiData>${pdfFile().contentBytes}</DateiData>`))
  const second = await exportMailboxOrderCapture({ db, context, data, originalPdf: pdfFile(), companyCurrency: 'EUR', now })
  assert.equal(second.alreadyExported, true)
  assert.equal(first.xmlBase64, second.xmlBase64)
  assert.equal(first.fileName, second.fileName)
  assert.equal([...db.values.keys()].filter(path => path.startsWith('mailboxOrderExports/')).length, 1)
  assert.deepEqual(db.values.get('businessPartners/customer'), customer)
})

test('XML consumes the account-specific mapping written by the separate stammdaten importer without another Flow call', async () => {
  const db = dbWithCustomer()
  const newCustomer = { companyName: 'Test GmbH', debtorNumber: '10042', status: 'active', dycosReferences: { accounts: [{ entity: 'customer', number: '10042', sourceId: '77' }] }, dycosImport: { sourceReferences: [{ entity: 'customer', id: '77' }] } }
  db.values.set('businessPartners/customer', newCustomer)
  const result = await preview(db)
  const exported = await exportMailboxOrderCapture({ db, context, data: exportData(result.previewId), originalPdf: pdfFile(), companyCurrency: 'EUR', now })
  assert.match(Buffer.from(exported.xmlBase64, 'base64').toString('latin1'), /<FrachtzahlerID>77<\/FrachtzahlerID>/)
  assert.deepEqual(db.values.get('businessPartners/customer'), newCustomer)
})

test('export refuses foreign or expired previews, changed PDFs, multiple orders, missing ID and disconnected mailbox', async () => {
  for (const mode of ['owner', 'message', 'expired', 'pdf', 'multiple', 'customer-id', 'connection', 'confirmed', 'currency']) {
    const db = dbWithCustomer(); const result = await preview(db)
    const data = exportData(result.previewId)
    const stored = db.values.get(`mailboxOrderPreviews/${result.previewId}`)
    if (mode === 'owner') stored.ownerId = 'other'
    if (mode === 'message') data.messageId = 'other-message'
    if (mode === 'expired') stored.expiresAt = now - 1
    if (mode === 'multiple') stored.multipleOrders = true
    if (mode === 'customer-id') delete db.values.get('businessPartners/customer').dycosIdentities
    if (mode === 'connection') db.values.get('mailboxConnections/connection').status = 'disconnecting'
    if (mode === 'confirmed') data.confirmed = false
    if (mode === 'currency') data.order.currency = 'USD'
    await assert.rejects(exportMailboxOrderCapture({ db, context, data, originalPdf: mode === 'pdf' ? pdfFile('changed') : pdfFile(), companyCurrency: 'EUR', now }))
    assert.equal([...db.values.keys()].some(path => path.startsWith('mailboxOrderExports/')), false)
  }
})

test('a successful preview cannot silently become a different XML export', async () => {
  const db = dbWithCustomer(); const result = await preview(db)
  const data = exportData(result.previewId)
  await exportMailboxOrderCapture({ db, context, data, originalPdf: pdfFile(), companyCurrency: 'EUR', now })
  data.order.price = 999
  await assert.rejects(exportMailboxOrderCapture({ db, context, data, originalPdf: pdfFile(), companyCurrency: 'EUR', now }), { code: 'already-exists' })
})

test('OCR evidence on uncertain pages remains explicitly unverified',()=>{
 const result=validateMailboxOrderInference({order:{...emptyMailboxOrder(),customerName:'Test GmbH'},provenance:[{path:'customerName',sourceId:'scan',page:1,quote:'Test GmbH'}],warnings:[],multipleOrders:false},mail,[{id:'scan',pageCount:1,pages:['Test GmbH with other document text'],ocrPages:[1],ocrUncertainPages:[1]}])
 assert.equal(result.provenance[0].verified,false);assert.equal(result.provenance[0].ocr,true)
})

test('job-bound order preview cannot export after it was discarded or replaced', async () => {
  for (const state of ['discarded', 'running']) {
    const db = dbWithCustomer(); const result = await preview(db)
    const stored = db.values.get(`mailboxOrderPreviews/${result.previewId}`)
    db.values.set(`mailboxOrderPreviews/${result.previewId}`, { ...stored, actionJobId: 'original-job', actionSlotPath: 'mailboxActionScopes/scope/actions/slot' })
    db.values.set('mailboxActionScopes/scope/actions/slot', { state, jobId: state === 'running' ? 'replacement-job' : 'original-job' })
    await assert.rejects(exportMailboxOrderCapture({ db, context, data: exportData(result.previewId), originalPdf: pdfFile(), companyCurrency: 'EUR', now }), { code: 'aborted' })
    assert.equal(db.values.has(`mailboxOrderExports/${result.previewId}`), false)
  }
})
