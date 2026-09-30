import assert from 'node:assert/strict'
import test from 'node:test'
import { crmIndustryValue } from './crmIndustry.js'

test('a legacy industry remains visible until CRM takes ownership of the field', () => {
  const legacy = { companyData: { industry: 'Transport' } }
  assert.equal(crmIndustryValue(legacy), 'Transport')
  assert.equal(crmIndustryValue({ ...legacy, crmIndustry: 'Logistik' }), 'Logistik')
  assert.equal(crmIndustryValue({ ...legacy, crmIndustry: '' }), '')
})
