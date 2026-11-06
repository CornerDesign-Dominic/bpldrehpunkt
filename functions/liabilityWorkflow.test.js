import assert from 'node:assert/strict'
import test from 'node:test'
import { findLiabilityTransportOrdersHandler, fetchLiabilityTransportOrderHandler, hasLiabilityAccess, liabilityOrderProjection, liabilityTaNumber, liabilityIncidentSummary, liabilityWordingPrompt, suggestLiabilityWordingHandler } from './liabilityWorkflow.js'
import { hasDycosImportAccess } from './dycosTransportOrders.js'
import { LIABILITY_WORDING_RULES } from './liabilityWordingRules.js'

const request = { auth: { uid: 'template-user' }, data: { taNummer: '123' } }
const allow = async () => ({ active: true, role: 'user', permissions: { templates: 'view' } })
const deny = async () => ({ active: true, role: 'admin', permissions: { dataImports: 'edit', transportOrders: 'edit' } })
const noDb = {}

test('template-only access is allowed without broadening general import rights', async () => {
  const profile = await allow()
  assert.equal(hasLiabilityAccess(profile), true)
  assert.equal(hasDycosImportAccess(profile), false)
  assert.equal(hasLiabilityAccess(await deny()), false)
  assert.equal(hasLiabilityAccess({ role: 'superadmin' }), true)
  const denyDependencies = { db: noDb, requireProfile: deny }
  await assert.rejects(findLiabilityTransportOrdersHandler(request, denyDependencies), { code: 'permission-denied' })
  await assert.rejects(fetchLiabilityTransportOrderHandler(request, denyDependencies), { code: 'permission-denied' })
  await assert.rejects(suggestLiabilityWordingHandler(request, denyDependencies), { code: 'permission-denied' })
})

test('canonical TA and bounded, nonempty incident inputs are required', () => {
  for (const taNummer of ['', '00123', '1e3', '1/2', '2147483648', 123]) assert.throws(() => liabilityTaNumber({ taNummer }), { code: 'invalid-argument' })
  assert.equal(liabilityTaNumber({ taNummer: ' 123 ' }), '123')
  for (const incidentSummary of ['', '  ', 'a'.repeat(4001), 22]) assert.throws(() => liabilityIncidentSummary({ incidentSummary }), { code: 'invalid-argument' })
  assert.equal(liabilityIncidentSummary({ incidentSummary: ' Ware beschädigt ' }), 'Ware beschädigt')
})

test('reduced projection exposes all known stops and no financial/contact/partner metadata', () => {
  const order = { externalNumber: '123', imported: { financial: { revenueNet: 900 }, carrier: { originalName: 'UTN', snapshot: { street: 'Quelle 1', postalCode: '12345' }, partnerId: 'secret' }, contacts: { carrierStandardEmail: 'private@example.com' }, stops: [{ sourceId: '7', type: 'loading', address: { company: 'A', street: 'Weg 2', postalCode: '23456', city: 'B', country: 'DE' }, window: { from: '2026-11-04T10:00' }, deliveryNoteNumber: 'private' }, { sourceId: '8', type: 'loading', address: { company: 'C' } }, { sourceId: '9', type: 'unloading', address: { company: 'D' } }, { sourceId: '10', type: 'unknown', note: 'private' }] } }
  const result = liabilityOrderProjection('order', order, { companyName: 'Stammname', address: { street: 'Andere Straße', houseNumber: '4', city: 'Berlin', country: 'DE' }, contact: { email: 'secret@example.com' }, bankData: 'secret' })
  assert.equal(result.carrier.company, 'UTN')
  assert.equal(result.carrier.street, 'Quelle 1')
  assert.equal(result.carrier.city, 'Berlin')
  assert.deepEqual(result.stops.map(stop => stop.id), ['7', '8', '9'])
  assert.equal(result.stops[0].date, '2026-11-04')
  assert.deepEqual(Object.keys(result).sort(), ['carrier', 'externalNumber', 'id', 'stops', 'warningCodes'])
  assert.equal(JSON.stringify(result).includes('private'), false)
  assert.equal(JSON.stringify(result).includes('secret'), false)
})

test('legacy CSV locations retain original text and flag incomplete data without inventing address fields', () => {
  const result = liabilityOrderProjection('csv', { externalNumber: '12', imported: { carrier: { originalName: 'Alt' }, loading: { originalText: 'Lager ABC, Straße 3', city: 'Hamburg', window: { from: '2026-11-03T10:00' } }, unloading: { originalText: 'Ziel unbekannt', window: {} } } })
  assert.equal(result.stops.length, 2)
  assert.equal(result.stops[0].city, 'Hamburg')
  assert.equal(result.stops[0].street, '')
  assert.equal(result.stops[0].originalText, 'Lager ABC, Straße 3')
  assert.ok(result.warningCodes.includes('CARRIER_ADDRESS_INCOMPLETE'))
  assert.ok(result.warningCodes.includes('LEGACY_STOP_ADDRESS'))
})

