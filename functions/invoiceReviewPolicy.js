const text = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim()
const identity = value => text(value).toLocaleLowerCase('de-DE').replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]/gu, '')
const supplied = value => value !== null && value !== undefined && value !== ''
// Normalize established legal-form spellings, not arbitrary company prefixes.
const companyName = value => identity(text(value)
  .replace(/spółka\s+z\s+ograniczoną\s+odpowiedzialnością/giu, 'spzoo')
  .replace(/\bsp\.?\s*z\.?\s*o\.?\s*o\.?/giu, 'spzoo')
  .replace(/\s+Inh(?:aber(?:in)?)?\.?\s+.+$/iu, ''))
export const sameInvoiceCompany = (a, b) => {
  const proprietor = value => text(value).match(/\s+Inh(?:aber(?:in)?)?\.?\s+(.+)$/iu)?.[1]
  const first = proprietor(a), second = proprietor(b)
  return Boolean(companyName(a)) && companyName(a) === companyName(b) && (!first || !second || identity(first) === identity(second))
}
const field = (invoice, key) => invoice?.[key]?.value || ''
const statusFor = color => ({ green: 'match', red: 'mismatch', yellow: 'unknown', gray: 'not_supplied', blue: 'info' })[color]
export const coloredCheck = (key, label, actual, expected, color, message = '', extra = {}) => ({ key, label, actual: actual ?? null, expected: expected ?? null, color, status: statusFor(color), ...(message ? { message } : {}), ...extra })
export function summarizeChecks(checks) { return checks.some(check => check.color === 'red' || !check.color && check.status === 'mismatch') ? 'mismatch' : checks.some(check => check.color === 'yellow' || !check.color && check.status === 'unknown') ? 'unknown' : 'match' }
export function compareCheck(key, label, actual, expected, { optional = false, secondary = false, equal = (a, b) => identity(a) === identity(b), format } = {}) {
  const color = !supplied(actual) || !supplied(expected) ? optional ? 'gray' : 'yellow' : equal(actual, expected) ? 'green' : 'red'
  return coloredCheck(key, label, actual, expected, color, '', { ...(format ? { format } : {}), ...(secondary ? { secondary: true } : {}) })
}
const normalizedVatId = value => identity(value).toUpperCase()
const vatWithCountry = (value, referenceCountry) => {
  const normalized = normalizedVatId(value), country = countryCode(referenceCountry)
  return country && /^\d+$/.test(normalized) ? `${country}${normalized}` : normalized
}
export function sameInvoiceVatId(actual, expected, referenceCountry = null) {
  if (!supplied(actual) || !supplied(expected)) return false
  return vatWithCountry(actual, referenceCountry) === vatWithCountry(expected, referenceCountry)
}
export function compareInvoiceVatId(key, label, actual, expected, referenceCountry = null) {
  const check = compareCheck(key, label, actual, expected, { equal: (a, b) => sameInvoiceVatId(a, b, referenceCountry) })
  const a = normalizedVatId(actual), b = normalizedVatId(expected), country = countryCode(referenceCountry)
  const prefixUnknown = !country && (/^\d+$/.test(a) && /^[A-Z]{2}\d+$/.test(b) && b.slice(2) === a || /^\d+$/.test(b) && /^[A-Z]{2}\d+$/.test(a) && a.slice(2) === b)
  if (prefixUnknown) return { ...check, color: 'yellow', status: 'unknown', message: 'Länderpräfix der USt-ID nicht unabhängig belegt.' }
  if (check.color === 'green' && a !== b && country) Object.assign(check, { normalization: 'verified_country_prefix', normalizationCountry: country, message: 'Länderpräfix aus bestätigtem Unternehmerland ergänzt.' })
  return check
}
export function compareInvoiceIssuer(invoice, expectedName, expectedVatId, label = 'Rechnungsaussteller / Unternehmer', referenceCountry = null) {
  const actualName = field(invoice, 'issuer'), actualVatId = field(invoice, 'issuerVatId')
  const check = compareCheck('issuer', label, actualName, expectedName, { equal: sameInvoiceCompany })
  if (supplied(actualVatId) && supplied(expectedVatId)) {
    const vatCheck = compareInvoiceVatId('issuerVatId', 'USt-ID Unternehmer', actualVatId, expectedVatId, referenceCountry)
    if (vatCheck.color === 'red') return { ...check, color: 'red', status: 'mismatch', matchedBy: 'vatId', message: 'Unternehmer-USt-ID weicht von der Referenz ab.', actualVatId, expectedVatId }
    if (vatCheck.color === 'yellow' && check.color === 'red') return { ...check, color: 'yellow', status: 'unknown', message: vatCheck.message, actualVatId, expectedVatId }
    if (vatCheck.color === 'green' && supplied(actualName) && supplied(expectedName)) return { ...check, color: 'green', status: 'match', matchedBy: sameInvoiceCompany(actualName, expectedName) ? 'name_and_vatId' : 'vatId', message: 'Unternehmer über übereinstimmende USt-ID zugeordnet.', actualVatId, expectedVatId, ...(vatCheck.normalization ? { normalization: vatCheck.normalization, normalizationCountry: vatCheck.normalizationCountry } : {}) }
  }
  return check
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
export function compareInvoiceTransport({ rows, invoice, imported, company = {}, carrierVatId = null, carrierName = null, carrierCountry = null, uncertainTa = false }) {
  const amounts = rows.map(row => invoiceCents(row.net?.value))
  const net = amounts.every(value => value !== null) ? amounts.reduce((sum, value) => sum + value, 0) : null
  const expectedNet = expectedInvoiceNet(imported)
  const currency = field(invoice, 'currency'), expectedCurrency = imported?.financial?.currency
  const wrongCurrency = supplied(currency) && supplied(expectedCurrency) && identity(currency) !== identity(expectedCurrency)
  const netCheck = compareCheck('net', 'Nettobetrag (Cent)', net, expectedNet, { equal: (a, b) => a === b, format: 'money' })
  Object.assign(netCheck, { actualCurrency: currency || null, expectedCurrency: expectedCurrency || null })
  if (wrongCurrency) Object.assign(netCheck, { color: 'yellow', status: 'unknown', message: 'Beträge sind unterschiedlichen Währungen zugeordnet. Keine automatische Umrechnung.' })
  if (!supplied(currency) || !supplied(expectedCurrency)) Object.assign(netCheck, { color: 'yellow', status: 'unknown', message: 'Währung auf mindestens einer Seite fehlt.' })
  if (rows.some(row => row.netOcrUncertain)) Object.assign(netCheck, { color: 'yellow', status: 'unknown', message: 'Textebene und OCR liefern unterschiedliche Betragswerte. Bitte Original prüfen.' })
  const checks = [coloredCheck('ta', 'TA-Zuordnung', rows[0]?.ta?.value || '', rows[0]?.ta?.value || '', uncertainTa ? 'yellow' : 'green', uncertainTa ? 'Unsichere Rechnungsreferenz; Datenbanktreffer als Vorschlag.' : ''), netCheck,
    compareCheck('currency', 'Währung', currency || null, expectedCurrency || null),
    compareInvoiceIssuer(invoice, carrierName || imported?.carrier?.originalName, carrierVatId, 'Rechnungsaussteller / Unternehmer', carrierCountry),
    compareCheck('recipient', 'Rechnungsempfänger', field(invoice, 'recipient'), company.legalName)]
  checks.push(compareInvoiceVatId('issuerVatId', 'USt-ID Unternehmer', field(invoice, 'issuerVatId'), carrierVatId, carrierCountry), compareCheck('recipientVatId', 'USt-ID Rechnungsempfänger', field(invoice, 'recipientVatId'), company.vatId))
  const from = imported?.loading, to = imported?.unloading
  for (const [key, label, expected] of [['loadingDate', 'Ladedatum', from?.window?.from?.slice(0, 10)], ['unloadingDate', 'Entladedatum', (to?.window?.until || to?.window?.from)?.slice(0, 10)], ['loadingCity', 'Ladeort', from?.city], ['unloadingCity', 'Entladeort', to?.city], ['licensePlate', 'Kennzeichen', imported?.shipment?.licensePlate]]) {
    rows.forEach((row, index) => checks.push(compareCheck(`${key}-${index}`, label, row[key]?.value, expected, { optional: true, secondary: true })))
  }
  // A header delivery date can corroborate a single transport, but is not a
  // documented loading date and must not be spread across a collection invoice.
  if (invoice.transports?.length === 1) checks.push(compareCheck('deliveryDate-0', 'Liefer-/Leistungsdatum', field(invoice, 'deliveryDate'), (to?.window?.until || to?.window?.from)?.slice(0, 10), { optional: true, secondary: true }))
  return { ta: rows[0]?.ta?.value || '', uncertainTa, netCents: net, expectedNetCents: expectedNet, checks, status: summarizeChecks(checks), evidence: rows.map(row => ({ ta: row.ta?.quote || '', net: row.net?.quote || '' })) }
}
export function invoiceTotals(invoice, { references = [], allAssigned = true } = {}) {
  const net = invoiceCents(field(invoice, 'netTotal')), vat = invoiceCents(field(invoice, 'vatTotal')), gross = invoiceCents(field(invoice, 'grossTotal'))
  const values = (invoice.transports || []).map(row => invoiceCents(row.net?.value))
  const sum = values.length && values.every(value => value !== null) ? values.reduce((a, b) => a + b, 0) : null
  const total = values => values.length && values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : null
  const canCompare = allAssigned && references.length > 0
  const expectedNet = canCompare ? total(references.map(reference => expectedInvoiceNet(reference.imported))) : null
  const expectedVat = canCompare ? total(references.map(reference => reference.financial?.vatCents)) : null
  const expectedGross = canCompare ? total(references.map(reference => reference.financial?.grossCents)) : null
  const currency = field(invoice, 'currency')
  const currencies = [...new Set(references.map(reference => reference.imported?.financial?.currency).filter(Boolean))]
  const expectedCurrency = references.length > 0 && references.every(reference => reference.imported?.financial?.currency) && currencies.length === 1 ? currencies[0] : null
  const sameCurrency = Boolean(currency && expectedCurrency && identity(currency) === identity(expectedCurrency))
  const moneyCheck = (key, label, actual, expected, origin, referenceCurrency = expectedCurrency) => {
    const check = compareCheck(key, label, actual, expected, { equal: (a, b) => a === b, format: 'money' })
    Object.assign(check, { actualCurrency: currency || null, expectedCurrency: referenceCurrency || null, comparisonOrigin: origin })
    if (!origin.startsWith('invoice_') && (!currency || !referenceCurrency || identity(currency) !== identity(referenceCurrency))) Object.assign(check, { color: 'yellow', status: 'unknown', message: 'Rechnungs- und Vergleichswährung sind nicht eindeutig gleich.' })
    return check
  }
  const dbNet = moneyCheck('netTotal', 'Gesamt netto (Cent)', net, expectedNet, 'database')
  const dbVat = moneyCheck('vatTotal', 'MwSt.-Betrag (Cent)', vat, expectedVat, 'database')
  const dbGross = moneyCheck('grossTotal', 'Gesamt brutto (Cent)', gross, expectedGross, 'database')
  // Internal arithmetic remains distinct evidence. It never invents a missing
  // database tax amount or changes the order's authoritative reference values.
  const positionSum = moneyCheck('positionSum', 'Summe Positionen / Rechnungsnetto (Cent)', sum, net, 'invoice_arithmetic', currency)
  const taxSum = moneyCheck('taxSum', 'Netto + MwSt. / Brutto (Cent)', net !== null && vat !== null ? net + vat : null, gross, 'invoice_arithmetic', currency)
  const countries = references.map(reference => countryCode(reference.carrierCountry)).filter(Boolean)
  if (!countries.length) { const country = countryCode(field(invoice, 'issuerCountry')); if (country) countries.push(country) }
  const foreign = countries.some(country => country !== 'DE')
  const foreignRuleApplicable = foreign && vat !== null && vat >= 0
  const foreignVat = coloredCheck('foreignVat', 'MwSt. bei ausländischem Unternehmer', vat, foreign ? 0 : null, !countries.length ? vat > 0 ? 'yellow' : 'gray' : foreign && vat > 0 ? 'red' : foreign && vat === 0 ? 'green' : 'gray', foreign && vat > 0 ? 'Betriebliche Prüfregel: MwSt. bei ausländischem Unternehmer berechnet.' : '', { format: 'money', actualCurrency: currency || null, expectedCurrency: currency || null, comparisonOrigin: 'business_rule' })
  let netCheck = { ...dbNet }, vatCheck = { ...dbVat }, grossCheck = { ...dbGross }
  if (positionSum.color === 'red') netCheck = { ...moneyCheck('netTotal', 'Gesamt netto (Cent)', net, sum, 'invoice_positions', currency), detailKey: 'positionSum' }
  // Preserve the established foreign-carrier business rule as a visible VAT
  // contradiction even if a database booking carries the same positive tax.
  if ((expectedVat === null || foreignVat.color === 'red') && foreignRuleApplicable) vatCheck = moneyCheck('vatTotal', 'MwSt.-Betrag (Cent)', vat, 0, 'business_rule', currency)
  const confirmedVat = expectedVat !== null ? expectedVat : foreignRuleApplicable ? 0 : null
  if (expectedGross === null) {
    if (expectedNet !== null && confirmedVat !== null && sameCurrency) grossCheck = moneyCheck('grossTotal', 'Gesamt brutto (Cent)', gross, expectedNet + confirmedVat, 'reference_calculation')
    else grossCheck = moneyCheck('grossTotal', 'Gesamt brutto (Cent)', gross, net !== null && vat !== null ? net + vat : null, 'invoice_arithmetic', currency)
  }
  if (taxSum.color === 'red') grossCheck = { ...moneyCheck('grossTotal', 'Gesamt brutto (Cent)', gross, net + vat, 'invoice_arithmetic', currency), detailKey: 'taxSum' }
  const detailChecks = [positionSum, taxSum, foreignVat]
  if (netCheck.comparisonOrigin !== 'database') detailChecks.push({ ...dbNet, key: 'databaseNetTotal', label: 'Netto / Datenbank (Cent)' })
  if (vatCheck.comparisonOrigin !== 'database' || expectedVat === null) detailChecks.push({ ...dbVat, key: 'databaseVatTotal', label: 'MwSt. / Datenbank (Cent)' })
  if (grossCheck.comparisonOrigin !== 'database' || expectedGross === null) detailChecks.push({ ...dbGross, key: 'databaseGrossTotal', label: 'Brutto / Datenbank (Cent)' })
  const checks = [netCheck, vatCheck, grossCheck]
  const uncertain = new Set(invoice.amountUncertainKeys || [])
  const uncertainPositions = (invoice.transports || []).some(row => row.netOcrUncertain)
  const markUncertain = check => Object.assign(check, { color: 'yellow', status: 'unknown', message: 'Textebene und OCR liefern unterschiedliche Betragswerte.' })
  for (const check of checks) {
    if (uncertain.has(check.key) || check.key === 'netTotal' && uncertainPositions || check.key === 'grossTotal' && (uncertain.has('netTotal') || uncertain.has('vatTotal'))) markUncertain(check)
  }
  for (const check of detailChecks) {
    check.secondary = true
    if (check.key === 'positionSum' && (uncertain.has('netTotal') || uncertainPositions) || check.key === 'taxSum' && uncertain.size || check.key === 'foreignVat' && uncertain.has('vatTotal') || check.key === 'databaseNetTotal' && uncertain.has('netTotal') || check.key === 'databaseVatTotal' && uncertain.has('vatTotal') || check.key === 'databaseGrossTotal' && uncertain.has('grossTotal')) markUncertain(check)
  }
  return { checks, detailChecks, status: summarizeChecks(checks) }
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
export function recipientAddressCheck(invoice, company = {}) {
  const street = company.street || 'Reinshagenstraße 1', postalCode = company.postalCode || '42369', city = company.city || 'Wuppertal'
  const actual = field(invoice, 'recipientAddress'), expected = `${street}, ${postalCode} ${city}`
  if (!actual) return coloredCheck('recipientAddress', 'Unsere Rechnungsanschrift', null, expected, 'yellow', 'Empfängeranschrift nicht erkannt.')
  const foreignAddress = /\b(?:Polen|Polska|Poland|Niederlande|Netherlands|Frankreich|France|Österreich|Austria|Tschechien|Czechia|Rumänien|Romania|Belgien|Belgium|Schweiz|Switzerland)\b/i.test(actual)
  const postalCodes = actual.match(/\b\d{5}\b/g) || []
  const streetName = street.replace(/\s+\d+\s*[a-z]?(?:\s*[-/]\s*\d+\s*[a-z]?)?$/iu, '')
  const houseNumber = street.slice(streetName.length).trim()
  const actualHouse = text(actual).match(/(?:str(?:aße|asse)?\.?|straße|strasse|weg|platz|allee)\s*(\d+(?:\s*[a-z]\b)?)(?=\s|,|$)/iu)?.[1]
  const placeMatches = approximatelyContains(actual, city)
  const streetMatches = approximatelyContains(actual, streetName)
  const old = approximatelyContains(actual, 'HeinzFangmannstrasse')
  const statedCity = postalCodes.length > 0 && /\b\d{5}\s+[\p{L}]/u.test(actual)
  const statedStreet = /[\p{L}-]+(?:str\.?|straße|strasse|weg|platz|allee)\s*\d*/iu.test(actual)
  const contradiction = foreignAddress || postalCodes.length > 0 && !postalCodes.includes(postalCode) || statedCity && !placeMatches || statedStreet && !streetMatches || houseNumber && actualHouse && identity(actualHouse) !== identity(houseNumber)
  const complete = postalCodes.includes(postalCode) && streetMatches && placeMatches && (!houseNumber || actualHouse && identity(actualHouse) === identity(houseNumber))
  return coloredCheck('recipientAddress', 'Unsere Rechnungsanschrift', actual, expected, contradiction ? 'red' : complete ? 'green' : 'yellow', old ? 'Frühere Firmenanschrift verwendet.' : contradiction ? 'Empfängeranschrift weicht ab.' : complete ? '' : 'Empfängeranschrift unvollständig erkannt.')
}
export function invoiceHeaderChecks(invoice, company, references) {
  const unique = values => [...new Set(values.filter(supplied))]
  const issuers = unique(references.map(reference => reference.carrierName || reference.imported?.carrier?.originalName))
  const vatIds = unique(references.map(reference => reference.carrierVatId))
  const countries = unique(references.map(reference => countryCode(reference.carrierCountry)))
  const carrierCountry = countries.length === 1 ? countries[0] : null
  const billingEvidenceCount = references.reduce((count, reference) => count + (reference.billingEvidence?.length || 0), 0)
  const billingAvailable = references.length > 0 && references.every(reference => reference.billingDataAvailable === true)
  const billing = coloredCheck('billingStatus', 'Bereits abgerechnet / Dublettenabgleich', billingEvidenceCount ? `${billingEvidenceCount} Belegbezüge vorhanden` : null, 'Eindeutiger Abrechnungsstatus', billingAvailable && !billingEvidenceCount ? 'green' : 'yellow', billingEvidenceCount ? 'Belegbezug vorhanden. Dublette, Zahlungsanfrage oder neue Rechnung prüfen.' : billingAvailable ? '' : 'Gebuchte Rechnungen und externe Rechnungsreferenzen sind über die aktuelle Schnittstelle nicht vollständig verfügbar.')
  return [coloredCheck('number', 'Rechnungsnummer', field(invoice, 'number') || null, null, field(invoice, 'number') ? 'gray' : 'yellow'), coloredCheck('date', 'Rechnungsdatum', field(invoice, 'date') || null, null, 'gray', '', { secondary: true }), compareInvoiceIssuer(invoice, issuers.length === 1 ? issuers[0] : null, vatIds.length === 1 ? vatIds[0] : null, 'Rechnungsaussteller', carrierCountry), compareInvoiceVatId('issuerVatId', 'USt-ID Unternehmer', field(invoice, 'issuerVatId'), vatIds.length === 1 ? vatIds[0] : null, carrierCountry), compareCheck('recipient', 'Rechnungsempfänger', field(invoice, 'recipient'), company.legalName), compareCheck('recipientVatId', 'Unsere USt-ID', field(invoice, 'recipientVatId'), company.vatId), recipientAddressCheck(invoice, company), billing]
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
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null
  const dueDate = date(field(invoice, 'dueDate')), invoiceDate = date(field(invoice, 'date'))
  const basis = paymentBasis(field(invoice, 'paymentBasis') || actualText)
  const terms = references.map(reference => reference.payment).filter(Boolean)
  const complete = references.length > 0 && terms.length === references.length
  const expectedDays = complete && terms.every(term => Number.isInteger(term.days) && term.days >= 0 && term.days === terms[0].days) ? terms[0].days : null
  const expectedBasis = terms.length && terms.every(term => term.basis && term.basis === terms[0].basis) ? terms[0].basis : null
  const expectedDue = complete && terms.every(term => date(term.dueDate) && term.dueDate === terms[0].dueDate) ? terms[0].dueDate : null
  const dateDifference = dueDate && invoiceDate ? (Date.parse(dueDate) - Date.parse(invoiceDate)) / 86400000 : null
  const derivedDays = Number.isInteger(dateDifference) && dateDifference >= 0 ? dateDifference : null
  const dayEvidence = `${actualText} ${invoice.paymentDays?.quote || ''}`
  let dayType = /werktag|working\s*day|dni\s+robocz|jours?\s+ouvr/iu.test(dayEvidence) ? 'working' : /banktag|bank\s*day|dni\s+bankow/iu.test(dayEvidence) ? 'bank' : /\b(?:tag(?:e|en)?|days?|dni|jours?)\b/iu.test(dayEvidence) ? 'calendar' : null
  // Only the two expressly supplied invoice dates corroborate an invoice-date
  // deadline. Receipt, delivery and complete-document terms remain distinct.
  const datesCorroborate = derivedDays !== null && (days === null || days === derivedDays) && (!basis || basis === 'invoice_date') && (!dayType || dayType === 'calendar')
  if (datesCorroborate) dayType ||= 'calendar'
  const comparableDays = days ?? (datesCorroborate ? derivedDays : null)
  const comparableBasis = basis || (datesCorroborate ? 'invoice_date' : null)
  const expectedDayType = complete && terms.every(term => term.dayType === terms[0].dayType) ? terms[0].dayType : null
  const contradictoryDates = dateDifference !== null && dateDifference < 0 || days !== null && derivedDays !== null && days !== derivedDays && (!basis || basis === 'invoice_date') && (!dayType || dayType === 'calendar')
  let color = 'yellow', message = days === null && !dueDate ? 'Zahlungsziel in der Rechnung fehlt.' : !complete ? 'Vereinbarte Zahlungsbedingung fehlt.' : 'Zahlungsbedingungen nicht eindeutig vergleichbar.'
  const mismatch = []
  if (dueDate && expectedDue && dueDate !== expectedDue) mismatch.push('Das Fälligkeitsdatum weicht von der Vereinbarung ab.')
  if (basis && expectedBasis && basis !== expectedBasis) mismatch.push('Der Fristbeginn weicht von der Vereinbarung ab.')
  if (days !== null && dayType && expectedDayType && dayType !== expectedDayType) mismatch.push('Kalender-, Werk- oder Banktage unterscheiden sich.')
  if (days !== null && expectedDays !== null && dayType && dayType === expectedDayType && days !== expectedDays) mismatch.push('Die angegebene Tagesfrist weicht von der Vereinbarung ab.')
  if (mismatch.length) { color = 'red'; message = mismatch.join(' ') }
  else if (contradictoryDates) message = 'Angegebene Tagesfrist und Abstand zwischen Rechnungs- und Fälligkeitsdatum widersprechen sich.'
  else if (dueDate && expectedDue) { color = 'green'; message = '' }
  else if (comparableDays !== null && expectedDays !== null) {
    if (!dayType || !expectedDayType) message = 'Kalender-, Werk- oder Banktage sind nicht eindeutig angegeben.'
    else if (days === null && expectedDayType !== 'calendar') message = 'Fälligkeitsdatum kann ohne Arbeits-/Banktagskalender nicht mit der Tagesfrist verglichen werden.'
    else if (new Set(terms.map(term => term.basis).filter(Boolean)).size > 1 || (expectedBasis ? comparableBasis !== expectedBasis : comparableBasis && comparableBasis !== 'invoice_date')) message = 'Der Fristbeginn ist nicht auf beiden Seiten eindeutig vergleichbar.'
    else { color = comparableDays === expectedDays ? 'green' : 'red'; message = expectedBasis ? '' : 'Tagesfrist verglichen; Fristbeginn in der Vereinbarung nicht angegeben.' }
  }
  const dayLabel = type => type === 'working' ? 'Werktage' : type === 'bank' ? 'Banktage' : 'Tage'
  const basisLabel = { invoice_date: 'ab Rechnungsdatum', receipt_date: 'ab Rechnungseingang', documents_received: 'ab vollständigen Belegen', delivery_date: 'ab Lieferung' }
  const actual = [days !== null ? `${days} ${dayLabel(dayType)}` : null, derivedDays !== null ? `aus Datumsangaben: ${derivedDays} Tage` : dueDate ? `fällig: ${dueDate}` : null].filter(Boolean).join(' · ') || null
  const expected = expectedDays !== null ? `${expectedDays} ${dayLabel(expectedDayType)}${expectedBasis ? ` ${basisLabel[expectedBasis] || expectedBasis}` : ''}` : expectedDue ? `fällig: ${expectedDue}` : null
  const sourceText = [days !== null ? `Angegebene Frist: ${days} ${dayLabel(dayType)}${basis ? ` ${basisLabel[basis]}` : ''}.` : null, dueDate && invoiceDate ? `Rechnungsdatum ${invoiceDate}; Fälligkeitsdatum ${dueDate}; Differenz ${dateDifference} Tage.` : dueDate ? `Fälligkeitsdatum ${dueDate}; Rechnungsdatum fehlt oder ist ungültig.` : null].filter(Boolean).join(' ')
  return [coloredCheck('paymentTerms', 'Zahlungsziel', actual, expected, color, message, { sourceText, paymentDays: days, derivedDays, invoiceDate, dueDate })]
}
export function invoiceFactoringChecks(invoice) {
  const clause = typeof invoice?.factoring?.quote === 'string' ? invoice.factoring.quote.trim() : ''
  const indication = text(field(invoice, 'factoring'))
  const found = Boolean(indication && !/^(?:nein|no|false|keine?(?: factoring| forderungsabtretung)?)$/iu.test(indication) && clause)
  const company = found ? text(field(invoice, 'factoringCompany')) : ''
  return [coloredCheck('factoring', 'Factoring / Forderungsabtretung', found ? company ? `Forderungsabtretung an ${company}` : 'Hinweis auf Forderungsabtretung gefunden' : 'Kein Hinweis gefunden', null, found ? 'yellow' : 'green', found ? 'Forderungsabtretung beachten; Zahlungsempfänger prüfen.' : '', { found, ...(company ? { company } : {}), sourceText: found ? clause : '' })]
}
export function invoiceNotices({ headerChecks, paymentChecks, transports, references }) {
  const notices = []
  const add = (kind, message) => { if (!notices.some(item => item.kind === kind && item.message === message)) notices.push({ kind, message, color: 'yellow' }) }
  const address = headerChecks.find(check => check.key === 'recipientAddress')
  if (['yellow', 'red'].includes(address?.color) && address.actual) add('address', address.message)
  if (paymentChecks.some(check => check.key === 'paymentTerms' && check.color === 'red')) add('payment', 'Zahlungsziel weicht von der hinterlegten Vereinbarung ab.')
  for (const transport of transports) {
    const net = transport.checks?.find(check => check.key === 'net' && check.color === 'red')
    if (net) add('cost', `TA ${transport.ta}: ${net.actual > net.expected ? 'Mehr' : 'Weniger'} abgerechnet als vereinbart (${((net.actual - net.expected) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${references.find(reference => reference.ta === transport.ta)?.imported?.financial?.currency || ''}).`)
  }
  for (const reference of references) for (const evidence of reference.billingEvidence || []) add('billing', evidence.message || 'Abrechnungsbezug in der Datenbank vorhanden. Dublette, Zahlungsanfrage oder neue Rechnung prüfen.')
  return notices
}
