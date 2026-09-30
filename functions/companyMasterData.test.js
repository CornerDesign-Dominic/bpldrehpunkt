import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCompanyMasterData, validateCompanyStamp } from './companyMasterData.js'

const blankCompany = Object.fromEntries([
  'legalName', 'tradeName', 'legalForm', 'managingDirector', 'street', 'postalCode', 'city', 'country',
  'phone', 'fax', 'email', 'billingEmail', 'website', 'contactPerson', 'registerCourt', 'registerNumber',
  'vatId', 'taxNumber', 'bankName', 'iban', 'bic',
].map((key) => [key, '']))

test('company master data requires a name and keeps only declared text fields', () => {
  assert.throws(() => validateCompanyMasterData(blankCompany), { code: 'invalid-argument' })
  assert.throws(() => validateCompanyMasterData({ ...blankCompany, legalName: 'Test GmbH', role: 'superadmin' }), { code: 'invalid-argument' })
  assert.throws(() => validateCompanyMasterData({ ...blankCompany, legalName: 'Test GmbH', email: 'invalid' }), { code: 'invalid-argument' })
  assert.deepEqual(validateCompanyMasterData({ ...blankCompany, legalName: '  Test GmbH  ' }), { ...blankCompany, legalName: 'Test GmbH' })
})

test('shared stamp accepts JPEG and PNG bytes but rejects mismatched formats and oversized files', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1])
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])
  assert.equal(validateCompanyStamp({ contentType: 'image/jpeg', base64: jpeg.toString('base64') }).contentType, 'image/jpeg')
  assert.equal(validateCompanyStamp({ contentType: 'image/png', base64: png.toString('base64') }).contentType, 'image/png')
  assert.throws(() => validateCompanyStamp({ contentType: 'image/png', base64: jpeg.toString('base64') }), { code: 'invalid-argument' })
  assert.throws(() => validateCompanyStamp({ contentType: 'image/jpeg', base64: Buffer.concat([jpeg, Buffer.alloc(2 * 1024 * 1024)]).toString('base64') }), { code: 'invalid-argument' })
})
