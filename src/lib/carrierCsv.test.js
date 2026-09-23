import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCarrierCsv } from './carrierCsv.js'

test('parses creditor CSV with whitespace in fixed DyCoS headers and maps payment, bank and partner-since fields', () => {
  const csv = '\uFEFF Unternehmer ; UTN/Lief.Nummer ; zugeordn. Kunde ; Zahlungsbedingung-1 ; IBAN ; BIC ; IBAN geprüft Datum ; Erfasst am ; TimoCom-Nr ; Internet\nSpedition A; 075397 ; 10689 ; 45 Tage Netto ; DE123 ; ABCDDEFF ; 21.09.2026 ; 01.01.2020 ; 34567 ; www.example.test'
  const parsed = parseCarrierCsv(csv)
  assert.deepEqual(parsed.missingHeaders, [])
  const row = parsed.rows[0]
  assert.equal(row.creditorNumber, '075397')
  assert.equal(row.data.linkedDebtorNumber, '10689')
  assert.equal(row.data.paymentTermDays, '45 Tage Netto')
  assert.equal(row.data.paymentTermsOriginal, '45 Tage Netto')
  assert.equal(row.data.iban, 'DE123')
  assert.equal(row.data.bic, 'ABCDDEFF')
  assert.equal(row.data.ibanVerifiedAt, '21.09.2026')
  assert.equal(row.data.dycosCreatedAt, '01.01.2020')
  assert.equal(row.data.timocomNumber, '34567')
  assert.equal(row.data.website, 'www.example.test')
})

test('deduplicates case-insensitive emails from contacts, Internet and Infos, ignoring other Infos text', () => {
  const csv = 'Unternehmer;UTN/Lief.Nummer;Ansprechpartner1;Abteilung Anspr.1;Telefon Anspr.1;HandyNr Anspr.1;Mail Anspr.1;Internet;Infos\nSpedition B;9;Anna;Disposition;123;456;Anna@Example.test;anna@example.test;Kontakt ANNA@example.test und neu@example.test. Sonstiger Text'
  const row = parseCarrierCsv(csv).rows[0]
  assert.equal(row.data.contacts.length, 2)
  assert.equal(row.data.contacts[0].name, 'Anna')
  assert.equal(row.data.contacts[0].email, 'anna@example.test')
  assert.equal(row.data.contacts[1].email, 'neu@example.test')
  assert.equal(row.data.contacts[1].name, '')
  assert.equal(row.data.website, '')
  assert.ok(!JSON.stringify(row.data.contacts).includes('Sonstiger Text'))
})

test('requires a creditor number and does not use a second payment condition', () => {
  const parsed = parseCarrierCsv('Unternehmer;UTN/Lief.Nummer;Zahlungsbedingung-1;Zahlungsbedingung-2\nA;;45 Tage Netto;90 Tage\nB;88;;60 Tage')
  assert.match(parsed.rows[0].errors.join(' '), /Kreditorennummer/)
  assert.equal(parsed.rows[1].data.paymentTermDays, '')
})
