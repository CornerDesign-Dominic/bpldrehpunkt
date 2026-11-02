import assert from 'node:assert/strict'
import test from 'node:test'
import { dycosImportWarnings } from './dycosOrderFetchFeedback.js'

test('document warnings explain the unresolved issue without exposing source payloads', () => {
  const result = dycosImportWarnings({ warningCodes: ['DOCUMENT_SOURCE_CONFLICT', 'DOCUMENT_NUMBER_CONFLICT', 'DOCUMENT_TYPE_UNCONFIRMED', 'DOCUMENT_CANCELLATION_UNCONFIRMED', 'DOCUMENT_DATE_UNCONFIRMED'] })
  assert.equal(result.length, 5)
  assert.match(result[1], /externe Belegnummern/)
  assert.match(result[2], /Belegart/)
  assert.match(result[4], /Belegdatum/)
  assert.equal(dycosImportWarnings({ warningCodes: ['DOCUMENT_NUMBER_CONFLICT', 'DOCUMENT_NUMBER_CONFLICT'] }).length, 1)
})
