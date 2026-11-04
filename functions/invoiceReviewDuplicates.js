import { coloredCheck, compareInvoiceIssuer, invoiceCents } from './invoiceReviewPolicy.js'

const field = (invoice, key) => typeof invoice?.[key]?.value === 'string' ? invoice[key].value : typeof invoice?.[key] === 'string' ? invoice[key] : ''
const cleanText = value => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/gu, ' ').trim() : ''
const sourceId = value => {
  const result = typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : cleanText(value)
  return result && result.length <= 240 && !/^0+$/.test(result) && !Array.from(result).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ? result : ''
}
const number = value => {
  const result = cleanText(value)
  return result.length <= 240 ? result.toLocaleUpperCase('de-DE').replace(/[^\p{L}\p{N}]/gu, '') : ''
}
const currency = value => /^[A-Z]{3}$/.test(cleanText(value).toUpperCase()) ? cleanText(value).toUpperCase() : ''
const cents = value => Number.isSafeInteger(value) ? value : null
const bool = value => typeof value === 'boolean' ? value : null

// Similarity is deliberately restricted to a small edit budget and is never
// proof of duplication. Do not rewrite years, prefixes or differing digits.
export function similarInvoiceNumber(a, b) {
  if (!a || !b || a === b || Math.min(a.length, b.length) < 4 || !/\d/u.test(a) || !/\d/u.test(b)) return false
  const budget = Math.min(a.length, b.length) >= 10 ? 2 : 1
  if (Math.abs(a.length - b.length) > budget) return false
  if (a.length === b.length) {
    const changed = [...a].map((letter, index) => letter === b[index] ? -1 : index).filter(index => index >= 0)
    if (changed.length === 2 && changed[1] === changed[0] + 1 && a[changed[0]] === b[changed[1]] && a[changed[1]] === b[changed[0]]) return true
  }
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let minimum = current[0]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      minimum = Math.min(minimum, current[j])
    }
    if (minimum > budget) return false
    previous = current
  }
  return previous[b.length] <= budget
}

const normalizeDocument = document => ({
  sourceId: sourceId(document?.sourceId), carrierSourceId: sourceId(document?.carrierSourceId),
  externalNumber: cleanText(document?.externalNumber).slice(0, 240), number: number(document?.externalNumber),
  grossCents: cents(document?.grossCents), currency: currency(document?.currency),
  cancelled: bool(document?.cancelled), eligible: bool(document?.eligible),
})
const signature = document => JSON.stringify([document.carrierSourceId, document.number, document.grossCents, document.currency, document.cancelled, document.eligible])

export function evaluateInvoiceDuplicates(invoice, references = [], { allAssigned = true } = {}) {
  const invoiceNumber = field(invoice, 'number'), normalizedNumber = number(invoiceNumber)
  const invoiceGross = invoiceCents(field(invoice, 'grossTotal')), invoiceCurrency = currency(field(invoice, 'currency'))
  const grossUncertain = Array.isArray(invoice?.amountUncertainKeys) && invoice.amountUncertainKeys.includes('grossTotal')
  const carrierIds = references.map(reference => sourceId(reference?.imported?.source?.carrierId))
  const carrierId = carrierIds.length && carrierIds.every(id => id && id === carrierIds[0]) ? carrierIds[0] : ''
  // A labelled TA can still be the wrong carrier's order. Match the invoice's
  // issuer independently before using that order's canonical carrier identity.
  const issuerConfirmed = references.length > 0 && references.every(reference => compareInvoiceIssuer(invoice, reference.carrierName || reference.imported?.carrier?.originalName, reference.carrierVatId, 'Unternehmer', reference.carrierCountry).color === 'green')
  const invoiceComplete = Boolean(normalizedNumber && invoiceGross !== null && !grossUncertain && invoiceCurrency && carrierId && issuerConfirmed)
  let complete = Boolean(allAssigned && invoiceComplete && references.length && references.every(reference => reference.billingDataAvailable === true && Array.isArray(reference.billingDocuments)))
  const headers = new Map()
  for (const reference of references) for (const raw of Array.isArray(reference.billingDocuments) ? reference.billingDocuments : []) {
    const document = normalizeDocument(raw)
    const fresh = reference.billingDataAvailable === true
    const key = document.sourceId || Symbol('missing-header-id')
    const previous = headers.get(key)
    if (!previous || fresh && !previous.fresh) headers.set(key, { document, conflict: false, fresh })
    else if (!fresh && previous.fresh) continue
    else if (signature(previous.document) !== signature(document)) previous.conflict = true
  }
  const matches = []
  for (const { document, conflict, fresh } of headers.values()) {
    // Authoritatively excluded headers cannot be this carrier's invoice.
    if (!conflict && (document.cancelled === true || document.eligible === false || carrierId && document.carrierSourceId && document.carrierSourceId !== carrierId)) continue
    const documentComplete = Boolean(document.sourceId && document.carrierSourceId && document.number && document.grossCents !== null && document.currency && document.cancelled === false && document.eligible === true)
    if (conflict || !documentComplete) complete = false
    const sameCarrier = Boolean(issuerConfirmed && carrierId && document.carrierSourceId === carrierId)
    const sameNumber = Boolean(normalizedNumber && normalizedNumber === document.number)
    const sameAmount = invoiceGross !== null && invoiceGross === document.grossCents
    const sameCurrency = Boolean(invoiceCurrency && invoiceCurrency === document.currency)
    const nearNumber = similarInvoiceNumber(normalizedNumber, document.number)
    if (sameCarrier && (sameNumber || nearNumber) && !sameCurrency) complete = false
    if (!sameCarrier || invoiceGross === null || grossUncertain || document.grossCents === null || !sameCurrency || !sameNumber && !(nearNumber && sameAmount)) continue
    const exact = invoiceComplete && documentComplete && fresh && !conflict && sameNumber && sameAmount && sameCurrency
    const reason = exact ? 'exact' : conflict ? 'conflicting_header' : !fresh ? 'stale_header' : !documentComplete || !invoiceComplete ? 'incomplete_header' : !sameNumber ? 'near_number' : 'amount_difference'
    matches.push({ kind: exact ? 'duplicate' : 'possible_duplicate', reason,
      sourceId: document.sourceId || null, carrierSourceId: document.carrierSourceId,
      externalNumber: document.externalNumber, grossCents: document.grossCents, currency: document.currency || null })
  }
  const red = matches.some(match => match.kind === 'duplicate')
  const color = red ? 'red' : matches.length || !complete ? 'yellow' : 'green'
  const first = matches.find(match => match.kind === 'duplicate') || matches[0]
  const alerts = matches.map(match => ({ kind: match.kind, color: match.kind === 'duplicate' ? 'red' : 'yellow', sourceId: match.sourceId, externalNumber: match.externalNumber,
    actual: invoiceGross, expected: match.grossCents, currency: invoiceCurrency || null, expectedCurrency: match.currency }))
  const check = coloredCheck('billingStatus', 'Rechnung bereits in DyCoS vorhanden', cleanText(invoiceNumber).slice(0, 240) || null, first?.externalNumber || null, color,
    red ? 'Bereits vorhanden' : matches.length ? 'Mögliche Dublette' : complete ? 'Kein Treffer im Auftragsbezug' : 'Abgleich unvollständig',
    { comparisonOrigin: 'dycos_invoice_headers', duplicate: red, complete, matchCount: matches.length })
  return { check, alerts, matches }
}
