import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shipmentTrackingOperatingHours.js'
import { fallbackShipmentTrackingRuleCatalog } from './shipmentTrackingRuleCatalog.js'
import { shipmentTrackingDryRun } from './shipmentTrackingDryRun.js'

const carrierPolicy = (ids) => ({ shipmentTrackingPolicy: { carrier: { enabledRuleIds: Object.fromEntries(ids.map((id) => [id, true])) } } })
const customerPolicy = (policy) => ({ shipmentTrackingPolicy: { customer: policy } })
const imported = (from = '2026-12-07 10:00') => ({ customer: { partnerId: 'customer-1' }, carrier: { partnerId: 'carrier-1' }, loading: { window: { from } } })
const preview = (overrides = {}) => shipmentTrackingDryRun({
  imported: imported(),
  tracking: { recipients: { carrier: { email: 'carrier@example.test', source: 'manual' } } },
  customer: null,
  carrier: carrierPolicy(['licensePlate.external.reminder.2']),
  catalog: fallbackShipmentTrackingRuleCatalog(),
  operatingHours: DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS,
  now: '2026-12-04T14:00:00.000Z',
  ...overrides,
})

test('the dry run uses the dedicated customer requirement stage', () => {
  const result = preview({ customer: customerPolicy({ licensePlateImportant: true }), carrier: carrierPolicy([]) })
  assert.deepEqual(result.rules.map((rule) => [rule.ruleId, rule.source, rule.kind]), [['licensePlate.customer.required.internal', 'customer-required', 'internal']])
})

test('working hours are subtracted backwards across an evening and a closed weekend with an adjustment explanation', () => {
  const result = preview()
  const rule = result.rules[0]
  assert.equal(rule.scheduledAt, '2026-12-04T15:00:00.000Z')
  assert.equal(rule.adjustmentReason, 'Vorverlegt, da Samstag und Sonntag geschlossen sind.')
})

test('the customer requirement uses its own configurable offset instead of a carrier escalation offset', () => {
  const catalog = fallbackShipmentTrackingRuleCatalog()
  catalog.topics.licensePlate.customerRequirement.offsetWorkingHours = 6
  catalog.topics.licensePlate.internalEscalations[0].offsetWorkingHours = 2
  const result = preview({ customer: customerPolicy({ licensePlateImportant: true }), carrier: carrierPolicy([]), catalog })
  assert.deepEqual(result.rules.map((rule) => [rule.ruleId, rule.scheduledAt]), [['licensePlate.customer.required.internal', '2026-12-04T13:00:00.000Z']])
})

test('a Saturday loading slot produces the expected Friday 13:00 and 15:00 steps from current partner policies', () => {
  const result = preview({
    imported: { customer: { partnerId: 'customer-1' }, carrier: { partnerId: 'carrier-without-creditor-number' }, loading: { window: { from: '2026-12-05 07:00' } } },
    tracking: { lifecycleStatus: 'active', recipients: { carrier: { email: 'carrier@example.test', source: 'manual' } } },
    customer: customerPolicy({ licensePlateImportant: true }),
    carrier: { taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] }, shipmentTrackingPolicy: { carrier: { enabledRuleIds: { 'licensePlate.external.reminder.2': true } } } },
    now: '2026-12-04T10:00:00.000Z',
  })
  assert.deepEqual(result.rules.map((rule) => [rule.ruleId, rule.scheduledAt, rule.source]), [
    ['licensePlate.external.reminder.2', '2026-12-04T12:00:00.000Z', 'carrier'],
    ['licensePlate.customer.required.internal', '2026-12-04T14:00:00.000Z', 'customer-required'],
  ])
  assert.equal(result.diagnostics.some((entry) => entry.code === 'inactive-carrier-rule'), false)
})

test('a date-specific closed exception is respected during backwards scheduling', () => {
  const operatingHours = structuredClone(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS)
  operatingHours.exceptions = { '2026-12-11': { isOpen: false, from: null, to: null, note: 'Betriebsruhe' } }
  const result = preview({ imported: imported('2026-12-14 10:00'), operatingHours })
  assert.equal(result.rules[0].scheduledAt, '2026-12-10T15:00:00.000Z')
  assert.match(result.rules[0].adjustmentReason, /Freitag/)
})

test('missing earliest loading time returns a diagnostic instead of inventing a due time', () => {
  const result = preview({ imported: imported(null) })
  assert.equal(result.rules[0].scheduledAt, null)
  assert.ok(result.diagnostics.some((entry) => entry.code === 'missing-loading-time'))
})

test('external stages use only the stored carrier recipient and diagnose a missing address', () => {
  const configured = preview()
  assert.deepEqual(configured.rules[0].recipient, { role: 'carrier', email: 'carrier@example.test', state: 'configured' })
  const missing = preview({ tracking: { recipients: {} } })
  assert.deepEqual(missing.rules[0].recipient, { role: 'carrier', email: null, state: 'missing' })
  assert.ok(missing.hints.some((hint) => hint.description.startsWith('Unternehmer-Empfänger fehlt')))
})

test('an address without the explicit manual source can never become a tracking-mail recipient', () => {
  const result = preview({ tracking: { recipients: { carrier: { email: 'imported@example.test', source: 'import' } } } })
  assert.deepEqual(result.rules[0].recipient, { role: 'carrier', email: null, state: 'missing' })
})

