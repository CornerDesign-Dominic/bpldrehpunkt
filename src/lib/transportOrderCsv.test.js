import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTransportOrderCsv } from './transportOrderCsv.js'

const header = 'Nummer;KundenNr.;FZ Name;Unternehmer;Ankunft (Plan) 1.LD;Slot (Plan) 1.LD;Ankunft (Plan) letzte ED;Slot (Plan) letzte ED;Kosten;Ertrag;Gewicht;LDM;Kolli'
const row = (number, loadingFrom, loadingUntil, unloadingFrom, unloadingUntil) => `${number};10000;"Muster; Kunde";Unternehmer GmbH;${loadingFrom};${loadingUntil};${unloadingFrom};${unloadingUntil};1.234,56;2.000,00;1200;13,6;4`

test('parses UTF-8 BOM, quoted semicolon values and a time-only slot on the matching arrival date', () => {
  const result = parseTransportOrderCsv(`\uFEFF${header}\n${row('260400210', '10.09.2026 07:00', '14:00', '11.09.2026 08:00', '16:00')}`)
  assert.deepEqual(result.missingHeaders, [])
  assert.equal(result.rows[0].imported.customer.name, 'Muster; Kunde')
  assert.equal(result.rows[0].imported.loading.window.until, '2026-09-10T14:00')
  assert.equal(result.rows[0].imported.financial.costNet, 1234.56)
})

test('keeps a complete slot date and time unchanged', () => {
  const result = parseTransportOrderCsv(`${header}\n${row('260400211', '10.09.2026 07:00', '12.09.2026 14:00', '11.09.2026 08:00', '11.09.2026 16:00')}`)
  assert.equal(result.rows[0].imported.loading.window.from, '2026-09-10T07:00')
  assert.equal(result.rows[0].imported.loading.window.until, '2026-09-12T14:00')
})

test('marks invalid time values and duplicate DyCoS numbers as row errors', () => {
  const result = parseTransportOrderCsv(`${header}\n${row('260400212', '10.09.2026 07:00', '29:00', '11.09.2026 08:00', '16:00')}\n${row('260400212', '10.09.2026 07:00', '14:00', '11.09.2026 08:00', '16:00')}`)
  assert.match(result.rows[0].errors.join(' '), /ungültige Uhrzeit/)
  assert.match(result.rows[0].errors.join(' '), /mehrfach vor/)
  assert.match(result.rows[1].errors.join(' '), /mehrfach vor/)
})
