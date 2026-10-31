import assert from 'node:assert/strict'
import test from 'node:test'
import { isTrackingRecord, legacyTrackingDetailPath, orderRecordPath, orderRecordTab, orderRecordTabs } from './orderRecordTabs.js'

test('the two lists enter the same record at their intended tab', () => {
  assert.equal(orderRecordPath('dycos-123'), '/transportauftraege/dycos-123')
  assert.equal(orderRecordPath('dycos-123', 'tracking'), '/transportauftraege/dycos-123?tab=tracking')
  assert.equal(orderRecordTab('invalid'), 'overview')
  assert.equal(orderRecordTab(null), 'overview')
  assert.deepEqual(orderRecordTabs, ['overview', 'transport', 'partners', 'finance', 'tracking', 'history'])
})

test('legacy tracking addresses preserve identity and deep-link data while selecting tracking', () => {
  assert.equal(legacyTrackingDetailPath('50% /ä', '?tab=finance&refresh=abc', '#verlauf'), '/transportauftraege/50%25%20%2F%C3%A4?tab=tracking&refresh=abc#verlauf')
})

test('the tracking tab keeps the tracking navigation active without treating import as a record', () => {
  assert.equal(isTrackingRecord('/transportauftraege/dycos-123', '?tab=tracking'), true)
  assert.equal(isTrackingRecord('/transportauftraege/import', '?tab=tracking'), false)
  assert.equal(isTrackingRecord('/transportauftraege', '?tab=tracking'), false)
  assert.equal(isTrackingRecord('/transportauftraege/dycos-123', '?tab=finance'), false)
})
