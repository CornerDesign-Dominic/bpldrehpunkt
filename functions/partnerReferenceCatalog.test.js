import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PARTNER_REFERENCE_CATALOG } from './partnerCluster.js'

const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const catalog = new Map(PARTNER_REFERENCE_CATALOG.map(({ collection, fields, originFields }) => [collection, new Set([...fields, ...(originFields || [])])]))

test('persisted partner and case reference fields are registered for every linked module', () => {
  const modules = [
    ['../src/lib/todos.js', 'todos', ['customerId', 'carrierId', 'damageCaseId', 'insolvencyId', 'legalDisputeId', 'inkassoCaseId', 'reference']],
    ['../src/lib/damages.js', 'damageCases', ['claimantPartnerId', 'contractorPartnerId', 'transportReference']],
    ['../src/lib/insolvencies.js', 'insolvencies', ['partnerId']],
    ['../src/lib/inkasso.js', 'inkassoCases', ['debtorPartnerId']],
    ['../src/lib/palletAccounts.js', 'palletMovements', ['partnerId', 'customerId', 'carrierId']],
  ]
  for (const [file, collection, required] of modules) {
    const text = source(file)
    for (const field of required) {
      assert.match(text, new RegExp(`\\b${field}\\b`), `${file}: ${field} no longer present; update reference audit`)
      assert.ok(catalog.get(collection)?.has(field), `${collection}.${field} is not in the central reference catalog`)
    }
    const persistedPartnerKeys = [...text.matchAll(/\b([A-Za-z]\w*(?:PartnerId|customerId|carrierId))\s*:/g)].map((match) => match[1])
    for (const field of persistedPartnerKeys) assert.ok(catalog.get(collection)?.has(field), `${file}: new partner field ${field} must be registered`)
  }
  assert.ok(catalog.get('palletClosings')?.has('partnerId'))
  assert.deepEqual([...catalog.get('legalDisputes')], ['transportReference'])
  assert.deepEqual([...catalog.get('transportOrders')].sort(), ['imported.carrier.partnerId', 'imported.customer.partnerId'])
})

test('CRM subcollections resolve by cluster, while calendars have no technical partner/case link', () => {
  for (const file of ['../src/lib/crmActivities.js', '../src/lib/crmRatings.js']) assert.match(source(file), /getPartnerCluster\(partnerId\)/)
  assert.doesNotMatch(source('../src/lib/calendars.js'), /\b(?:partnerId|customerId|carrierId|damageCaseId|insolvencyId|legalDisputeId|inkassoCaseId|transportOrderId)\b/)
})
