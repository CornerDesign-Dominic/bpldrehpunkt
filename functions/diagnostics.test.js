import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { appendDiagnosticToBatch, buildDiagnosticEvent, buildDiagnosticQuery, DIAGNOSTIC_MODULES, normalizeClientDiagnostic } from './diagnostics.js'

test('diagnostic entries contain bounded, useful fields and no arbitrary payload', () => {
  const event = buildDiagnosticEvent({
    module: 'transport-route', stage: 'geocoding_destination', code: 'place_not_found',
    message: 'Ort konnte nicht bestimmt werden.', actorId: 'user-1', actorName: 'Test User',
    orderId: 'dev-order', originCountry: 'DE', destinationCountry: 'PT', createdAt: 'fixed-time',
    apiKey: 'must-not-be-stored', rawAddress: 'must-not-be-stored',
  })
  assert.deepEqual(event, {
    module: 'transport-route', stage: 'geocoding_destination', code: 'place_not_found',
    message: 'Ort konnte nicht bestimmt werden.', actorId: 'user-1', actorName: 'Test User',
    orderId: 'dev-order', originCountry: 'DE', destinationCountry: 'PT', createdAt: 'fixed-time',
  })
  assert.deepEqual(DIAGNOSTIC_MODULES, ['transport-route', 'tracking-preview', 'shipment-tracking', 'document-templates', 'website'])
  assert.throws(() => buildDiagnosticEvent({ module: 'unknown' }), /Unknown diagnostic module/)
})

test('document template diagnostics accept technical stages and reject arbitrary user messages', () => {
  assert.deepEqual(normalizeClientDiagnostic({ module: 'document-templates', stage: 'personal-signature-load', code: 'internal' }), {
    module: 'document-templates', stage: 'personal-signature-load', code: 'internal', orderId: '',
    message: 'Persönliche Unterschrift konnte nicht geladen werden.',
  })
  assert.deepEqual(normalizeClientDiagnostic({ module: 'document-templates', stage: 'company-stamp-load', code: 'invalid-response' }).message, 'Firmenstempel konnte nicht geladen werden.')
  assert.throws(() => normalizeClientDiagnostic({ module: 'document-templates', stage: 'personal-signature-missing', code: 'not-found' }), { code: 'invalid-argument' })
  assert.throws(() => normalizeClientDiagnostic({ module: 'document-templates', stage: 'personal-signature-load', code: 'not-found' }), { code: 'invalid-argument' })
  assert.throws(() => normalizeClientDiagnostic({ module: 'document-templates', stage: 'personal-signature-load', code: 'internal', orderId: 'other-order' }), { code: 'invalid-argument' })
})

test('shipment-tracking diagnostics only accept bounded technical metadata', () => {
  assert.deepEqual(normalizeClientDiagnostic({ module: 'shipment-tracking', stage: 'save', code: 'unavailable', orderId: 'dev-order-1', message: 'private text' }), {
    module: 'shipment-tracking', stage: 'save', code: 'unavailable', orderId: 'dev-order-1',
    message: 'Änderung der Sendungsverfolgung fehlgeschlagen.',
  })
  assert.deepEqual(normalizeClientDiagnostic({ module: 'website', stage: 'transport-orders', code: 'runtime-error' }), {
    module: 'website', stage: 'transport-orders', code: 'runtime-error', orderId: '',
    message: 'Ein unerwarteter Website-Fehler ist aufgetreten.',
  })
  assert.throws(() => normalizeClientDiagnostic({ module: 'shipment-tracking', stage: 'save', code: 'invalid-argument', orderId: 'dev-order-1' }), { code: 'invalid-argument' })
  assert.throws(() => normalizeClientDiagnostic({ module: 'website', stage: 'other', code: 'internal', orderId: 'dev-order-1' }), { code: 'invalid-argument' })
})

test('diagnostic filters are applied in Firestore before date ordering and pagination', () => {
  const calls = []
  const query = {
    where(...args) { calls.push(['where', ...args]); return this },
    orderBy(...args) { calls.push(['orderBy', ...args]); return this },
  }
  assert.equal(buildDiagnosticQuery(query, { module: 'transport-route', actorId: 'user-1', from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }), query)
  assert.deepEqual(calls.map(([operation, field]) => [operation, field]), [
    ['where', 'module'], ['where', 'actorId'], ['where', 'createdAt'], ['where', 'createdAt'], ['orderBy', 'createdAt'],
  ])
  assert.equal(calls[0][2], '==')
  assert.equal(calls[2][2], '>=')
  assert.equal(calls[3][2], '<')
  assert.deepEqual(calls.at(-1), ['orderBy', 'createdAt', 'desc'])
  assert.throws(() => buildDiagnosticQuery(query, { module: 'unknown' }), /Ungültiger Modulfilter/)
  assert.throws(() => buildDiagnosticQuery(query, { actorId: 'path/escape' }), /Ungültiger Benutzerfilter/)
  assert.throws(() => buildDiagnosticQuery(query, { from: '2026-10-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }), /Datumsbereich/)
})

test('route failures append an immutable diagnostic within the existing route batch', () => {
  const writes = []
  const db = { collection: (name) => ({ doc: () => `${name}/new-event` }) }
  const batch = { set: (reference, value) => writes.push({ reference, value }) }
  appendDiagnosticToBatch(batch, db, { module: 'transport-route', stage: 'routing', code: 'route_not_found', message: 'Keine LKW-Planungsstrecke gefunden.', actorId: 'user-1' })
  assert.equal(writes.length, 1)
  assert.equal(writes[0].reference, 'diagnosticEvents/new-event')
  assert.equal(writes[0].value.module, 'transport-route')
  assert.equal(writes[0].value.code, 'route_not_found')
  assert.ok(writes[0].value.createdAt)
})

test('diagnosis is admin-only through App Check and Firestore denies direct client access', async () => {
  const [index, rules, source, indexes] = await Promise.all([
    readFile(new URL('./index.js', import.meta.url), 'utf8'),
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('./diagnostics.js', import.meta.url), 'utf8'),
    readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'),
  ])
  assert.match(index, /export const listDiagnosticsPage = onCall\(\{ region: 'europe-west3', enforceAppCheck: true, invoker: 'public' \}, listDiagnosticsPageHandler\)/)
  assert.match(index, /export const reportClientDiagnostic = onCall\(\{ region: 'europe-west3', enforceAppCheck: true, invoker: 'public' \}, reportClientDiagnosticHandler\)/)
  assert.match(source, /requireActiveProfile\(request\)/)
  assert.match(source, /requireRole\(profile, \['admin', 'superadmin'\]/)
  assert.match(source, /limit\(PAGE_SIZE \+ 1\)/)
  assert.match(source, /diagnosticClientQuotas/)
  assert.match(rules, /match \/diagnosticEvents\/\{eventId\} \{ allow read, write: if false; \}/)
  assert.equal(JSON.parse(indexes).indexes.filter((item) => item.collectionGroup === 'diagnosticEvents').length, 3)
})
