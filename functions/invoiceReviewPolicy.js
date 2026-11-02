const text = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim()
const identity = value => text(value).toLocaleLowerCase('de-DE').replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]/gu, '')
const supplied = value => value !== null && value !== undefined && value !== ''
const field = (invoice, key) => invoice?.[key]?.value || ''
const statusFor = color => ({ green: 'match', red: 'mismatch', yellow: 'unknown', gray: 'not_supplied', blue: 'info' })[color]
export const coloredCheck = (key, label, actual, expected, color, message = '', extra = {}) => ({ key, label, actual: actual ?? null, expected: expected ?? null, color, status: statusFor(color), ...(message ? { message } : {}), ...extra })
export function summarizeChecks(checks) { return checks.some(check => check.color === 'red' || !check.color && check.status === 'mismatch') ? 'mismatch' : checks.some(check => check.color === 'yellow' || !check.color && check.status === 'unknown') ? 'unknown' : 'match' }
export function compareCheck(key, label, actual, expected, { optional = false, secondary = false, equal = (a, b) => identity(a) === identity(b), format } = {}) {
  const color = !supplied(actual) ? optional ? 'gray' : 'yellow' : secondary ? 'blue' : !supplied(expected) ? 'yellow' : equal(actual, expected) ? 'green' : 'red'
  return coloredCheck(key, label, actual, expected, color, '', format ? { format } : {})
}
export function invoiceCents(value) {
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1e10 ? Math.round((value + Number.EPSILON) * 100) : null
  let s = text(value).replace(/(?:EUR|PLN|USD|GBP|€)/gi, '').replace(/\s/g, '')
  if (!/^-?\d+(?:[.,]\d+)*$/.test(s)) return null
  const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) { const decimal = comma > dot ? ',' : '.'; s = s.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.') }
  else if (comma >= 0) { if (!/^-?\d+,\d{1,2}$/.test(s)) return null; s = s.replace(',', '.') }
  else if (dot >= 0 && !/^-?\d+\.\d{1,2}$/.test(s)) return null
  return invoiceCents(Number(s))
}
export function expectedInvoiceNet(imported) {
  const positions = imported?.financial?.costPositions
  return Array.isArray(positions) && positions.length && positions.every(position => Number.isFinite(position.amountNet) && invoiceCents(position.amountNet) !== null && (!position.currency || position.currency === imported.financial.currency)) ? positions.reduce((sum, position) => sum + invoiceCents(position.amountNet), 0) : null
}
export function compareInvoiceTransport({ rows, invoice, imported, company = {}, carrierVatId = null, uncertainTa = false }) {
  const amounts = rows.map(row => invoiceCents(row.net?.value))
  const net = amounts.every(value => value !== null) ? amounts.reduce((sum, value) => sum + value, 0) : null
  const expectedNet = expectedInvoiceNet(imported)
  const currency = field(invoice, 'currency'), expectedCurrency = imported?.financial?.currency
  const wrongCurrency = supplied(currency) && supplied(expectedCurrency) && identity(currency) !== identity(expectedCurrency)
  const netCheck = compareCheck('net', 'Nettobetrag (Cent)', net, expectedNet, { equal: (a, b) => a === b, format: 'money' })
  Object.assign(netCheck, { actualCurrency: currency || null, expectedCurrency: expectedCurrency || null })
  if (wrongCurrency) Object.assign(netCheck, { color: 'yellow', status: 'unknown', message: 'Beträge sind unterschiedlichen Währungen zugeordnet. Keine automatische Umrechnung.' })
  if (rows.some(row => row.netOcrUncertain)) Object.assign(netCheck, { color: 'yellow', status: 'unknown', message: 'Textebene und OCR liefern unterschiedliche Betragswerte. Bitte Original prüfen.' })
  const checks = [coloredCheck('ta', 'TA-Zuordnung', rows[0]?.ta?.value || '', rows[0]?.ta?.value || '', uncertainTa ? 'yellow' : 'green', uncertainTa ? 'Unsichere Rechnungsreferenz; Datenbanktreffer als Vorschlag.' : ''), netCheck,
    coloredCheck('currency', 'Währung', currency || null, expectedCurrency || null, currency ? 'blue' : 'gray'),
    compareCheck('issuer', 'Rechnungsaussteller / Unternehmer', field(invoice, 'issuer'), imported?.carrier?.originalName),
    compareCheck('recipient', 'Rechnungsempfänger', field(invoice, 'recipient'), company.legalName)]
  checks.push(compareCheck('issuerVatId', 'USt-ID Unternehmer', field(invoice, 'issuerVatId'), carrierVatId), compareCheck('recipientVatId', 'USt-ID Rechnungsempfänger', field(invoice, 'recipientVatId'), company.vatId))
  const from = imported?.loading, to = imported?.unloading
  for (const [key, label, expected] of [['loadingDate', 'Ladedatum', from?.window?.from?.slice(0, 10)], ['unloadingDate', 'Entladedatum', (to?.window?.until || to?.window?.from)?.slice(0, 10)], ['loadingCity', 'Ladeort', from?.city], ['unloadingCity', 'Entladeort', to?.city], ['licensePlate', 'Kennzeichen', imported?.shipment?.licensePlate]]) {
    rows.forEach((row, index) => checks.push(compareCheck(`${key}-${index}`, label, row[key]?.value, expected, { optional: true, secondary: true })))
  }
  return { ta: rows[0]?.ta?.value || '', uncertainTa, netCents: net, expectedNetCents: expectedNet, checks, status: summarizeChecks(checks), evidence: rows.map(row => ({ ta: row.ta?.quote || '', net: row.net?.quote || '' })) }
}
export function invoiceTotals(invoice, { references = [], allAssigned = true } = {}) {
  const net = invoiceCents(field(invoice, 'netTotal')), vat = invoiceCents(field(invoice, 'vatTotal')), gross = invoiceCents(field(invoice, 'grossTotal'))
  const values = invoice.transports.map(row => invoiceCents(row.net?.value))
  const sum = values.length && values.every(value => value !== null) ? values.reduce((a, b) => a + b, 0) : null
  const total = values => values.length && values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : null
  const canCompare = allAssigned && references.length > 0
  const expectedNet = canCompare ? total(references.map(reference => expectedInvoiceNet(reference.imported))) : null
  const expectedVat = canCompare ? total(references.map(reference => reference.financial?.vatCents)) : null
  const expectedGross = canCompare ? total(references.map(reference => reference.financial?.grossCents)) : null
  const checks = [compareCheck('netTotal', 'Gesamt netto / Aufträge (Cent)', net, expectedNet, { equal: (a, b) => a === b, format: 'money' }), compareCheck('vatTotal', 'MwSt.-Betrag / Datenbank (Cent)', vat, expectedVat, { equal: (a, b) => a === b, format: 'money' }), compareCheck('grossTotal', 'Gesamt brutto / Datenbank (Cent)', gross, expectedGross, { equal: (a, b) => a === b, format: 'money' }), compareCheck('positionSum', 'Summe Positionen / Rechnungsnetto (Cent)', sum, net, { equal: (a, b) => a === b, format: 'money' }), compareCheck('taxSum', 'Netto + MwSt. / Brutto (Cent)', net !== null && vat !== null ? net + vat : null, gross, { equal: (a, b) => a === b, format: 'money' })]
  const currency = field(invoice, 'currency')
  const currencies = [...new Set(references.map(reference => reference.imported?.financial?.currency).filter(Boolean))]
  const expectedCurrency = references.length > 0 && references.every(reference => reference.imported?.financial?.currency) && currencies.length === 1 ? currencies[0] : null
  for (const check of checks) Object.assign(check, { actualCurrency: currency || null, expectedCurrency: ['netTotal', 'vatTotal', 'grossTotal'].includes(check.key) ? expectedCurrency : currency || null })
  if (references.some(reference => currency && reference.imported?.financial?.currency && identity(currency) !== identity(reference.imported.financial.currency))) for (const check of checks.filter(check => ['netTotal', 'vatTotal', 'grossTotal'].includes(check.key))) Object.assign(check, { color: 'yellow', status: 'unknown', message: 'Rechnungs- und Vergleichswährung sind nicht eindeutig gleich. Keine automatische Umrechnung.' })
  const countries = references.map(reference => countryCode(reference.carrierCountry)).filter(Boolean)
  if (!countries.length) { const country = countryCode(field(invoice, 'issuerCountry')); if (country) countries.push(country) }
  const foreign = countries.some(country => country !== 'DE')
  checks.push(coloredCheck('foreignVat', 'MwSt. bei ausländischem Unternehmer', vat, foreign ? 0 : null, !countries.length ? vat > 0 ? 'yellow' : 'gray' : foreign && vat > 0 ? 'red' : foreign && vat === 0 ? 'green' : 'gray', foreign && vat > 0 ? 'Betriebliche Prüfregel: MwSt. bei ausländischem Unternehmer berechnet. Bitte prüfen.' : ''))
  const uncertain = invoice.amountUncertainKeys || []
  const affected = new Set(uncertain)
  if (uncertain.length) affected.add('taxSum')
  if (uncertain.includes('netTotal') || invoice.transports.some(row => row.netOcrUncertain)) affected.add('positionSum')
  if (uncertain.includes('vatTotal')) affected.add('foreignVat')
  for (const check of checks) if (affected.has(check.key)) Object.assign(check, { color: 'yellow', status: 'unknown', message: 'Textebene und OCR liefern unterschiedliche Betragswerte. Bitte Original prüfen.' })
  return { checks, status: summarizeChecks(checks) }
}
function countryCode(value) {
  const normalized = identity(value)
  const named = { de: 'DE', deu: 'DE', deutschland: 'DE', germany: 'DE', d: 'DE', polen: 'PL', polska: 'PL', poland: 'PL', niederlande: 'NL', netherlands: 'NL', frankreich: 'FR', france: 'FR', osterreich: 'AT', austria: 'AT', tschechien: 'CZ', czechia: 'CZ', rumanien: 'RO', romania: 'RO' }
  if (named[normalized]) return named[normalized]
  return /^[a-z]{2}$/.test(normalized) && !['xx', 'zz'].includes(normalized) ? normalized.toUpperCase() : null
}
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 0; i < a.length; i++) { const next = [i + 1]; for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(a[i] !== b[j]))); row = next }
  return row[b.length]
}
function approximatelyContains(value, expected) {
  const streetSpelling = value => String(value).replace(/\b([\p{L}-]+)str\.?(?=\s|,|\d|$)/giu, '$1strasse')
  const input = identity(streetSpelling(value)), target = identity(streetSpelling(expected))
  if (input.includes(target)) return true
  for (let offset = 0; offset < input.length; offset++) for (const size of [target.length - 2, target.length - 1, target.length, target.length + 1, target.length + 2]) if (distance(input.slice(offset, offset + size), target) <= 2) return true
  return false
}
export function recipientAddressCheck(invoice) {
  const actual = field(invoice, 'recipientAddress'), expected = 'Reinshagenstraße, 42369 Wuppertal'
  if (!actual) return coloredCheck('recipientAddress', 'Unsere Rechnungsanschrift', null, expected, 'yellow', 'Empfängeranschrift nicht eindeutig erkannt.')
  const foreignAddress = /\b(?:Polen|Polska|Poland|Niederlande|Netherlands|Frankreich|France|Österreich|Austria|Tschechien|Czechia|Rumänien|Romania|Belgien|Belgium|Schweiz|Switzerland)\b/i.test(actual) || /\b(?:PL|NL|FR|AT|CZ|RO|BE|CH)\s*[- ]\s*42369\b/i.test(actual)
  const locality = !foreignAddress && /\b42369\b/.test(actual) && approximatelyContains(actual, 'Wuppertal')
  if (locality && approximatelyContains(actual, 'Reinshagenstrasse')) return coloredCheck('recipientAddress', 'Unsere Rechnungsanschrift', actual, expected, 'green')
  const old = locality && approximatelyContains(actual, 'HeinzFangmannstrasse')
  return coloredCheck('recipientAddress', 'Unsere Rechnungsanschrift', actual, expected, 'yellow', old ? 'Frühere Firmenanschrift verwendet.' : 'Empfängeranschrift weicht von der aktuellen Firmenanschrift ab.')
}
export function invoiceHeaderChecks(invoice, company, references) {
  const unique = values => [...new Set(values.filter(supplied))]
  const issuers = unique(references.map(reference => reference.imported?.carrier?.originalName))
  const vatIds = unique(references.map(reference => reference.carrierVatId))
  const billingEvidenceCount = references.reduce((count, reference) => count + (reference.billingEvidence?.length || 0), 0)
  const billingAvailable = references.length > 0 && references.every(reference => reference.billingDataAvailable === true)
  const billing = coloredCheck('billingStatus', 'Bereits abgerechnet / Dublettenabgleich', billingEvidenceCount ? `${billingEvidenceCount} Belegbezüge vorhanden` : null, 'Eindeutiger Abrechnungsstatus', billingAvailable && !billingEvidenceCount ? 'green' : 'yellow', billingEvidenceCount ? 'Belegbezug vorhanden. Dublette, Zahlungsanfrage oder neue Rechnung prüfen.' : billingAvailable ? '' : 'Gebuchte Rechnungen und externe Rechnungsreferenzen sind über die aktuelle Schnittstelle nicht vollständig verfügbar.')
  return [coloredCheck('number', 'Rechnungsnummer', field(invoice, 'number') || null, null, field(invoice, 'number') ? 'green' : 'yellow'), coloredCheck('date', 'Rechnungsdatum', field(invoice, 'date') || null, null, field(invoice, 'date') ? 'blue' : 'gray'), compareCheck('issuer', 'Rechnungsaussteller', field(invoice, 'issuer'), issuers.length === 1 ? issuers[0] : null), compareCheck('issuerVatId', 'USt-ID Unternehmer', field(invoice, 'issuerVatId'), vatIds.length === 1 ? vatIds[0] : null), compareCheck('recipient', 'Rechnungsempfänger', field(invoice, 'recipient'), company.legalName), compareCheck('recipientVatId', 'Unsere USt-ID', field(invoice, 'recipientVatId'), company.vatId), recipientAddressCheck(invoice), billing]
}
function paymentBasis(value) {
  const input = identity(value)
  if (/vollstandig|beleg|dokument/.test(input)) return 'documents_received'
  if (/eingang|erhalt|receipt/.test(input)) return 'receipt_date'
  if (/liefer|entlad|delivery/.test(input)) return 'delivery_date'
  if (/rechnungsdatum|rechnungsstellung|rechnungserstellung|invoicedate|dateofinvoice/.test(input)) return 'invoice_date'
  return null
}
export function invoicePaymentChecks(invoice, references) {
  const actualText = field(invoice, 'paymentTerms'), rawDays = field(invoice, 'paymentDays')
  const days = /^\d{1,3}$/.test(rawDays) ? Number(rawDays) : null
  const dueDate = field(invoice, 'dueDate'), invoiceDate = field(invoice, 'date')
  const basis = paymentBasis(field(invoice, 'paymentBasis') || actualText)
  const terms = references.map(reference => reference.payment).filter(Boolean)
  const expectedDays = terms.length && terms.every(term => Number.isFinite(term.days) && term.days === terms[0].days) ? terms[0].days : null
  const expectedBasis = terms.length && terms.every(term => term.basis && term.basis === terms[0].basis) ? terms[0].basis : null
  const expectedDue = terms.length && terms.every(term => term.dueDate && term.dueDate === terms[0].dueDate) ? terms[0].dueDate : null
  const derivedDays = dueDate && invoiceDate ? Math.round((Date.parse(dueDate) - Date.parse(invoiceDate)) / 86400000) : null
  const comparableDays = days ?? (Number.isFinite(derivedDays) && derivedDays >= 0 && expectedBasis === 'invoice_date' ? derivedDays : null)
  const comparableBasis = basis || (days === null && dueDate && invoiceDate ? 'invoice_date' : null)
  const dayEvidence = `${actualText} ${invoice.paymentDays?.quote || ''}`
  const dayType = /werktag|working\s*day/i.test(dayEvidence) ? 'working' : /banktag|bank\s*day/i.test(dayEvidence) ? 'bank' : /\btage?\b|\bdays?\b/i.test(dayEvidence) ? 'calendar' : days === null && dueDate ? 'calendar' : null
  const expectedDayType = terms.length && terms.every(term => term.dayType === terms[0].dayType) ? terms[0].dayType : null
  let color = 'yellow', message = 'Zahlungsziel oder eindeutige Vergleichsgrundlage fehlt.'
  if (dueDate && expectedDue) { color = dueDate === expectedDue ? 'green' : 'red'; message = '' }
  else if (comparableDays !== null && expectedDays !== null && comparableBasis && expectedBasis) {
    if (!dayType || !expectedDayType) message = 'Kalender-, Werk- oder Banktage sind nicht eindeutig angegeben.'
    else if (days === null && expectedDayType !== 'calendar') message = 'Fälligkeitsdatum kann ohne Arbeits-/Banktagskalender nicht mit der Tagesfrist verglichen werden.'
    else { color = comparableDays === expectedDays && comparableBasis === expectedBasis && dayType === expectedDayType ? 'green' : 'red'; message = comparableBasis !== expectedBasis ? 'Der Fristbeginn weicht von der Vereinbarung ab.' : dayType !== expectedDayType ? 'Kalender-, Werk- oder Banktage unterscheiden sich.' : '' }
  }
  return [coloredCheck('paymentTerms', 'Zahlungsziel', actualText || (days !== null ? `${days} Tage` : dueDate || null), terms.map(term => term.text || (Number.isFinite(term.days) ? `${term.days} Tage` : '')).filter(Boolean).join('; ') || null, color, message), coloredCheck('dueDate', 'Fälligkeitsdatum', dueDate || null, expectedDue, dueDate ? 'blue' : 'gray')]
}
export function invoiceNotices({ headerChecks, paymentChecks, transports, references }) {
  const notices = []
  const add = (kind, message) => { if (!notices.some(item => item.kind === kind && item.message === message)) notices.push({ kind, message, color: 'yellow' }) }
  const address = headerChecks.find(check => check.key === 'recipientAddress')
  if (address?.color === 'yellow' && address.actual) add('address', address.message)
  if (paymentChecks.some(check => check.key === 'paymentTerms' && check.color === 'red')) add('payment', 'Zahlungsziel weicht von der hinterlegten Vereinbarung ab.')
  for (const transport of transports) {
    const net = transport.checks?.find(check => check.key === 'net' && check.color === 'red')
    if (net) add('cost', `TA ${transport.ta}: ${net.actual > net.expected ? 'Mehr' : 'Weniger'} abgerechnet als vereinbart (${((net.actual - net.expected) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${references.find(reference => reference.ta === transport.ta)?.imported?.financial?.currency || ''}).`)
  }
  for (const reference of references) for (const evidence of reference.billingEvidence || []) add('billing', evidence.message || 'Abrechnungsbezug in der Datenbank vorhanden. Dublette, Zahlungsanfrage oder neue Rechnung prüfen.')
  return notices
}
