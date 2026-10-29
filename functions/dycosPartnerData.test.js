import test from 'node:test'
import assert from 'node:assert/strict'
import { mapDycosPartnerData, dycosPartnerAdditions, combineDycosPartnerSources, hasDycosMasterDataAccess } from './dycosPartnerData.js'

const source = (kunde = {}, unternehmerstamm = null) => ({ kunde: { ID: 7, Firma: 'Beispielfirma', ...kunde }, unternehmerstamm, zahlungsbedingungKunde: { Bezeichnung: '30 Tage netto' }, zahlungsbedingungUnternehmer: null })

test('maps only explicitly supported business data and keeps all credentials/free text out', () => {
  const result = mapDycosPartnerData(source({ TelefonZentrale: '040 123', FaxZentrale: '040 456', EMailZentrale: 'office@example.test', Internet: 'www.example.test', USTID: 'DE123', Steuernummer: '123/456', Erfassungsdatum: '2020-05-04T09:00:00Z', IBAN: 'DE89 3704 0044 0532 0130 00', SWIFT: 'COBADEFFXXX', IBANgeprueft: true, IBANgeprueftDatum: '2020-06-01T00:00:00Z', Infos: 'password-do-not-copy', Transporeon_Kennwort: 'secret-do-not-copy', Kreditlimit: 9999, SprachenID: 2 })).customer.fields
  assert.equal(result.contact.phone, '040 123')
  assert.equal(result.contact.email, 'office@example.test')
  assert.equal(result.contact.website, 'https://www.example.test')
  assert.equal(result.companyData.vatId, 'DE123')
  assert.equal(result.paymentTermDays, '30 Tage netto')
  assert.equal(result.bankData.bic, 'COBADEFFXXX')
  assert.equal(result.bankData.iban, 'DE89370400440532013000')
  assert.equal(result.bankData.ibanVerifiedAt, '2020-06-01')
  assert.equal(result.dycosCreatedAt, '2020-05-04')
  assert.equal(result.creditLimit, undefined)
  assert.doesNotMatch(JSON.stringify(result), /password-do-not-copy|secret-do-not-copy/)
})

test('checkboxes are not email addresses; person groups, multiple emails and independent mobiles remain distinct', () => {
  const result = mapDycosPartnerData(source({}, { ID: 9, Bezeichnung: 'Transport', Ansprechpartner: 'Disponent', EMailAnsp: 'one@example.test; two@example.test', TelefonAnsp: '030 123', AbteilungAnsp: 'Disposition', Ansp1Mail: true, Ansp1HandyUTN: '+49 123' })).carrier.fields
  assert.equal(result.contact.email, '')
  assert.equal(result.contacts.filter((row) => row.email).length, 2)
  assert.equal(result.contacts.find((row) => row.mobile).name, '')
  assert.equal(result.contacts.find((row) => row.email).phone, '030 123')
  assert.equal(new Set(result.contacts.map((row) => row.id)).size, result.contacts.length)
})

test('multiple central emails are imported without inventing a default address', () => {
  const result = mapDycosPartnerData(source({ EMailZentrale: 'one@example.test;two@example.test' })).customer
  assert.equal(result.fields.contact.email, '')
  assert.equal(result.fields.contacts.length, 2)
  assert.deepEqual(result.warningCodes, ['PARTNER_MULTIPLE_GENERAL_EMAILS'])
})

test('existing manual values are preserved; only empty fields and missing contact data are added', () => {
  const existing = { companyName: 'Manuell gepflegt', contact: { phone: 'manuell', email: '' }, contacts: [{ id: 'manual-contact', name: 'Manueller Name', email: 'person@example.test', phone: '' }] }
  const incoming = { companyName: 'SQL Firma', contact: { phone: 'SQL Telefon', email: 'office@example.test' }, contacts: [{ id: 'sql-contact', name: 'SQL Name', email: 'PERSON@example.test', phone: '123', mobile: '', department: '', departmentOther: '' }] }
  const result = dycosPartnerAdditions(existing, incoming)
  assert.equal(result.patch.companyName, undefined)
  assert.equal(result.patch.contact.phone, undefined)
  assert.equal(result.patch.contact.email, 'office@example.test')
  assert.equal(result.patch.contacts[0].id, 'manual-contact')
  assert.equal(result.patch.contacts[0].name, 'Manueller Name')
  assert.equal(result.patch.contacts[0].phone, '123')
  assert.deepEqual(result.conflicts.map((entry) => entry.path), ['companyName', 'contact.phone', 'contacts.0.name'])
  assert.equal(existing.contacts[0].phone, '')
})

test('repeated additions are stable, source input is immutable and changed email receives a distinct contact ID', () => {
  const first = mapDycosPartnerData(source({ Ansprechpartner1: 'Person', EMailAnsp1: 'one@example.test' })).customer.fields
  const copy = structuredClone(first)
  const addition = dycosPartnerAdditions({}, first)
  const again = dycosPartnerAdditions(addition.patch, first)
  assert.deepEqual(again.changedFields, [])
  assert.deepEqual(first, copy)
  const changed = mapDycosPartnerData(source({ Ansprechpartner1: 'Person', EMailAnsp1: 'two@example.test' })).customer.fields
  assert.notEqual(first.contacts[0].id, changed.contacts[0].id)
})

test('dual-role sources do not choose a conflicting payment term or address by iteration order', () => {
  const combined = combineDycosPartnerSources([{ fields: { paymentTermDays: '14 Tage', contact: { phone: '123' }, contacts: [] } }, { fields: { paymentTermDays: '30 Tage', contact: { phone: '123' }, contacts: [] } }])
  assert.equal(combined.fields.paymentTermDays, undefined)
  assert.equal(combined.fields.contact.phone, '123')
  assert.equal(combined.conflicts[0].path, 'paymentTermDays')
})

test('a legacy payment-term text is not treated as empty and rich import requires master-data editing', () => {
  const result = dycosPartnerAdditions({ paymentTermsOriginal: '14 Tage netto' }, { paymentTermDays: '30 Tage netto' })
  assert.equal(result.patch.paymentTermDays, undefined)
  assert.equal(result.conflicts[0].currentValue, '14 Tage netto')
  assert.equal(hasDycosMasterDataAccess({ permissions: { dataImports: 'edit', masterData: 'view' } }), false)
  assert.equal(hasDycosMasterDataAccess({ permissions: { masterData: 'edit' } }), true)
  assert.equal(hasDycosMasterDataAccess({ role: 'superadmin' }), true)
})

test('customer credit-note flag maps explicitly but an existing false is not treated as an empty field', () => {
  const incoming = mapDycosPartnerData(source({ KundeSchicktGutschrift: true })).customer.fields
  assert.equal(incoming.creditNoteProcedure, true)
  const result = dycosPartnerAdditions({ creditNoteProcedure: false }, incoming)
  assert.equal(result.patch.creditNoteProcedure, undefined)
  assert.equal(result.conflicts.find((entry) => entry.path === 'creditNoteProcedure').currentValue, false)
})
