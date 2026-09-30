import assert from 'node:assert/strict'
import test from 'node:test'
import { automaticMailDeliveryPath, automaticMailDeliveryPaused } from './automaticMailDelivery.js'

test('the global automatic mail switch is active by default and pauses only explicitly', () => {
  assert.equal(automaticMailDeliveryPath, 'systemSettings/automaticMailDelivery')
  assert.equal(automaticMailDeliveryPaused(null), false)
  assert.equal(automaticMailDeliveryPaused({}), false)
  assert.equal(automaticMailDeliveryPaused({ paused: false }), false)
  assert.equal(automaticMailDeliveryPaused({ paused: true }), true)
})
