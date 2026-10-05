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

test('normalizes a matching time-only end to the complete start timestamp', () => {
  const result = parseTransportOrderCsv(`${header}\n${row('260400213', '10.09.2026 12:00', '12:00', '11.09.2026 08:00', '16:00')}`)
  assert.equal(result.rows[0].imported.loading.window.from, '2026-09-10T12:00')
  assert.equal(result.rows[0].imported.loading.window.until, '2026-09-10T12:00')
})

test('keeps a complete slot date and time unchanged', () => {
  const result = parseTransportOrderCsv(`${header}\n${row('260400211', '10.09.2026 07:00', '12.09.2026 14:00', '11.09.2026 08:00', '11.09.2026 16:00')}`)
  assert.equal(result.rows[0].imported.loading.window.from, '2026-09-10T07:00')
  assert.equal(result.rows[0].imported.loading.window.until, '2026-09-12T14:00')
})

test('marks invalid time values and duplicate DyCoS numbers as row errors', () => {
  const result = parseTransportOrderCsv(`${header}\n${row('260400212', '10.09.2026 07:00', '29:00', '11.09.2026 08:00', '16:00')}\n${row('260400212', '10.09.2026 07:00', '14:00', '11.09.2026 08:00', '16:00')}`)
  assert.match(result.rows[0].errors.join(' '), /Erste Ladestelle bis: Wert „29:00“ konnte nicht als Datum\/Uhrzeit gelesen werden/)
  assert.match(result.rows[0].errors.join(' '), /mehrfach vor/)
  assert.match(result.rows[1].errors.join(' '), /mehrfach vor/)
})

test('shows the original malformed date value in an import error', () => {
  const result = parseTransportOrderCsv(`${header}\n${row('260400214', '##########', '14:00', '11.09.2026 08:00', '16:00')}`)

  assert.deepEqual(result.rows[0].errors, ['Erste Ladestelle von: Wert „##########“ konnte nicht als Datum/Uhrzeit gelesen werden.'])
})

test('combines truck and trailer license plate columns while treating punctuation placeholders as empty', () => {
  const csv = [
    'Nummer;KundenNr.;FZ Name;Unternehmer;LKW-Kennz.;Trailer',
    '260400220;10000;Kunde GmbH;Unternehmer GmbH;KZ 123;KZ 456',
    '260400221;10000;Kunde GmbH;Unternehmer GmbH;.;-',
    '260400222;10000;Kunde GmbH;Unternehmer GmbH;;KZ 456',
    '260400223;10000;Kunde GmbH;Unternehmer GmbH;KZ 123 / KZ 456;',
  ].join('\n')
  const result = parseTransportOrderCsv(csv)

  assert.deepEqual(result.rows.map((entry) => entry.imported.shipment.licensePlate), ['KZ 123 / KZ 456', null, 'KZ 456', 'KZ 123 / KZ 456'])
})
