import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createMailboxActionHandlers } from './mailboxActions.js'
import { applyMailboxRecord, previewMailboxRecord, searchRecordTargets } from './mailboxRecords.js'
import { canReadRecord, recordHash, recordVersion } from './mailboxRecordData.js'
import { extractRecordSources, validateRecordAttachments, validateRecordInference } from './mailboxRecordAi.js'
import { mailboxRecordKinds, recordAmount, recordInvoices, recordValues } from './shared/mailboxRecordFields.js'

const profile = { active: true, firstName: 'Test', lastName: 'User', role: 'user', department: 'Dispo', permissions: { mailboxes: 'edit', todos: 'edit', damages: 'edit', inkasso: 'edit', legalDisputes: 'edit', calendar: 'view', masterData: 'view' } }
const connectionId = 'a'.repeat(64), previewId = 'b'.repeat(48), messageId = 'incoming-mail', now = Date.UTC(2026, 9, 31)
function database() {
  const records = new Map(); let queue = Promise.resolve(), tick = 0
  const clone = value => {
    if (value?.constructor?.name === 'ServerTimestampTransform') return now + ++tick
    if (Array.isArray(value)) return value.map(clone)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]))
    return value
  }
  const doc = path => ({ path, id: path.split('/').at(-1), async get() { return { exists: records.has(path), data: () => clone(records.get(path)), ref: doc(path), id: path.split('/').at(-1) } }, async set(data, options) { records.set(path, options?.merge ? { ...records.get(path), ...clone(data) } : clone(data)) } })
  const collection = path => {
    const constraints = []; let size = Infinity, after = ''
    const query = { doc: id => doc(`${path}/${id}`), where(field, operator, value) { constraints.push([field, operator, value]); return query }, orderBy() { return query }, startAfter(value) { after = value; return query }, limit(value) { size = value; return query }, async get() {
      const docs = [...records].filter(([key, data]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/') && key.split('/').at(-1) > after && constraints.every(([field, op, value]) => op === '==' ? data[field] === value : op === '>=' ? data[field] >= value : data[field] < value)).sort(([a], [b]) => a.localeCompare(b)).slice(0, size).map(([key]) => ({ id: key.split('/').at(-1), ref: doc(key), data: () => clone(records.get(key)) }))
      return { docs }
    } }; return query
  }
  return { records, doc, collection, runTransaction(fn) {
    const result = queue.then(async () => {
      const writes = []; let written = false
      const tx = { async get(ref) { assert.equal(written, false, 'Firestore transactions must finish all reads before writes'); return ref.get() }, set(ref, value, options) { written = true; writes.push(['set', ref, value, options]) }, update(ref, value) { assert.ok(records.has(ref.path)); written = true; writes.push(['update', ref, value]) }, create(ref, value) { assert.equal(records.has(ref.path), false); written = true; writes.push(['create', ref, value]) } }
      const value = await fn(tx)
      for (const [type, ref, data, options] of writes) records.set(ref.path, type === 'update' || options?.merge ? { ...records.get(ref.path), ...clone(data) } : clone(data))
      return value
    }); queue = result.catch(() => {}); return result
  } }
}
function fixture(kind = 'todo', extra = {}) {
  const db = database()
  const connection = { ownerId: 'owner', status: 'connected', graphUserId: 'graph', tenantId: 'tenant' }
  const actor = { uid: 'owner', profile: structuredClone(profile), connectionId, connection, ref: db.doc(`mailboxConnections/${connectionId}`) }
  db.records.set(actor.ref.path, connection); db.records.set('users/owner', actor.profile)
  const slotPath = `mailboxActionScopes/${recordHash(`owner|${connectionId}`)}/actions/${recordHash(`${messageId}|${kind}`)}`
  const preview = { ownerId: 'owner', connectionId, kind, messageKey: recordHash(`tenant|graph|${messageId}`), expiresAt: Number.MAX_SAFE_INTEGER, actionJobId: 'job', actionSlotPath: slotPath, evidence: {}, summary: 'Zusammenfassung der Mail', warnings: [], source: { subject: 'Testmail', webLink: 'https://outlook.office.com/mail/test', files: [] }, ...extra }
  db.records.set(`mailboxRecordPreviews/${previewId}`, preview)
  db.records.set(slotPath, { jobId: 'job', kind, messageId, state: 'review', result: { previewId } })
  const data = { kind, previewId, messageId, mode: 'create', values: { title: 'Neue Aufgabe' }, selectedFields: [], note: 'Nutzerbestätigung' }
  return { db, actor, preview, data, slotPath, apply: values => applyMailboxRecord({ db, actor, data: { ...data, ...values }, now }) }
}
const values = {
  todo: { title: 'Ablieferbeleg anfordern', description: 'Bitte Unterlagen nachfordern.', dueDate: '2026-11-04', priority: 'high', reference: '261000764' },
  damage: { title: 'Bruch', description: 'Palette beschädigt', damageDate: '2026-10-30', damageType: 'Bruchschaden', damageAmount: '450.50', transportReference: '261000764', deadlineDate: '2026-11-05' },
  collection: { debtorName: 'Name aus Mail', collectionReference: 'AZ-442', invoiceNumbers: 'R-1', claimAmount: '1190', originalDueDate: '2026-10-20' },
  court: { transportReference: '261000764', counterparty: 'Gegenpartei GmbH', court: 'Amtsgericht Test', courtReference: 'AZ-774', deadlineDate: '2026-11-06' },
  calendar: { title: 'Rücksprache', description: 'Termin aus Mail', startDate: '2026-11-04', endDate: '2026-11-04', allDay: 'false', startTime: '10:00', endTime: '10:30' },
}
for (const kind of Object.keys(mailboxRecordKinds)) test(`${kind}: confirmed creation is atomic, numbered where applicable, auditable and replay-safe`, async () => {
  const f = fixture(kind)
  if (kind === 'collection') f.db.records.set('businessPartners/partner', { companyName: 'Verifizierter Schuldner', debtorNumber: '10010' })
  const input = { values: values[kind], calendarId: 'personal-owner', partnerId: 'partner', partnerRole: 'customer' }
  const [first, second] = await Promise.all([f.apply(input), f.apply(input)])
  assert.equal(first.targetPath, second.targetPath)
  const created = f.db.records.get(first.targetPath)
  assert.ok(created.createdAt); assert.equal(f.db.records.get(f.slotPath).state, 'completed')
  assert.equal([...f.db.records.keys()].filter(path => path.startsWith('mailboxRecordApplications/')).length, 1)
  assert.equal(f.db.records.get(`mailboxRecordApplications/${previewId}`).origin, 'KI')
  assert.equal(Object.hasOwn(created, 'mailboxSource'), false, 'Existing document key contracts are preserved')
  if (kind === 'collection') { assert.equal(created.caseNumber, 'I-2026-1'); assert.equal(created.debtorName, 'Verifizierter Schuldner') }
  if (kind === 'damage') { assert.equal(created.caseNumber, 'S-2026-0001'); assert.ok(f.db.records.has(`${first.targetPath}/deadlines/${previewId}`)) }
  if (kind === 'court') assert.equal(created.caseNumber, 'G-2026-0001')
  if (kind === 'calendar') { assert.equal(created.allDay, false); assert.equal(f.db.records.get('calendars/personal-owner').ownerUserId, 'owner') }
  await assert.rejects(f.apply({ ...input, note: 'Different replay' }), { code: 'already-exists' })
})

test('selected updates preserve unselected fields and reject concurrently changed records without partial writes', async () => {
  const f = fixture('damage')
  const previous = { title: 'S-2026-0010 – 2026-10-30', caseNumber: 'S-2026-0010', status: 'new', damageAmount: 10, damageDate: '2026-10-30', description: 'Bisheriger Text', updatedAt: 1 }
  f.db.records.set('damageCases/existing', previous)
  const request = { mode: 'update', targetPath: 'damageCases/existing', targetVersion: recordVersion('damage', previous), selectedFields: ['damageAmount'], values: { damageAmount: '20', description: 'Nicht ausgewählt' } }
  f.db.records.set('damageCases/existing', { ...previous, updatedAt: 2 })
  await assert.rejects(f.apply(request), { code: 'aborted' })
  assert.equal(f.db.records.has(`mailboxRecordApplications/${previewId}`), false)
  assert.equal(f.db.records.get('damageCases/existing').damageAmount, 10)
  f.db.records.set('damageCases/existing', previous)
  const result = await f.apply(request)
  assert.equal(f.db.records.get(result.targetPath).damageAmount, 20)
  assert.equal(f.db.records.get(result.targetPath).description, 'Bisheriger Text')
  assert.deepEqual(result.acceptedValues, { damageAmount: 20 })
})

test('private to-dos are neither listed nor mutable, and only creator / assignee can update / complete', async () => {
  const f = fixture('todo')
  const privateTodo = { title: 'Private Information', creatorUserId: 'other', audienceType: 'person', audienceId: 'other', status: 'in_progress', assignedUserId: 'other' }
  f.db.records.set('todos/private', privateTodo)
  f.db.records.set('todos/public', { ...privateTodo, audienceType: 'all', title: 'Öffentlich' })
  const listed = await searchRecordTargets({ db: f.db, actor: f.actor, kind: 'todo' })
  assert.deepEqual(listed.records.map(record => record.id), ['public'])
  for (const mode of ['note', 'update', 'close']) await assert.rejects(f.apply({ mode, targetPath: 'todos/private', targetVersion: recordVersion('todo', privateTodo), selectedFields: ['title'] }), { code: 'permission-denied' })
  await assert.rejects(f.apply({ mode: 'update', targetPath: 'todos/public', targetVersion: listed.records[0].version, selectedFields: ['title'] }), { code: 'permission-denied' })
  assert.equal(canReadRecord(f.actor, 'todo', privateTodo), false)
})

test('note only preserves domain fields, long audit notes stay compatible with native note limits', async () => {
  const f = fixture('court')
  const previous = { title: 'Gericht', status: 'open', transportReference: '261000764', updatedAt: 1 }
  f.db.records.set('legalDisputes/existing', previous)
  await f.apply({ mode: 'note', values: { amountInDispute: 'INVALID' }, targetPath: 'legalDisputes/existing', targetVersion: recordVersion('court', previous), note: 'Wichtiger Hinweis. '.repeat(150) })
  const actual = f.db.records.get('legalDisputes/existing')
  assert.equal(actual.title, previous.title); assert.equal(actual.transportReference, previous.transportReference)
  const notes = [...f.db.records].filter(([path]) => path.startsWith('legalDisputes/existing/updates/')).map(([, value]) => value)
  assert.ok(notes.length > 1); assert.ok(notes.every(note => note.text.length <= 1000 && note.type === 'note'))
})

test('calendar access is per-calendar, invalid or system targets are rejected and cancellation does not delete', async () => {
  const denied = fixture('calendar')
  denied.db.records.set('calendars/foreign', { ownerUserId: 'other', active: true })
  await assert.rejects(denied.apply({ values: values.calendar, calendarId: 'foreign' }), { code: 'permission-denied' })
  await assert.rejects(denied.apply({ values: values.calendar, calendarId: 'system-damages' }), { code: 'invalid-argument' })
  const f = fixture('calendar')
  f.db.records.set('calendars/shared', { ownerUserId: 'other', active: true })
  f.db.records.set('calendarPermissions/shared_owner', { userId: 'owner', calendarId: 'shared', level: 'edit' })
  const previous = { ...values.calendar, allDay: false, updatedAt: 1 }
  f.db.records.set('calendars/shared/events/event', previous)
  const result = await f.apply({ mode: 'close', targetPath: 'calendars/shared/events/event', targetVersion: recordVersion('calendar', previous), values: {} })
  assert.match(f.db.records.get(result.targetPath).title, /^Abgesagt: /)
  assert.equal(f.db.records.get(result.targetPath).startDate, previous.startDate)
})

test('discarded, replaced, foreign and revoked previews cannot mutate any destination', async () => {
  for (const mutate of [f => { f.preview.ownerId = 'other' }, f => { f.db.records.get(f.slotPath).state = 'discarded' }, f => { f.db.records.get(f.slotPath).jobId = 'replacement' }, f => { f.actor.profile.permissions.todos = 'view' }, f => { f.actor.connection.status = 'disconnected' }]) {
    const f = fixture(); mutate(f)
    await assert.rejects(f.apply({ values: values.todo }))
    assert.equal([...f.db.records.keys()].some(key => key.startsWith('todos/')), false)
  }
})

test('the background worker binds all five new actions yellow, proves completion and retires discarded previews', async () => {
  for (const kind of Object.keys(mailboxRecordKinds)) {
    const f = fixture(kind)
    f.db.records.delete(f.slotPath)
    const jobs = createMailboxActionHandlers({ db: f.db, project: 'db-bpl-drehpunkt-dev', now: () => now, requireProfile: async () => profile, handlers: { previewMailboxRecord: async request => {
      assert.equal(request.data.kind, kind)
      f.preview.actionJobId = null; f.preview.actionSlotPath = null
      return { previewId, kind, values: values[kind], summary: 'Test', warnings: [], sourceFiles: [] }
    } } })
    const request = data => ({ auth: { uid: 'owner' }, data: { connectionId, messageId, kind, ...data } })
    const started = await jobs.startMailboxAction(request())
    assert.equal(started.action.state, 'running')
    await jobs.processMailboxActionRun(started.action.jobId)
    assert.equal((await jobs.getMailboxAction(request())).action.state, 'review')
    assert.equal(f.db.records.get(`mailboxRecordPreviews/${previewId}`).actionJobId, started.action.jobId)
    await assert.rejects(jobs.updateMailboxAction(request({ action: 'complete', jobId: started.action.jobId })), { code: 'failed-precondition' })
    await jobs.updateMailboxAction(request({ action: 'discard', jobId: started.action.jobId }))
    await assert.rejects(f.apply({ values: values[kind] }))
  }
})

test('PDF scans use OCR once, images and text are read; unsupported sources are explicit and evidence is checked', async () => {
  let ocr = 0
  const files = [{ id: 'pdf', name: 'Scan.pdf', contentType: 'application/pdf', contentBytes: 'cGRm', '@odata.type': '#microsoft.graph.fileAttachment' }, { id: 'text', name: 'Notiz.txt', contentType: 'text/plain', contentBytes: Buffer.from('TA 261000764').toString('base64'), '@odata.type': '#microsoft.graph.fileAttachment' }, { id: 'zip', name: 'Archiv.zip', contentType: 'application/zip', '@odata.type': '#microsoft.graph.fileAttachment' }]
  files.push({ id: 'image', name: 'Foto.png', contentType: 'image/png', contentBytes: 'cG5n', '@odata.type': '#microsoft.graph.fileAttachment' })
  const extracted = await extractRecordSources({ mail: { subject: 'Schaden', body: { contentType: 'text', content: 'Palette beschädigt.' } }, files, actorId: 'owner', apiKey: 'test', imageText: async () => ({ text: 'Foto mit Transportreferenz 261000764', uncertain: false }), extractPdf: async () => { ocr++; return { text: 'Schadenbetrag 450,50 EUR', pageCount: 1, extractionMethod: 'ocr_only', ocrPages: [1] } } })
  assert.equal(ocr, 1); assert.equal(extracted.sourceFiles[0].method, 'ocr_only'); assert.equal(extracted.warnings.length, 1)
  assert.equal(extracted.sourceFiles[3].method, 'image_analysis')
  const inference = validateRecordInference('damage', { summary: 'Test', references: ['261000764'], fields: { damageAmount: { value: '450.50', sourceId: 'file-1', quote: 'Schadenbetrag 450,50 EUR' }, damageDate: { value: '2026-10-31', sourceId: 'file-1', quote: 'Invented quotation' } } }, extracted.sources)
  assert.equal(inference.values.damageAmount, 450.50); assert.equal(inference.values.damageDate, undefined); assert.equal(inference.warnings.length, 1)
  assert.throws(() => validateRecordAttachments({ value: [], '@odata.nextLink': 'more' }))
  assert.throws(() => recordValues('calendar', { ...values.calendar, endTime: '09:00' }, { required: true }))
})

test('previews match identifiers without domain writes and find events in all editable calendars', async () => {
  const f = fixture('calendar')
  f.db.records.set('calendars/personal-owner', { ownerUserId: 'owner', active: true, name: 'Mein Kalender' })
  f.db.records.set('calendars/shared', { ownerUserId: 'other', active: true, name: 'Team' })
  f.db.records.set('calendars/private', { ownerUserId: 'other', active: true, name: 'Privat' })
  f.db.records.set('calendarPermissions/shared_owner', { userId: 'owner', calendarId: 'shared', level: 'edit' })
  for (const calendar of ['personal-owner', 'shared', 'private']) f.db.records.set(`calendars/${calendar}/events/test`, values.calendar)
  const result = await previewMailboxRecord({ db: f.db, actor: f.actor, kind: 'calendar', messageId, mail: { subject: 'Termin' }, files: [], now, extract: async () => ({ sources: [], sourceFiles: [], warnings: [] }), infer: async () => ({ values: values.calendar, evidence: {}, summary: 'Termin aus Mail', references: [], warnings: [] }) })
  assert.equal(result.candidates.length, 2)
  assert.ok(result.candidates.every(record => !record.path.includes('private')))
  assert.equal(f.db.records.get('calendars/personal-owner/events/test').title, 'Rücksprache')
  assert.ok(f.db.records.has(`mailboxRecordPreviews/${result.previewId}`))
  assert.equal([...f.db.records.keys()].filter(path => path.includes('/events/')).length, 3)
})

test('cross-module paths, unknown fields, missing required values and calendar dates cannot be applied', async () => {
  const f = fixture('todo')
  await assert.rejects(f.apply({ mode: 'update', targetPath: 'damageCases/wrong-module', values: values.todo, selectedFields: ['title'] }), { code: 'invalid-argument' })
  await assert.rejects(f.apply({ values: values.todo, selectedFields: ['creatorUserId'] }), { code: 'invalid-argument' })
  await assert.rejects(f.apply({ values: { description: 'No title' } }), { code: 'invalid-argument' })
  assert.equal([...f.db.records.keys()].some(key => key.startsWith('todos/')), false)
  assert.throws(() => recordValues('calendar', { ...values.calendar, startDate: '2026-02-30' }), /Datum/)
})

test('warnings require acknowledgement, collection numbers continue existing counters, and linked names cannot be overwritten', async () => {
  const warning = fixture('todo', { warnings: ['Nicht unterstützter Anhang'] })
  await assert.rejects(warning.apply({ values: values.todo }), { code: 'failed-precondition' })
  await warning.apply({ values: values.todo, acceptWarnings: true })
  const f = fixture('collection')
  f.db.records.set('inkassoCases/legacy', { caseNumber: 'I-2026-400' })
  f.db.records.set('businessPartners/partner', { companyName: 'Schuldner', debtorNumber: '1234' })
  const created = await f.apply({ values: values.collection, partnerId: 'partner', partnerRole: 'customer' })
  assert.equal(f.db.records.get(created.targetPath).caseNumber, 'I-2026-401')
  const g = fixture('collection')
  const previous = { title: 'I-2026-1 – Schuldner', debtorName: 'Schuldner', debtorPartnerId: 'partner', updatedAt: 1 }
  g.db.records.set('inkassoCases/existing', previous)
  await g.apply({ mode: 'update', targetPath: 'inkassoCases/existing', targetVersion: recordVersion('collection', previous), values: { debtorName: 'Wrong name' }, selectedFields: ['debtorName'] })
  assert.equal(g.db.records.get('inkassoCases/existing').debtorName, 'Schuldner')
})

test('collection invoices are real native invoice rows, append to open claims, preserve payments and reject duplicates atomically', async () => {
  const f = fixture('collection')
  const previous = { title: 'I-2026-10 – Kunde', debtorName: 'Kunde', claimAmount: 50, paidAmount: 10, updatedAt: 1 }
  f.db.records.set('inkassoCases/existing', previous)
  f.db.records.set('inkassoCases/existing/invoices/old', { invoiceNumber: 'R-old', netAmount: 50, vatAmount: 0, grossAmount: 50, isPaid: false })
  const input = { mode: 'update', targetPath: 'inkassoCases/existing', targetVersion: recordVersion('collection', previous), values: {}, selectedFields: [], invoices: [{ invoiceNumber: 'R-new', netAmount: '200,00', vatAmount: '38,00' }] }
  const result = await f.apply(input)
  assert.equal(f.db.records.get(result.targetPath).claimAmount, 288)
  assert.equal(f.db.records.get(result.targetPath).paidAmount, 10)
  assert.equal(f.db.records.get(`${result.targetPath}/invoices/${previewId}-0`).grossAmount, 238)
  await f.apply(input)
  assert.equal([...f.db.records.keys()].filter(key => key.startsWith(`${result.targetPath}/invoices/`)).length, 2)
  const duplicate = fixture('collection')
  duplicate.db.records.set('inkassoCases/existing', previous)
  duplicate.db.records.set('inkassoCases/existing/invoices/old', { invoiceNumber: 'R-new' })
  await assert.rejects(duplicate.apply(input), { code: 'failed-precondition' })
  assert.equal(duplicate.db.records.get('inkassoCases/existing').claimAmount, 50)
  assert.equal(duplicate.db.records.has(`mailboxRecordApplications/${previewId}`), false)
})

test('German amounts normalize without guessing ambiguous separators or missing VAT', () => {
  assert.equal(recordAmount('450,50 EUR'), 450.5)
  assert.equal(recordAmount('1.234,56'), 1234.56)
  assert.equal(recordAmount('1,234.56'), 1234.56)
  assert.ok(Number.isNaN(recordAmount('1.234')))
  assert.ok(Number.isNaN(recordAmount('100 PLN')))
  assert.throws(() => recordInvoices([{ invoiceNumber: 'R-1', netAmount: '100', vatAmount: '' }]))
  assert.equal(recordInvoices([{ invoiceNumber: 'R-1', netAmount: '100', vatAmount: '0' }])[0].grossAmount, 100)
})
