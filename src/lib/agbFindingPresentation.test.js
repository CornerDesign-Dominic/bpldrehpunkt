import test from 'node:test'
import assert from 'node:assert/strict'
import { splitAgbFinding } from './agbFindingPresentation.js'

test('saved document/page citations are separated without shortening the actual finding', () => {
  assert.deepEqual(splitAgbFinding('[994385_05022026_20260205103933.pdf, S.4] Kundenschutz für 1 Jahr. Vertragsstrafe 10.000,00 €.'), { text: 'Kundenschutz für 1 Jahr. Vertragsstrafe 10.000,00 €.', source: '994385_05022026_20260205103933.pdf, S.4' })
  assert.deepEqual(splitAgbFinding('[Seiten 3–4] Rückgabe binnen 14 Tagen.'), { text: 'Rückgabe binnen 14 Tagen.', source: 'Seiten 3–4' })
})

test('findings without recognizable citations and substantive bracketed text stay unchanged', () => {
  for (const value of ['Keine Umladung erlaubt.', '[Achtung] Vertragsstrafe 25 €.', '[Dokument.pdf, S.4]', 'Hinweis [Dokument.pdf, S.4] bleibt vollständig.']) assert.deepEqual(splitAgbFinding(value), { text: value, source: '' })
})
