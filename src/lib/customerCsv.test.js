import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCustomerCsv } from './customerCsv.js'

test('parses DyCoS customer CSV headers with whitespace, BOM and quoted values', () => {
  const csv = '\uFEFF Kunden- nummer ; Firma ; Strasse ; Land ; PLZ ; Ort ; Zahlungsbedingung ; Schickt Gutschrift ; Anspr1 ; Abteilung1 ; Mail1 ; Internet\n10042;"Muster; GmbH";Importstraße 7;DE;40210;Düsseldorf;30 Tage Netto;ausgewählt;Anne Beispiel;Disposition;anne@example.test;www.example.test'
  const result = parseCustomerCsv(csv)
  const row = result.rows[0]
  assert.deepEqual(result.missingHeaders, [])
  assert.equal(row.debtorNumber, '10042')
  assert.equal(row.companyName, 'Muster; GmbH')
  assert.equal(row.data.paymentTermDays, '30 Tage Netto')
  assert.equal(row.data.creditNoteProcedure, true)
  assert.equal(row.data.contacts[0].email, 'anne@example.test')
  assert.equal(row.data.website, 'www.example.test')
})

test('keeps payment wording without a day count and collects misfiled contact email values', () => {
  const csv = 'Kunden- nummer,Firma,Zahlungsbedingung,Anspr1,Abteilung1\n10043,Kunde GmbH,nach Vereinbarung,Allgemeiner Kontakt,mail@example.test'
  const row = parseCustomerCsv(csv).rows[0]
  assert.equal(row.errors.length, 0)
  assert.equal(row.data.paymentTermDays, 'nach Vereinbarung')
  assert.deepEqual(row.warnings, [])
  assert.equal(row.data.contacts[0].email, 'mail@example.test')
  assert.deepEqual(row.data.unusualValues, [{ field: 'contact1Department', value: 'mail@example.test' }])
})

test('marks missing required values and duplicate debtor numbers as errors', () => {
  const csv = 'Kunden- nummer;Firma\n10044;Kunde A\n10044;'
  const result = parseCustomerCsv(csv)
  assert.match(result.rows[0].errors.join(' '), /mehrfach vor/)
  assert.match(result.rows[1].errors.join(' '), /Pflichtwert fehlt/)
})
