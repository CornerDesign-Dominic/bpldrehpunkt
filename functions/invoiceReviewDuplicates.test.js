import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateInvoiceDuplicates } from './invoiceReviewDuplicates.js'
import { summarizeChecks } from './invoiceReviewPolicy.js'

const value = value => ({ value, quote: value })
const invoice = (patch = {}) => ({ number: value('RE-4408/2026'), grossTotal: value('273,70'), currency: value('EUR'), issuer: value('Carrier GmbH'), issuerVatId: value('DE123456789'), ...patch })
const header = (patch = {}) => ({ sourceId: 'head-81', carrierSourceId: 'carrier-5', externalNumber: 're 4408 / 2026', grossCents: 27370, currency: 'EUR', cancelled: false, eligible: true, ...patch })
const reference = (documents = [], patch = {}) => ({ imported: { source: { carrierId: 'carrier-5' }, carrier: { originalName: 'Carrier GmbH' } }, carrierVatId: 'DE123456789', carrierCountry: 'DE', billingDocuments: documents, billingDataAvailable: true, ...patch })

test('exact duplicate requires same carrier, external number, whole gross amount, currency and active eligible invoice', () => {
  const result = evaluateInvoiceDuplicates(invoice(), [reference([header()])], { allAssigned: true })
  assert.equal(result.check.key, 'billingStatus')
  assert.equal(result.check.color, 'red')
  assert.equal(result.alerts.length, 1)
  assert.equal(result.alerts[0].kind, 'duplicate')
  assert.equal(result.matches[0].sourceId, 'head-81')
  assert.equal(result.matches[0].grossCents, 27370)
})

test('same collective invoice header across multiple TAs is compared once without summing header copies', () => {
  const collective = invoice({ grossTotal: value('1000,00') })
  const result = evaluateInvoiceDuplicates(collective, [reference([header({ grossCents: 100000 })]), reference([header({ grossCents: 100000 })])])
  assert.equal(result.check.color, 'red')
  assert.equal(result.matches.length, 1)
  assert.equal(result.alerts[0].expected, 100000)
  const differentWholeAmount = evaluateInvoiceDuplicates(collective, [reference([header({ grossCents: 50000 })]), reference([header({ grossCents: 50000 })])])
  assert.equal(differentWholeAmount.check.color, 'yellow')
  assert.equal(differentWholeAmount.alerts.length, 1)
  assert.equal(differentWholeAmount.alerts[0].kind, 'possible_duplicate')
})

test('same number from a different canonical carrier never alerts as this invoice', () => {
  const result = evaluateInvoiceDuplicates(invoice(), [reference([header({ carrierSourceId: 'carrier-other' })])])
  assert.equal(result.check.color, 'green')
  assert.deepEqual(result.alerts, [])
  assert.deepEqual(result.matches, [])
})

test('TA carrier identity must independently agree with invoice issuer', () => {
  const wrongIssuer = invoice({ issuer: value('Another GmbH'), issuerVatId: value('DE999999999') })
  const result = evaluateInvoiceDuplicates(wrongIssuer, [reference([header()])])
  assert.equal(result.check.color, 'yellow')
  assert.deepEqual(result.alerts, [])
  const wrongVatSameName = evaluateInvoiceDuplicates(invoice({ issuerVatId: value('DE999999999') }), [reference([header()])])
  assert.equal(wrongVatSameName.check.color, 'yellow')
  assert.deepEqual(wrongVatSameName.alerts, [])
  const missingIdentity = evaluateInvoiceDuplicates(invoice({ issuer: value(''), issuerVatId: value('') }), [reference([header()])])
  assert.equal(missingIdentity.check.color, 'yellow')
  assert.deepEqual(missingIdentity.alerts, [])
})

test('authoritative VAT identity handles country-normalized issuer names without name heuristics', () => {
  const result = evaluateInvoiceDuplicates(invoice({ issuer: value('S CROWN PP 2020 DOO'), issuerVatId: value('RS112058906') }), [reference([header()], { carrierName: 'DOO S CROWN2020 Prijepolje', carrierVatId: '112058906', carrierCountry: 'RS' })])
  assert.equal(result.check.color, 'red')
})

test('cancelled and authoritatively ineligible headers are excluded even when every value matches', () => {
  for (const patch of [{ cancelled: true }, { eligible: false }, { cancelled: true, eligible: null }]) {
    const result = evaluateInvoiceDuplicates(invoice(), [reference([header(patch)])])
    assert.equal(result.check.color, 'green')
    assert.deepEqual(result.alerts, [])
  }
})

