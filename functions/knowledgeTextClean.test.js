import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanKnowledgeMailCopy } from './knowledgeTextClean.js'

test('learning cleanup removes clear headers, signatures and quoted history while keeping actual names and business details', () => {
  const input = 'Von: Max Beispiel <max@example.test>\nAn: Team <team@example.test>\nBetreff: Vorgang\n\nHallo Frau Müller,\nbitte prüfen Sie Auftrag 123 und den Betrag 20 EUR.\n\nMit freundlichen Grüßen\nMax Beispiel\nFirma GmbH\n'
  assert.equal(cleanKnowledgeMailCopy(input), 'Hallo Frau Müller,\nbitte prüfen Sie Auftrag 123 und den Betrag 20 EUR.')
  assert.equal(cleanKnowledgeMailCopy('Neue Antwort\n\nVon: Alt\nGesendet: gestern\nAn: Team\n\nAlter Text'), 'Neue Antwort')
  assert.equal(cleanKnowledgeMailCopy('Neue Antwort\n\nOn Tuesday, Max wrote:\nAlte Nachricht'), 'Neue Antwort')
})

test('HTML formatting and embedded media are ignored without loading attachments or changing body semantics', () => {
  assert.equal(cleanKnowledgeMailCopy('<p>Hallo&nbsp;Anna,</p><p>A &amp; B prüfen.<img src="cid:secret"></p><script>bad()</script>'), 'Hallo Anna,\nA & B prüfen.')
  assert.equal(cleanKnowledgeMailCopy('Bitte prüfen\n[Bild]\n[Anhang: Auftrag.pdf]\n[cid:image001]\nEnde'), 'Bitte prüfen\nEnde')
  assert.equal(cleanKnowledgeMailCopy('<p>Neue Antwort</p><blockquote>Alte Nachricht</blockquote>'), 'Neue Antwort')
  assert.equal(cleanKnowledgeMailCopy('Gewicht < 10 kg und Referenz 77.'), 'Gewicht < 10 kg und Referenz 77.')
})

test('conservative cleanup preserves inline content and does not mutate the original string', () => {
  const input = 'Antwort auf die Frage:\n> Alte Frage\nUnsere neue Antwort.\n\nViele Grüße sind in Vorlagen möglich.'
  assert.equal(cleanKnowledgeMailCopy(input), 'Antwort auf die Frage:\nUnsere neue Antwort.\n\nViele Grüße sind in Vorlagen möglich.')
  assert.ok(input.includes('> Alte Frage'))
  assert.equal(cleanKnowledgeMailCopy(null), '')
  assert.equal(cleanKnowledgeMailCopy('Von: Auftraggeber unbekannt'), 'Von: Auftraggeber unbekannt')
})
