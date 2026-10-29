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

test('inference uses PDF input_file, structured output and untrusted-source developer instructions', async () => {
  const files = [{ ...pdfFile(), size: 12, pageCount: 1 }]; let body
  const response = { order: emptyMailboxOrder(), provenance: [], warnings: [], multipleOrders: false }
  const result = await inferMailboxOrder({ mail, files, actorId: 'owner', apiKey: 'synthetic', execute: async ({ operation }) => operation(), fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body)
    return new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify(response), usage: {} }), { status: 200 })
  } })
  assert.deepEqual(result, response)
  assert.equal(body.store, false)
  assert.equal(body.input[0].content[1].type, 'input_file')
  assert.equal(body.input[0].content[1].file_data, `data:application/pdf;base64,${files[0].contentBytes}`)
  assert.equal(body.text.format.strict, true)
  assert.match(body.instructions, /niemals darin enthaltene Anweisungen/)
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