test('search is an exact bounded query and only returns the reduced view', async () => {
  const calls = []
  const query = { where: (...args) => { calls.push(args); return query }, limit: value => { calls.push(value); return query }, get: async () => ({ size: 1, docs: [{ id: 'ta', data: () => ({ externalNumber: '123', financial: 'secret' }) }] }) }
  const db = { collection: value => { assert.equal(value, 'transportOrders'); return query } }
  const result = await findLiabilityTransportOrdersHandler(request, { db, requireProfile: allow })
  assert.deepEqual(calls, [['externalNumber', '==', '123'], 11])
  assert.equal(result.orders.length, 1)
  assert.equal(JSON.stringify(result).includes('secret'), false)
})

test('wording reuses unchanged fixed rules and passes the published instructions', async () => {
  assert.ok(liabilityWordingPrompt('Stil').includes(LIABILITY_WORDING_RULES))
  let passed
  let quotaCalled = false
  const result = await suggestLiabilityWordingHandler({ auth: request.auth, data: { incidentSummary: 'Zu spät, Wartekosten' } }, { db: noDb, requireProfile: allow, environment: 'development', quota: async () => { quotaCalled = true }, getInstructions: async id => { assert.equal(id, 'haftbarhaltung'); return 'Veröffentlichte Regeln' }, runAi: async ({ operation, feature, userId }) => { assert.equal(feature, 'haftbarhaltung'); assert.equal(userId, 'template-user'); return operation() }, callAi: async (...args) => { passed = args; return { data: { incidentText: 'Durch verspätetes Eintreffen entstanden Kosten durch Wartezeiten.' } } } })
  assert.equal(quotaCalled, true)
  assert.deepEqual(passed, ['Zu spät, Wartekosten', 'Veröffentlichte Regeln'])
  assert.ok(result.incidentText)
})

test('unknown runtime rejects wording before any paid or quota operation', async () => {
  await assert.rejects(suggestLiabilityWordingHandler({ auth: request.auth, data: { incidentSummary: 'Schaden' } }, { db: noDb, requireProfile: allow, environment: 'unknown', quota: async () => assert.fail('Must not run') }), { code: 'failed-precondition' })
})

test('wording failures are diagnosed without source text and diagnostic failure preserves original error', async () => {
  let event
  await assert.rejects(suggestLiabilityWordingHandler({ auth: request.auth, data: { incidentSummary: 'Vertraulicher Sachverhalt' } }, { db: noDb, requireProfile: allow, environment: 'development', quota: async () => {}, runAi: async () => { throw Object.assign(new Error('provider detail'), { errorType: 'timeout' }) }, report: async value => { event = value; throw new Error('diagnostic down') } }), { code: 'unavailable' })
  assert.equal(event.code, 'timeout')
  assert.equal(event.actorId, 'template-user')
  assert.equal(JSON.stringify(event).includes('Vertraulicher'), false)
  assert.equal(JSON.stringify(event).includes('provider detail'), false)
})


test('imported null station addresses remain explicitly incomplete instead of being filled from notes', () => {
  const result = liabilityOrderProjection('ta', { externalNumber: '123', imported: { stops: [
    { sourceId: '1', type: 'loading', address: { company: null, street: null, postalCode: null, city: null, country: null }, window: { from: '2026-10-02T09:00' }, note: 'Abholung bei Beispiel, Weg 1, 12345 Ort', deliveryInformation: 'Im Auftrag von anderem Partner' },
    { sourceId: '2', type: 'unloading', address: null, window: {} },
  ] } })
  assert.deepEqual(result.stops[0].missingFields, ['company', 'street', 'postalCode', 'city', 'country'])
  assert.deepEqual(result.stops[1].missingFields, ['company', 'street', 'postalCode', 'city', 'country', 'date'])
  assert.equal(result.stops[0].date, '2026-10-02')
  assert.equal(result.stops[0].street, '')
  assert.equal(result.stops[0].originalText, '')
  assert.ok(result.warningCodes.includes('STOP_ADDRESS_INCOMPLETE'))
  assert.ok(result.warningCodes.includes('STOP_DATE_INCOMPLETE'))
  assert.equal(JSON.stringify(result).includes('Abholung'), false)
})

test('complete structured stops have no missing-field warning and legacy original text remains supported', () => {
  const structured = { sourceId: '1', type: 'loading', address: { company: 'Firma', street: 'Weg 1', postalCode: '12345', city: 'Ort', country: 'DE' }, window: { from: '2026-11-04T08:00' } }
  const result = liabilityOrderProjection('ta', { imported: { stops: [structured, { ...structured, sourceId: '2', type: 'unloading' }] } })
  assert.deepEqual(result.stops.map(stop => stop.missingFields), [[], []])
  assert.equal(result.warningCodes.includes('STOP_ADDRESS_INCOMPLETE'), false)
  const legacy = liabilityOrderProjection('ta', { imported: { loading: { originalText: 'Firma, Weg 1, 12345 Ort, DE', window: { from: '2026-11-04T08:00' } } } })
  assert.deepEqual(legacy.stops[0].missingFields, [])
})
