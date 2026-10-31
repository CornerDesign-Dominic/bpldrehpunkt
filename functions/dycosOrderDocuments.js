// Invoice data is deliberately projected: no bank details, server paths or raw
// document rows enter the transport order. IDs use the persistent KopfID,
// never the connector's changing ItemInternalId.
export function mapDycosOrderDocuments(payload, orderId, fail) {
  const warnings = new Set()
  const empty = value => value === undefined || value === null || value === ''
  const text = (value, field) => {
    if (empty(value)) return null
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
    if (typeof value !== 'string' || value.length > 4000) fail(field)
    return value.trim() || null
  }
  const id = (value, field) => {
    const result = text(value, field)
    if (!result || /^0+$/.test(result)) return null
    if (!/^\d+$/.test(result) || !Number.isSafeInteger(Number(result))) fail(field)
    return String(Number(result))
  }
  const flag = (value, field) => {
    if (empty(value)) return null
    if (typeof value === 'boolean') return value
    if (value === 0 || value === 1) return value === 1
    fail(field)
  }
  const basename = (value, field) => {
    const source = text(value, field)
    return source?.split(/[\\/]/).at(-1) || null
  }
  const documentDate = (value, field, documentWarnings) => {
    const rawDate = text(value, field)
    if (!rawDate) return null
    const german = rawDate.match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/)
    const iso = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
    const parts = german ? [Number(german[3]) + (german[3].length === 2 ? 2000 : 0), Number(german[2]), Number(german[1])] : iso ? iso.slice(1).map(Number) : null
    if (parts) {
      const [year, month, day] = parts, check = new Date(Date.UTC(year, month - 1, day))
      if (year > 1900 && check.getUTCFullYear() === year && check.getUTCMonth() + 1 === month && check.getUTCDate() === day) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    documentWarnings.add('DOCUMENT_DATE_UNCONFIRMED')
    return null
  }
  const references = new Set(), externalReferences = new Map()
  for (const [collection, key] of [['auftragspreise', 'RechKopfID'], ['tourkosten', 'RechKopfID'], ['fakturaZeilen', 'KopfID']]) {
    for (const row of payload[collection]) {
      if (id(row.AuftragID, `${collection}.AuftragID`) !== orderId) continue
      const reference = id(row[key], `${collection}.${key}`)
      if (reference) {
        references.add(reference)
        const number = text(row.ExterneBelegNr, `${collection}.ExterneBelegNr`)
        if (number) {
          if (!externalReferences.has(reference)) externalReferences.set(reference, new Set())
          externalReferences.get(reference).add(number)
        }
      }
    }
  }
  const byId = new Map(), numberIdentities = new Map()
  for (const row of payload.fakturaKopf) {
    const sourceId = id(row.KopfID, 'fakturaKopf.KopfID')
    if (!sourceId || !references.has(sourceId)) continue
    const documentWarnings = new Set()
    const internalFileName = basename(row.PDFDateinameMitPfadFakturaBelegOriginal, 'fakturaKopf.PDFDateinameMitPfadFakturaBelegOriginal')
    const externalFileName = basename(row.PDFDateiname, 'fakturaKopf.PDFDateiname')
    const proforma = flag(row.bProformabeleg, 'fakturaKopf.bProformabeleg')
    const carrier = flag(row.bUnternehmer, 'fakturaKopf.bUnternehmer')
    const correction = flag(row.bRechnungskorrektur, 'fakturaKopf.bRechnungskorrektur')
    const cancelled = flag(row.Storniert, 'fakturaKopf.Storniert')
    const rawCode = id(row.Belegart, 'fakturaKopf.Belegart')
    const sourceNumberId = id(row.BelegNrID, 'fakturaKopf.BelegNrID')
    const documentTitle = text(row.TextRechnung, 'fakturaKopf.TextRechnung')?.toUpperCase() || ''
    const side = carrier === null ? 'unknown' : carrier ? 'carrier' : 'customer'
    const prefix = internalFileName?.replace(/\.pdf$/i, '').split('_')[0].toLowerCase() || ''
    const fileType = ({ rechnung: 'invoice', gutschrift: 'credit_note', gutschriftutn: 'credit_note', proformarechnung: 'proforma_invoice', proformagutschrift: 'proforma_credit_note', proformagutschriftutn: 'proforma_credit_note', stornorechnung: 'invoice_cancellation' })[prefix] || 'unknown'
    let internalType = fileType
    let businessType = 'unknown', issuer = 'unknown'
    const fileProforma = fileType === 'unknown' ? null : fileType.startsWith('proforma_')
    const cancellationSignal = fileType === 'invoice_cancellation' || rawCode === '5' || documentTitle === 'STORNO-RECHNUNG'
    const confirmedCancellation = fileType === 'invoice_cancellation' && rawCode === '5' && documentTitle === 'STORNO-RECHNUNG' && side === 'customer' && proforma === false && cancelled === false && correction !== true
    const contradictory = fileProforma !== null && proforma !== null && fileProforma !== proforma
      || prefix === 'proformagutschriftutn' && carrier === false
      || cancellationSignal && (side === 'carrier' || proforma === true || cancelled === true || correction === true
        || fileType !== 'unknown' && fileType !== 'invoice_cancellation' || rawCode !== null && rawCode !== '5'
        || documentTitle && documentTitle !== 'STORNO-RECHNUNG')
    if (contradictory) { internalType = 'unknown'; documentWarnings.add('DOCUMENT_SOURCE_CONFLICT') }
    // These cases are verified against real exports and confirmed by the user.
    // Codes alone never determine issuer or business type. A customer invoice
    // cancellation has a distinct KopfID even when BelegNr/BelegNrID are shared.
    if (!contradictory && correction !== true) {
      if (side === 'customer' && proforma === false && fileType === 'invoice') { businessType = 'customer_invoice'; issuer = 'us' }
      if (side === 'customer' && proforma === true && fileType === 'proforma_invoice') { businessType = 'customer_credit_note'; issuer = 'partner' }
      if (side === 'carrier' && proforma === true && fileType === 'proforma_credit_note') { businessType = 'carrier_invoice'; issuer = 'partner' }
      if (confirmedCancellation) { businessType = 'customer_invoice_cancellation'; issuer = 'us' }
    }
    if (businessType === 'unknown') documentWarnings.add('DOCUMENT_TYPE_UNCONFIRMED')
    if (correction === true) { internalType = 'unknown'; documentWarnings.add('DOCUMENT_TYPE_UNCONFIRMED') }
    // TextStorno also contains ordinary proforma descriptions. It must never
    // turn a normal booking into a cancellation.
    const cancellationReference = id(row.StornoRechungNr, 'fakturaKopf.StornoRechungNr')
    if (cancellationReference && cancelled !== true) documentWarnings.add('DOCUMENT_CANCELLATION_UNCONFIRMED')
    const date = documentDate(row.BelegDatum, 'fakturaKopf.BelegDatum', documentWarnings)
    const cancellationDate = cancelled === true ? documentDate(row.StornoRechnungDatum, 'fakturaKopf.StornoRechnungDatum', documentWarnings) : null
    const externalNumbers = new Set(externalReferences.get(sourceId) || [])
    const headerExternalNumber = text(row.ExterneBelegnummer, 'fakturaKopf.ExterneBelegnummer')
    if (headerExternalNumber) externalNumbers.add(headerExternalNumber)
    if (externalNumbers.size > 1) documentWarnings.add('DOCUMENT_NUMBER_CONFLICT')
    const mapped = {
      id: `dycos-document-${sourceId}`, sourceId, side, businessType, issuer, internalType,
      internalNumber: text(row.BelegNr, 'fakturaKopf.BelegNr'), externalNumber: externalNumbers.size === 1 ? [...externalNumbers][0] : null,
      date, currency: 'EUR', proforma, cancelled, cancellationReference, sourceDocumentCode: rawCode === null ? null : Number(rawCode),
      originalDocumentSourceId: null, originalDocumentNumber: null, cancellationDate,
      internalFileName, externalFileName, warningCodes: [...documentWarnings].sort(),
    }
    const identity = { sourceNumberId, referenceNumber: confirmedCancellation ? text(row.TextStorno, 'fakturaKopf.TextStorno') : null }
    const previous = byId.get(sourceId)
    if (previous && (JSON.stringify(previous) !== JSON.stringify(mapped) || JSON.stringify(numberIdentities.get(sourceId)) !== JSON.stringify(identity))) fail('fakturaKopf.duplicateDocument')
    byId.set(sourceId, mapped)
    numberIdentities.set(sourceId, identity)
    for (const warning of documentWarnings) warnings.add(warning)
  }
  for (const document of byId.values()) {
    if (document.businessType !== 'customer_invoice_cancellation') continue
    const identity = numberIdentities.get(document.sourceId)
    const candidates = [...byId.values()].filter(original => original.sourceId !== document.sourceId && original.businessType === 'customer_invoice'
      && [2, 3].includes(original.sourceDocumentCode) && original.side === 'customer' && original.cancelled === true && original.proforma === false
      && document.internalNumber !== null && original.internalNumber === document.internalNumber && identity.sourceNumberId !== null
      && numberIdentities.get(original.sourceId)?.sourceNumberId === identity.sourceNumberId
      && (!identity.referenceNumber || identity.referenceNumber === original.internalNumber)
      && (!original.cancellationReference || original.cancellationReference === identity.sourceNumberId)
      && (!original.cancellationDate || !document.date || original.cancellationDate === document.date))
    if (candidates.length === 1) {
      document.originalDocumentSourceId = candidates[0].sourceId
      document.originalDocumentNumber = candidates[0].internalNumber
    } else {
      document.warningCodes = [...new Set([...document.warningCodes, 'DOCUMENT_CANCELLATION_UNCONFIRMED'])].sort()
      warnings.add('DOCUMENT_CANCELLATION_UNCONFIRMED')
    }
  }
  return { documents: [...byId.values()].sort((left, right) => Number(left.sourceId) - Number(right.sourceId)), warningCodes: [...warnings].sort() }
}
