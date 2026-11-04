import { invoiceCents } from './invoiceReviewPolicy.js'

const id = value => /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? String(Number(value)) : null
const flag = value => value === true || value === 1 ? true : value === false || value === 0 ? false : null
const currency = value => {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(code) ? code : null
}

// This private projection is separate from the shared transport model. Only
// heads already linked to this order are considered; no raw rows, paths or
// banking fields are persisted in invoice reports.
export function mapInvoiceBillingHeaders(payload, imported) {
  const linked = new Map((imported.financial?.documents || []).map(document => [document.sourceId, document]))
  const expected = new Set(linked.keys())
  for (const [collection, key] of [['fakturaZeilen', 'KopfID'], ['tourkosten', 'RechKopfID'], ['auftragspreise', 'RechKopfID']]) {
    for (const row of payload[collection] || []) {
      if (id(row.AuftragID) !== id(imported.source?.orderId)) continue
      const reference = id(row[key])
      if (reference) expected.add(reference)
    }
  }
  const present = new Set((payload.fakturaKopf || []).map(head => id(head.KopfID)).filter(Boolean))
  const documents = []
  for (const head of payload.fakturaKopf || []) {
    const sourceId = id(head.KopfID), document = linked.get(sourceId)
    if (!document) continue
    const net = invoiceCents(head.Nettowert), tax = invoiceCents(head.Mwst), gross = invoiceCents(head.Gesamt)
    const amountsConsistent = net === null || tax === null || gross === null || net + tax === gross
    const correction = flag(head.bRechnungskorrektur)
    const side = flag(head.bUnternehmer)
    const eligible = side === false || correction === true || document.businessType !== 'unknown' && document.businessType !== 'carrier_invoice' ? false
      : side === true && correction === false && document.businessType === 'carrier_invoice' ? true : null
    documents.push({
      sourceId, carrierSourceId: side === true ? id(head.AdressID) : null,
      externalNumber: typeof head.ExterneBelegnummer === 'string' && head.ExterneBelegnummer.trim().length <= 240 ? head.ExterneBelegnummer.trim() || null : null,
      grossCents: amountsConsistent ? gross : null,
      // Gesamt is the head's original-currency amount, not GesamtEUR/KW.
      // Never label it EUR based solely on a converted-currency column.
      currency: currency(head.WaehrungBezFW),
      cancelled: flag(head.Storniert), eligible,
    })
  }
  return { billingDocuments: [...new Map(documents.map(document => [JSON.stringify(document), document])).values()], billingDataAvailable: Array.isArray(payload.fakturaKopf) && [...expected].every(sourceId => present.has(sourceId) && linked.has(sourceId)) }
}
