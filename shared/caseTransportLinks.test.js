import assert from 'node:assert/strict'
import test from 'node:test'
import { CASE_TRANSPORT_CASE_TYPE_IDS, businessPartnerRoleSelectionValue, caseCreationDefaults, caseDetailPath, caseTransportLinkId, filterTransportOrders, loadCaseTransportLinks, parseBusinessPartnerRoleSelection, transportOrderCasePrefill, transportOrderCaseTypeOrder, visibleCaseTransportCaseTypes } from './caseTransportLinks.js'

const order = {
  id: 'dycos-4711', externalNumber: 'TA-4711',
  imported: {
    customer: { partnerId: 'customer-1', name: 'Kunde GmbH', debtorNumber: '100' },
    carrier: { partnerId: 'carrier-1', originalName: 'Unternehmer KG', creditorNumber: '200' },
    loading: { reference: 'REF-99' },
  },
}

test('TA → neue Fälle use the same central context', () => {
  const prefill = transportOrderCasePrefill(order)
  assert.deepEqual(caseCreationDefaults('damage', prefill), {
    transportReference: 'TA-4711', description: 'TA TA-4711 · Referenz REF-99', claimantPartnerId: 'customer-1', claimant: 'Kunde GmbH', contractorPartnerId: 'carrier-1', contractor: 'Unternehmer KG',
  })
  assert.deepEqual(caseCreationDefaults('inkasso', prefill), { debtorPartnerId: 'carrier-1', debtorPartnerRole: 'carrier', debtorName: 'Unternehmer KG', debtorNumber: '200' })
  assert.deepEqual(caseCreationDefaults('pallet', prefill), { title: 'Palettenfall zu TA TA-4711', description: 'Referenz: REF-99' })
})

test('role selections preserve canonical partner IDs with URL and delimiter characters', () => {
  for (const partnerId of ['Partner mit Leerzeichen', '100% Logistik', 'Müller & Söhne', 'carrier:west%20']) {
    const selection = businessPartnerRoleSelectionValue('carrier', partnerId)
    assert.deepEqual(parseBusinessPartnerRoleSelection(selection), { role: 'carrier', partnerId })
  }
  assert.deepEqual(parseBusinessPartnerRoleSelection('carrier:%E0%A4%A'), { role: '', partnerId: '' })
})

test('an existing TA can be linked to an existing case without duplicates', () => {
  const links = new Set()
  const link = caseTransportLinkId('damage', 'damage-1', 'dycos-4711')
  links.add(link)
  links.add(link)
  assert.equal(links.size, 1)
  assert.notEqual(link, caseTransportLinkId('inkasso', 'damage-1', 'dycos-4711'))
})

test('search covers TA number, customer, carrier and reference', () => {
  for (const needle of ['4711', 'kunde', 'unternehmer', 'ref-99']) assert.equal(filterTransportOrders([order], needle).length, 1)
})

test('no case links load as an empty result without an error', async () => {
  let readCalls = 0
  const result = await loadCaseTransportLinks({
    caseTypes: ['damage', 'inkasso', 'legalDispute'],
    listLinksForType: async () => [],
    readCase: async () => { readCalls += 1; return null },
  })
  assert.deepEqual(result, { entries: [], ignored: [] })
  assert.equal(readCalls, 0)
})

test('one and multiple valid links resolve independently', async () => {
  const result = await loadCaseTransportLinks({
    caseTypes: ['damage', 'inkasso'],
    listLinksForType: async (caseType) => caseType === 'damage'
      ? [{ id: 'damage|damage-1|dycos-4711', caseType, caseId: 'damage-1', transportOrderId: 'dycos-4711' }]
      : [{ id: 'inkasso|inkasso-1|dycos-4711', caseType, caseId: 'inkasso-1', transportOrderId: 'dycos-4711' }, { id: 'inkasso|inkasso-2|dycos-4711', caseType, caseId: 'inkasso-2', transportOrderId: 'dycos-4711' }],
    readCase: async (caseType, caseId) => ({ id: caseId, caseNumber: `${caseType}-${caseId}` }),
  })
  assert.equal(result.entries.length, 3)
  assert.deepEqual(result.ignored, [])
})

