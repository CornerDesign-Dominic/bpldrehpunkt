import test from 'node:test'
import assert from 'node:assert/strict'
import { mailTriageSourceName } from './mailTriagePresentation.js'

test('original source references have readable names and cannot manufacture a filename', () => {
  assert.equal(mailTriageSourceName('body'), 'Aktuelle Nachricht')
  assert.equal(mailTriageSourceName('forwarded', {}, 'en'), 'Forwarded message')
  assert.equal(mailTriageSourceName('document-2', { documentNames: ['invoice.pdf', 'letter.pdf'] }), 'letter.pdf')
  assert.equal(mailTriageSourceName('document-1'), 'Anhang 1')
  assert.equal(mailTriageSourceName('document-100'), 'Quelle')
})
