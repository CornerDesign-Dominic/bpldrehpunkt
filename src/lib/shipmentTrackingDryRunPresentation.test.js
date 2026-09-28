import test from 'node:test'
import assert from 'node:assert/strict'
import { shipmentTrackingDryRunPresentation } from './shipmentTrackingDryRunPresentation.js'

test('the dry-run presentation formats the shared result without deriving another policy', () => {
  const model = shipmentTrackingDryRunPresentation({
    hints: [{ id: 'missing', description: 'Unternehmer-Empfänger fehlt' }],
    nextAction: { ruleId: 'r1', topic: 'licensePlate', title: 'Erinnerung an Unternehmer', recipient: { role: 'carrier', email: 'test@example.test', state: 'configured' }, scheduledAt: '2026-12-04T15:00:00.000Z', reason: '4 Arbeitsstunden vor frühester Beladung' },
    rules: [{ ruleId: 'r1', topic: 'licensePlate', title: 'Erinnerung an Unternehmer', recipient: { role: 'carrier', email: 'test@example.test', state: 'configured' }, scheduledAt: '2026-12-04T15:00:00.000Z', reason: '4 Arbeitsstunden vor frühester Beladung', status: 'upcoming', adjustmentReason: null }],
  })
  assert.equal(model.nextAction.topic, 'Kennzeichen')
  assert.equal(model.nextAction.recipient, 'test@…')
  assert.equal(model.entries[0].time, 'Fr., 16:00')
  assert.deepEqual(model.hints, [{ id: 'missing', description: 'Unternehmer-Empfänger fehlt' }])
})

test('an empty preview keeps its concrete dry-run diagnostic for the UI', () => {
  const model = shipmentTrackingDryRunPresentation({ rules: [], hints: [{ id: 'catalog', description: 'Der globale Regelkatalog fehlt.' }], diagnostics: [{ code: 'missing-rule-catalog', message: 'Der globale Regelkatalog fehlt. Wirksame Regelstufen können nicht bestimmt werden.' }] })
  assert.equal(model.nextAction, null)
  assert.equal(model.emptyMessage, 'Der globale Regelkatalog fehlt. Wirksame Regelstufen können nicht bestimmt werden.')
})

test('the action overview shows only documented states and hides not-required rules', () => {
  const recipient = { role: 'carrier', state: 'configured', email: 'test@example.test' }
  const model = shipmentTrackingDryRunPresentation({ rules: [
    { ruleId: 'planned', topic: 'licensePlate', kind: 'external', recipient, scheduledAt: '2026-12-04T17:00:00.000Z', status: 'upcoming' },
    { ruleId: 'due', topic: 'loadingSite', kind: 'external', recipient, scheduledAt: '2026-12-04T15:00:00.000Z', status: 'due' },
    { ruleId: 'sent', topic: 'licensePlate', kind: 'external', recipient, scheduledAt: '2026-12-04T14:00:00.000Z', status: 'sent', dispatch: { sentAt: { seconds: Date.parse('2026-12-04T15:30:00.000Z') / 1000 } } },
    { ruleId: 'skipped', topic: 'loadingSite', kind: 'internal', recipient: { role: 'internal', state: 'notApplicable' }, scheduledAt: '2026-12-04T13:00:00.000Z', status: 'skipped', pause: { from: '2026-12-04T12:00:00.000Z', until: '2026-12-04T14:00:00.000Z' } },
    { ruleId: 'blocked', topic: 'licensePlate', kind: 'external', recipient: { role: 'carrier', state: 'missing', email: null }, scheduledAt: '2026-12-04T18:00:00.000Z', status: 'upcoming' },
  ] }, { now: '2026-12-04T16:00:00.000Z' })

  assert.deepEqual(model.entries.map((entry) => entry.state), ['planned', 'missed', 'sent', 'skipped', 'blocked'])
  assert.deepEqual(model.summary, { planned: 1, missed: 1, sent: 1, skipped: 1, blocked: 1 })
  assert.match(model.entries[0].statusText, /^Geplant in 1 Std\.$/)
  assert.match(model.entries[1].statusText, /^Seit 1 Std\. verpasst$/)
  assert.match(model.entries[2].statusText, /^Versendet /)
  assert.equal(model.entries[3].statusText, 'Wegen Pausierung übersprungen')
  assert.match(model.entries[3].pauseText, /Automatik war von/)
  assert.equal(model.entries[4].statusText, 'Blockiert – Unternehmer-Empfänger fehlt')
})

test('the action overview combines only simultaneous internal customer and carrier triggers', () => {
  const at = '2026-12-04T15:00:00.000Z'
  const model = shipmentTrackingDryRunPresentation({ rules: [
    { ruleId: 'license.carrier.internal', topic: 'licensePlate', kind: 'internal', recipient: { role: 'internal', state: 'notApplicable' }, scheduledAt: at, status: 'due', source: 'carrier' },
    { ruleId: 'license.customer.required', topic: 'licensePlate', kind: 'internal', recipient: { role: 'internal', state: 'notApplicable' }, scheduledAt: at, status: 'due', source: 'customer-required' },
    { ruleId: 'loading.customer.required', topic: 'loadingSite', kind: 'internal', recipient: { role: 'internal', state: 'notApplicable' }, scheduledAt: '2026-12-04T14:00:00.000Z', status: 'due', source: 'customer-required' },
  ] }, { now: '2026-12-04T16:00:00.000Z' })

  assert.equal(model.entries.length, 2)
  assert.deepEqual(model.entries[0].ruleIds, ['license.carrier.internal', 'license.customer.required'])
  assert.equal(model.entries[0].trigger, 'Unternehmer und Kunde wichtig')
  assert.equal(model.entries[1].trigger, 'Kunde wichtig')
})

test('the action overview explains a rule skipped after an imported date change', () => {
  const model = shipmentTrackingDryRunPresentation({ rules: [{ ruleId: 'skipped-by-import', topic: 'loadingSite', kind: 'external', recipient: { role: 'carrier', state: 'configured', email: 'test@example.test' }, scheduledAt: '2026-12-04T13:00:00.000Z', status: 'skipped', pause: { reason: 'import-date-change' } }] }, { now: '2026-12-04T16:00:00.000Z' })
  assert.equal(model.entries[0].statusText, 'Wegen Terminänderung übersprungen')
  assert.match(model.entries[0].pauseText, /Terminänderung beim Import/)
})