test('same invoice number with changed gross is possible duplicate, different currency does not produce an alert', () => {
  const amount = evaluateInvoiceDuplicates(invoice(), [reference([header({ grossCents: 99900 })])])
  assert.equal(amount.check.color, 'yellow')
  assert.equal(amount.alerts[0].kind, 'possible_duplicate')
  assert.equal(amount.alerts[0].actual, 27370)
  assert.equal(amount.alerts[0].expected, 99900)
  const wrongCurrency = evaluateInvoiceDuplicates(invoice(), [reference([header({ currency: 'USD' })])])
  assert.equal(wrongCurrency.check.color, 'yellow')
  assert.deepEqual(wrongCurrency.alerts, [])
})

test('near external number can only produce yellow suspicion with all other identifying values matching', () => {
  for (const externalNumber of ['RE4409/2026', 'RE4480/2026', 'RE4408/2025']) {
    const result = evaluateInvoiceDuplicates(invoice(), [reference([header({ externalNumber })])])
    assert.equal(result.check.color, 'yellow')
    assert.equal(result.alerts[0].kind, 'possible_duplicate')
    assert.equal(result.matches[0].reason, 'near_number')
  }
  for (const patch of [{ externalNumber: 'AB9876/2019' }, { externalNumber: 'RE4409/2026', grossCents: 99900 }]) {
    const result = evaluateInvoiceDuplicates(invoice(), [reference([header(patch)])])
    assert.equal(result.check.color, 'yellow')
    assert.equal(result.check.expected, patch.externalNumber)
    assert.deepEqual(result.alerts, [])
  }
  const nearWrongCurrency = evaluateInvoiceDuplicates(invoice(), [reference([header({ externalNumber: 'RE4409/2026', currency: 'USD' })])])
  assert.equal(nearWrongCurrency.check.color, 'yellow')
  assert.deepEqual(nearWrongCurrency.alerts, [])
})

test('missing header cancellation, eligibility, identity, amount or currency can never establish a duplicate or green absence', () => {
  for (const patch of [{ cancelled: null }, { eligible: null }, { carrierSourceId: null }, { grossCents: null }, { currency: null }, { sourceId: null }]) {
    const result = evaluateInvoiceDuplicates(invoice(), [reference([header(patch)])])
    assert.equal(result.check.color, 'yellow')
    assert.equal(result.matches.some(match => match.kind === 'duplicate'), false)
  }
})

test('green absence requires complete fresh references, all assigned orders and invoice identity/amount fields', () => {
  const complete = evaluateInvoiceDuplicates(invoice(), [reference([])])
  assert.equal(complete.check.color, 'green')
  assert.equal(complete.check.message, 'Kein Treffer im Auftragsbezug')
  const cases = [
    evaluateInvoiceDuplicates(invoice(), []),
    evaluateInvoiceDuplicates(invoice(), [reference([], { billingDataAvailable: false })]),
    evaluateInvoiceDuplicates(invoice(), [reference([]), reference([], { billingDataAvailable: false })]),
    evaluateInvoiceDuplicates(invoice(), [reference([])], { allAssigned: false }),
    evaluateInvoiceDuplicates(invoice(), [reference([], { billingDocuments: undefined })]),
    evaluateInvoiceDuplicates(invoice(), [reference([], { imported: { source: {}, carrier: { originalName: 'Carrier GmbH' } } })]),
    evaluateInvoiceDuplicates(invoice(), [reference([]), reference([], { imported: { source: { carrierId: 'other' }, carrier: { originalName: 'Carrier GmbH' } } })]),
    ...['number', 'grossTotal', 'currency'].map(key => evaluateInvoiceDuplicates(invoice({ [key]: value('') }), [reference([])])),
  ]
  for (const result of cases) {
    assert.equal(result.check.color, 'yellow')
    assert.deepEqual(result.alerts, [])
  }
})

test('conflicting copies of one header cannot accidentally pick a noncancelled or matching first copy', () => {
  for (const patch of [{ cancelled: true }, { grossCents: 99900 }, { eligible: false }]) {
    const result = evaluateInvoiceDuplicates(invoice(), [reference([header()]), reference([header(patch)])])
    assert.equal(result.check.color, 'yellow')
    assert.equal(result.matches.length, 1)
    assert.equal(result.matches[0].kind, 'possible_duplicate')
    assert.equal(result.matches[0].reason, 'conflicting_header')
  }
})

test('matched evidence is small and sanitized and does not retain arbitrary provider fields', () => {
  const result = evaluateInvoiceDuplicates(invoice(), [reference([header({ privatePayload: { secret: 'must-not-copy' } })])])
  assert.equal(JSON.stringify(result).includes('must-not-copy'), false)
  assert.deepEqual(Object.keys(result.matches[0]).sort(), ['kind', 'reason', 'sourceId', 'carrierSourceId', 'externalNumber', 'grossCents', 'currency'].sort())
})

