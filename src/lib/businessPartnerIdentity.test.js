import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { businessPartnerRoles } from '../../shared/businessPartnerRoles.js'

test('canonical role facts keep provisional and aliased partners usable without primary accounting numbers', () => {
  const provisionalCarrier = { taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }
  const aliasedCustomer = { dycosReferences: { debtorNumbers: ['D-42'] } }
  const explicitlyMarkedCarrier = { businessPartnerRoles: ['carrier'] }

  assert.deepEqual(businessPartnerRoles(provisionalCarrier), { customer: false, carrier: true })
  assert.deepEqual(businessPartnerRoles(aliasedCustomer), { customer: true, carrier: false })
  assert.deepEqual(businessPartnerRoles(explicitlyMarkedCarrier), { customer: false, carrier: true })
})

test('CRM ratings delegate role determination to the central role helper', async () => {
  const source = await readFile(new URL('./crmRatings.js', import.meta.url), 'utf8')
  assert.match(source, /import \{ businessPartnerRoles \} from '..\/..\/shared\/businessPartnerRoles\.js'/)
  assert.match(source, /const roleFacts = businessPartnerRoles\(partner\)/)
  assert.doesNotMatch(source, /if \(partner\.(debtorNumber|creditorNumber)\?\.trim\(\)\) roles\.push/, 'CRM-Rollen dürfen nicht aus Primärnummern abgeleitet werden')
})

test('case and to-do selectors use the central role helper rather than accounting-number presence', async () => {
  const modules = [
    '../components/damages/DamageCaseForm.jsx',
    '../components/damages/DamageCaseEditModal.jsx',
    '../components/inkasso/InkassoCaseForm.jsx',
    '../components/legal-disputes/LegalDisputeCaseForm.jsx',
    '../components/todos/TodoForm.jsx',
    '../components/todos/TodoQuickEditModal.jsx',
  ]
  for (const modulePath of modules) {
    const source = await readFile(new URL(modulePath, import.meta.url), 'utf8')
    assert.match(source, /businessPartnerRoles\(partner\)\.(customer|carrier)/, modulePath)
    assert.doesNotMatch(source, /partners\.filter\(\(partner\) => partner\.(debtorNumber|creditorNumber)\?\.trim\(\)\)/, modulePath)
  }
})

test('Inkasso and legal selection controls preserve encoded canonical partner IDs', async () => {
  const modules = [
    '../components/inkasso/InkassoCaseForm.jsx',
    '../components/legal-disputes/LegalDisputeCaseForm.jsx',
  ]
  for (const modulePath of modules) {
    const source = await readFile(new URL(modulePath, import.meta.url), 'utf8')
    assert.match(source, /businessPartnerRoleSelectionValue\(/, modulePath)
    assert.match(source, /parseBusinessPartnerRoleSelection\(/, modulePath)
    assert.doesNotMatch(source, /value\.split\(':'\)/, modulePath)
  }
})

test('master data permits optional debtor and creditor references', async () => {
  const source = await readFile(new URL('../components/business-partners/BusinessPartnerForm.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Mindestens eine Debitoren- oder Kreditorennummer ist erforderlich/)
})

test('insolvency selection keeps the canonical partner ID independent of accounting references', async () => {
  const source = await readFile(new URL('../components/insolvencies/InsolvencyCaseForm.jsx', import.meta.url), 'utf8')
  assert.match(source, /partners\.find\(\(entry\) => entry\.id === form\.partnerId\)/)
  assert.match(source, /<option key=\{partner\.id\} value=\{partner\.id\}>/)
  assert.doesNotMatch(source, /partners\.filter\([^\n]*(creditorNumber|debtorNumber)/)
})