test('orphaned, malformed, and unreadable links do not block valid case links', async () => {
  const result = await loadCaseTransportLinks({
    caseTypes: ['damage'],
    listLinksForType: async () => [
      { id: 'valid', caseType: 'damage', caseId: 'damage-1', transportOrderId: 'dycos-4711' },
      { id: 'orphaned', caseType: 'damage', caseId: 'damage-missing', transportOrderId: 'dycos-4711' },
      { id: 'malformed', caseType: 'damage', caseId: 'not/a-document-id', transportOrderId: 'dycos-4711' },
      { id: 'unreadable', caseType: 'damage', caseId: 'damage-unreadable', transportOrderId: 'dycos-4711' },
    ],
    readCase: async (_, caseId) => {
      if (caseId === 'damage-1') return { id: caseId, caseNumber: 'S-2026-0042' }
      if (caseId === 'damage-unreadable') { const error = new Error('Missing permission'); error.code = 'permission-denied'; throw error }
      return null
    },
  })
  assert.equal(result.entries.length, 1)
  assert.deepEqual(result.ignored.map((item) => item.reason).sort(), ['case-missing', 'invalid-link', 'permission-denied'])
})

test('missing case permissions prevent link queries and a query error remains visible to the caller', async () => {
  assert.deepEqual(visibleCaseTransportCaseTypes(() => false), [])
  let calls = 0
  await loadCaseTransportLinks({ caseTypes: [], listLinksForType: async () => { calls += 1; return [] }, readCase: async () => null })
  assert.equal(calls, 0)
  const error = new Error('Missing or insufficient permissions.')
  error.code = 'permission-denied'
  await assert.rejects(() => loadCaseTransportLinks({ caseTypes: ['damage'], listLinksForType: async () => { throw error }, readCase: async () => null }), { code: 'permission-denied' })
})

test('multiple TAs per case and multiple cases per TA retain independent links', () => {
  const links = new Set([
    caseTransportLinkId('damage', 'damage-1', 'dycos-4711'),
    caseTransportLinkId('damage', 'damage-1', 'dycos-4712'),
    caseTransportLinkId('inkasso', 'inkasso-1', 'dycos-4711'),
  ])
  assert.equal(links.size, 3)
})

test('linked case types precede create actions and insolvencies are excluded from TA links', () => {
  assert.deepEqual(CASE_TRANSPORT_CASE_TYPE_IDS, ['damage', 'pallet', 'inkasso', 'legalDispute'])
  assert.deepEqual(transportOrderCaseTypeOrder([{ caseType: 'legalDispute' }, { caseType: 'damage' }]), ['damage', 'legalDispute', 'pallet', 'inkasso'])
  assert.throws(() => caseTransportLinkId('insolvency', 'partner-1', 'dycos-4711'), /Ungültige Verknüpfung/)
  assert.deepEqual(caseCreationDefaults('insolvency', transportOrderCasePrefill(order)), {})
})

test('removing a link leaves both source IDs intact and both directions navigate correctly', () => {
  const damageId = 'damage-1'
  const transportOrderId = 'dycos-4711'
  const links = new Set([caseTransportLinkId('damage', damageId, transportOrderId)])
  links.delete(caseTransportLinkId('damage', damageId, transportOrderId))
  assert.equal(links.size, 0)
  assert.equal(damageId, 'damage-1')
  assert.equal(transportOrderId, 'dycos-4711')
  assert.equal(caseDetailPath('damage', damageId), '/schaeden/damage-1')
  assert.equal(caseDetailPath('pallet', 'pallet-1'), '/paletten/faelle/pallet-1')
  assert.equal(caseDetailPath('inkasso', 'inkasso-1'), '/inkasso/inkasso-1')
})
