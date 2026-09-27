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