test('missing gross or currency cannot produce even a possible duplicate alert', () => {
  for (const patch of [{ grossCents: null }, { currency: null }]) {
    const result = evaluateInvoiceDuplicates(invoice(), [reference([header(patch)])])
    assert.equal(result.check.color, 'yellow')
    assert.deepEqual(result.alerts, [])
    assert.deepEqual(result.matches, [])
  }
  for (const patch of [{ grossTotal: value('') }, { currency: value('') }]) {
    const result = evaluateInvoiceDuplicates(invoice(patch), [reference([header()])])
    assert.equal(result.check.color, 'yellow')
    assert.deepEqual(result.alerts, [])
  }
})

test('stale matching evidence never establishes a red duplicate while fresh positive evidence survives another incomplete order', () => {
  const stale = evaluateInvoiceDuplicates(invoice(), [reference([header()], { billingDataAvailable: false })])
  assert.equal(stale.check.color, 'yellow')
  assert.equal(stale.matches.some(match => match.kind === 'duplicate'), false)
  const fresh = evaluateInvoiceDuplicates(invoice(), [reference([header()]), reference([], { billingDataAvailable: false })])
  assert.equal(fresh.check.color, 'red')
  assert.equal(fresh.check.complete, false)
  assert.equal(fresh.alerts[0].kind, 'duplicate')
})

test('fresh header state supersedes stale copies regardless of TA traversal order', () => {
  const current = reference([header({ cancelled: false })])
  const stale = reference([header({ cancelled: true })], { billingDataAvailable: false })
  for (const references of [[current, stale], [stale, current]]) {
    const result = evaluateInvoiceDuplicates(invoice(), references)
    assert.equal(result.check.color, 'red')
    assert.equal(result.matches.length, 1)
  }
  const cancelled = reference([header({ cancelled: true })])
  const staleActive = reference([header({ cancelled: false })], { billingDataAvailable: false })
  for (const references of [[cancelled, staleActive], [staleActive, cancelled]]) {
    const result = evaluateInvoiceDuplicates(invoice(), references)
    assert.equal(result.check.color, 'yellow')
    assert.deepEqual(result.alerts, [])
  }
})

test('disputed invoice gross cannot produce a duplicate alert or a green absence result', () => {
  const disputed = invoice({ amountUncertainKeys: ['grossTotal'] })
  for (const references of [[reference([header()])], [reference([])]]) {
    const result = evaluateInvoiceDuplicates(disputed, references)
    assert.equal(result.check.color, 'yellow')
    assert.deepEqual(result.alerts, [])
    assert.deepEqual(result.matches, [])
  }
})


test('other active external numbers for this carrier and order require review without inventing a duplicate', () => {
  const result = evaluateInvoiceDuplicates(invoice(), [reference([header({ externalNumber: 'OTHER-123' }), header({ sourceId: 'head-82', externalNumber: 'CREDIT-456', grossCents: -27370 })])])
  assert.equal(result.check.color, 'yellow')
  assert.equal(result.check.label, 'Ext. Belegnummer')
  assert.equal(result.check.expected, 'OTHER-123; CREDIT-456')
  assert.deepEqual(result.alerts, [])
  assert.deepEqual(result.matches, [])
  const cancelled = evaluateInvoiceDuplicates(invoice(), [reference([header({ externalNumber: 'OTHER-123', cancelled: true })])])
  assert.equal(cancelled.check.color, 'green')
  assert.equal(cancelled.check.expected, null)
})


test('confirmed booked invoice remains a red warning but does not make correctness a mismatch', () => {
  const confirmed = evaluateInvoiceDuplicates(invoice(), [reference([header()])])
  assert.equal(confirmed.check.color, 'red')
  assert.equal(confirmed.check.affectsCorrectness, false)
  assert.equal(confirmed.alerts[0].color, 'red')
  assert.equal(summarizeChecks([{ key: 'netTotal', color: 'green' }, confirmed.check]), 'match')
  assert.equal(summarizeChecks([{ key: 'netTotal', color: 'red' }, confirmed.check]), 'mismatch')
  assert.equal(summarizeChecks([{ key: 'paymentTerms', color: 'yellow' }, confirmed.check]), 'unknown')
  const suspected = evaluateInvoiceDuplicates(invoice(), [reference([header({ externalNumber: 'RE4409/2026' })])])
  assert.notEqual(suspected.check.affectsCorrectness, false)
  assert.equal(summarizeChecks([{ key: 'netTotal', color: 'green' }, suspected.check]), 'unknown')
})