test('internal stages never use a customer or carrier email address', () => {
  const result = preview({ customer: customerPolicy({ licensePlateImportant: true }), carrier: carrierPolicy([]), tracking: { recipients: { customer: { email: 'customer@example.test' }, carrier: { email: 'carrier@example.test' } } } })
  assert.deepEqual(result.rules[0].recipient, { role: 'internal', email: null, state: 'notApplicable' })
})

test('finished topic data suppresses only rules that are no longer needed', () => {
  const licensePlate = preview({ tracking: { licensePlate: 'B-PL 123', recipients: { carrier: { email: 'carrier@example.test' } } } })
  assert.equal(licensePlate.rules[0].status, 'notRequired')
  const loading = preview({ carrier: carrierPolicy(['loadingSite.external.reminder.1']), tracking: { actualArrivalLoadingAt: '2026-12-07T08:00:00.000Z', recipients: { carrier: { email: 'carrier@example.test' } } } })
  assert.equal(loading.rules[0].status, 'notRequired')
})

test('due and upcoming stages use the supplied reference time deterministically', () => {
  const due = preview({ now: '2026-12-04T16:00:00.000Z' })
  assert.equal(due.rules[0].status, 'due')
  assert.match(due.hints.find((hint) => hint.id.endsWith('-due')).description, /Kennzeichenregel seit 1 Std\. fällig/)
  const upcoming = preview({ now: '2026-12-04T14:00:00.000Z' })
  assert.equal(upcoming.rules[0].status, 'upcoming')
})

test('a successfully dispatched external rule is shown as sent and is no longer due or next', () => {
  const result = preview({
    now: '2026-12-04T16:00:00.000Z',
    tracking: {
      recipients: { carrier: { email: 'carrier@example.test' } },
      externalRuleDispatches: { 'licensePlate.external.reminder.2': { dispatchId: 'manual-example', sentAt: '2026-12-04T16:00:00.000Z' } },
    },
  })
  assert.equal(result.rules[0].status, 'sent')
  assert.equal(result.nextAction, null)
  assert.equal(result.hints.some((hint) => hint.id.endsWith('-due')), false)
})

test('a policy saved after tracking started is used by the next dry-run calculation', () => {
  const trackingStartedEarlier = { lifecycleStatus: 'active', recipients: { carrier: { email: 'carrier@example.test' } } }
  const beforePolicySave = preview({ tracking: trackingStartedEarlier, customer: customerPolicy({}), carrier: carrierPolicy([]) })
  const afterPolicySave = preview({ tracking: trackingStartedEarlier, customer: customerPolicy({}), carrier: carrierPolicy(['licensePlate.external.initial']) })
  assert.deepEqual(beforePolicySave.rules, [])
  assert.equal(beforePolicySave.nextAction, null)
  assert.ok(beforePolicySave.diagnostics.some((entry) => entry.code === 'no-active-rules'))
  assert.deepEqual(afterPolicySave.rules.map((rule) => rule.ruleId), ['licensePlate.external.initial'])
})

test('missing linked partners and unavailable catalog rules are diagnostics, not technical failures', () => {
  const missingPartners = preview({
    imported: { customer: { partnerId: 'missing-customer' }, carrier: { partnerId: 'missing-carrier' }, loading: { window: { from: '2026-12-07 10:00' } } },
    customer: null,
    carrier: null,
  })
  assert.deepEqual(missingPartners.rules, [])
  assert.ok(missingPartners.diagnostics.some((entry) => entry.code === 'missing-customer-partner'))
  assert.ok(missingPartners.diagnostics.some((entry) => entry.code === 'missing-carrier-partner'))

  const unavailableRule = preview({ carrier: carrierPolicy(['licensePlate.external.removed']) })
  assert.deepEqual(unavailableRule.rules, [])
  assert.ok(unavailableRule.diagnostics.some((entry) => entry.code === 'inactive-carrier-rule'))
})

test('missing catalog, missing partner link and no active policy explain an otherwise empty preview', () => {
  const missingCatalog = preview({ catalog: null })
  assert.deepEqual(missingCatalog.rules, [])
  assert.ok(missingCatalog.diagnostics.some((entry) => entry.code === 'missing-rule-catalog'))

  const missingCarrierLink = preview({ imported: { loading: { window: { from: '2026-12-07 10:00' } } } })
  assert.ok(missingCarrierLink.diagnostics.some((entry) => entry.code === 'missing-customer-link'))
  assert.ok(missingCarrierLink.diagnostics.some((entry) => entry.code === 'missing-carrier-link'))

  const noActivePolicy = preview({ customer: customerPolicy({}), carrier: carrierPolicy([]) })
  assert.ok(noActivePolicy.diagnostics.some((entry) => entry.code === 'no-active-rules'))
})

test('unusable operating hours yield a per-rule diagnosis instead of rejecting the preview', () => {
  const closed = structuredClone(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS)
  closed.weekly = Object.fromEntries(Object.keys(closed.weekly).map((day) => [day, { isOpen: false, from: null, to: null }]))
  const result = preview({ operatingHours: closed })
  assert.equal(result.rules.length, 1)
  assert.equal(result.rules[0].scheduledAt, null)
  assert.ok(result.diagnostics.some((entry) => entry.code === 'schedule-unavailable-licensePlate.external.reminder.2'))
})
