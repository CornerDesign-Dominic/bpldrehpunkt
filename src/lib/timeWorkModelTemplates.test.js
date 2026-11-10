import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTimeTemplateToDraft, copyTimeTemplateSchedule } from './timeWorkModelTemplates.js'
test('applying a soft template preserves employee and dates and severs all schedule references', () => {
  const template = { id: 'template', name: 'Büro', userId: 'wrong', validFrom: 'wrong', weekdays: { 1: { targetMinutes: 480, breaks: [{ afterMinutes: 360, requiredMinutes: 30 }] } } }
  const draft = { id: 'model', userId: 'person', validFrom: '2026-11-10', validTo: '2027-01-31' }
  const applied = applyTimeTemplateToDraft(draft, template)
  assert.equal(applied.id, 'model'); assert.equal(applied.userId, 'person'); assert.equal(applied.validFrom, draft.validFrom); assert.equal(applied.validTo, draft.validTo)
  applied.weekdays[1].breaks[0].requiredMinutes = 45
  assert.equal(template.weekdays[1].breaks[0].requiredMinutes, 30)
  template.weekdays[1].targetMinutes = 600
  assert.equal(applied.weekdays[1].targetMinutes, 480)
  assert.deepEqual(Object.keys(copyTimeTemplateSchedule(template)).sort(), ['holidayCountryCode', 'holidaySubdivisionCode', 'weekdays'])
})
