import test from 'node:test'
import assert from 'node:assert/strict'
import { splitMailConversation } from './mailboxConversation.js'

test('separates German and English Outlook header blocks and preserves the complete text', () => {
  const text = 'Neue Antwort\r\n\r\n________________\r\nVon: A <a@example.com>\r\nGesendet: Donnerstag\r\nAn: B\r\nCc: C\r\nBetreff: Auftrag\r\n\r\nÄltere Antwort\r\n\r\nFrom: B\r\nSent: Wednesday\r\nTo: A\r\nSubject: Order\r\n\r\nOriginal'
  const parts = splitMailConversation(text)
  assert.equal(parts.length, 3)
  assert.match(parts[1], /^________________/)
  assert.equal(parts.join(''), text)
})

test('recognizes reply markers and quoted headers without stripping quote characters', () => {
  for (const marker of ['Am 28.10.2026 um 12:00 schrieb Beispiel:', 'On Wed, 28 Oct 2026, Example wrote:', '> From: Example\n> Date: yesterday\n> To: Test\n> Subject: Delivery']) {
    const text = `Aktuell\n\n${marker}\n> Alte Antwort\n`
    assert.equal(splitMailConversation(text).length, 2)
    assert.equal(splitMailConversation(text).join(''), text)
  }
})

test('isolated labels, signatures and unknown formats remain unchanged', () => {
  for (const text of ['', 'Von: Hamburg\nAn: Berlin\nBitte abholen.', 'Mit freundlichen Grüßen\nName\nTelefon', '<script>alert(1)</script>\nFrom: text\nSubject: text']) assert.deepEqual(splitMailConversation(text), [text])
  const headerOnly = 'From: A\nSent: yesterday\nTo: B\nSubject: Order\n\nText'
  assert.deepEqual(splitMailConversation(headerOnly), [headerOnly])
})
