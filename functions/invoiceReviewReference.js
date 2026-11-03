import { paymentTermText } from './paymentTerms.js'

const text = value => typeof value === 'string' ? value.trim() : ''
const knownCountry = value => {
  const code = text(value).toUpperCase()
  if (/^[A-Z]{2}$/.test(code)) return code
  return ({ D: 'DE', DEUTSCHLAND: 'DE', GERMANY: 'DE', POLEN: 'PL', POLAND: 'PL', POLSKA: 'PL' })[code] || null
}

// The partner field is deliberately a complete contractual text, despite its
// legacy name paymentTermDays. Never assume that its deadline starts at issue.
export function invoicePaymentReference(value) {
  const source = text(value)
  const normalized = source.normalize('NFKC').toLocaleLowerCase('de-DE')
  const candidates = [...normalized.matchAll(/\b(\d{1,3})\s*(?:(?:kalender|werk|bank)\s*)?tage?\b/gu)].map(match => Number(match[1]))
  const net = /\b(\d{1,3})\s*tage?\s*(?:rein\s*)?netto\b/u.exec(normalized) || /\bnetto\s*(\d{1,3})\s*tage?\b/u.exec(normalized)
  const numberOnly = /^\d{1,3}$/.test(normalized) ? Number(normalized) : null
  const parsed = net ? Number(net[1]) : new Set(candidates).size === 1 ? candidates[0] : numberOnly
  const days = Number.isInteger(parsed) && parsed >= 0 && parsed <= 365 ? parsed : null
  const dayTypes = new Set([...normalized.matchAll(/\b\d{1,3}\s*(kalender|werk|bank)?\s*tage?\b/gu)].map(match => ({ werk: 'working', bank: 'bank' })[match[1]] || 'calendar'))
  const dayType = days !== null && dayTypes.size === 1 ? [...dayTypes][0] : null
  let basis = null
  if (/beleg(?:en|e|eingang)?|unterlagen|dokument(?:en|e)?/u.test(normalized) && /eingang|erhalt|vollständig/u.test(normalized)) basis = 'documents_received'
  else if (/rechnungseingang|erhalt\s+(?:der\s+)?rechnung|eingang\s+(?:der\s+)?rechnung/u.test(normalized)) basis = 'receipt_date'
  else if (/rechnungsdatum|rechnungsstellung|invoice\s*date/u.test(normalized)) basis = 'invoice_date'
  else if (/ablieferung|entladung|zustellung|lieferdatum|leistungsdatum/u.test(normalized)) basis = 'delivery_date'
  return { text: source, days, dayType, basis, dueDate: null }
}

export async function loadInvoiceReference({ db, imported, sourcePartner }) {
  const carrier = imported?.carrier || {}
  const partnerId = text(carrier.partnerId)
  let partner = null
  let matchedPartnerId = null
  let partnerMatch = null
  if (partnerId && partnerId.length <= 240 && !partnerId.includes('/')) {
    const snapshot = await db.doc(`businessPartners/${partnerId}`).get()
    const candidate = snapshot.data()
    if (candidate && !candidate.mergedIntoPartnerId && candidate.status !== 'merged') { partner = candidate; matchedPartnerId = partnerId; partnerMatch = 'partnerId' }
  }
  // A read-only DyCoS fallback does not carry Drehpunkt's partnerId. Its exact
  // creditor account may identify the existing partner, but names/VAT IDs may not.
  let partnerAmbiguous = false
  const creditorNumber = text(carrier.creditorNumber)
  if (!partner && /^\d{1,120}$/.test(creditorNumber)) {
    const snapshots = await Promise.all([
      db.collection('businessPartners').where('creditorNumber', '==', creditorNumber).limit(2).get(),
      db.collection('businessPartners').where('dycosReferences.creditorNumbers', 'array-contains', creditorNumber).limit(2).get(),
    ])
    const matches = new Map()
    for (const snapshot of snapshots) for (const doc of snapshot.docs) {
      const candidate = doc.data()
      if (candidate && !candidate.mergedIntoPartnerId && candidate.status !== 'merged') matches.set(doc.id, candidate)
    }
    if (matches.size === 1) { [matchedPartnerId, partner] = [...matches.entries()][0]; partnerMatch = 'creditorNumber' }
    partnerAmbiguous = matches.size > 1
  }
  const sourceCarrierId = text(imported?.source?.carrierId)
  // Source identities are a separate namespace from creditor accounts. Only
  // use the exact entity/id tuple, never a name, invoice VAT ID or substring.
  if (!partner && !partnerAmbiguous && !creditorNumber && /^[1-9]\d{0,119}$/.test(sourceCarrierId)) {
    const snapshot = await db.collection('businessPartners').where('dycosImport.sourceReferences', 'array-contains', { entity: 'carrier', id: sourceCarrierId }).limit(2).get()
    const matches = new Map()
    for (const doc of snapshot.docs) {
      const candidate = doc.data()
      if (candidate && !candidate.mergedIntoPartnerId && candidate.status !== 'merged') matches.set(doc.id, candidate)
    }
    if (matches.size === 1) { [matchedPartnerId, partner] = [...matches.entries()][0]; partnerMatch = 'dycosSourceReference' }
    partnerAmbiguous = matches.size > 1
  }
  // The parent has mapped this exact TA's authenticated DyCoS response. Bind
  // its carrier section again before taking missing comparison values from it.
  // Ambiguous local identities are not repaired by silently choosing a source.
  const sourceFields = !partnerAmbiguous && /^[1-9]\d{0,119}$/.test(sourceCarrierId) && sourcePartner?.sourceKind === 'carrier' && text(sourcePartner.sourceId) === sourceCarrierId ? sourcePartner.fields : null
  const choose = (local, remote) => text(local) ? { value: text(local), source: 'Drehpunkt' } : text(remote) ? { value: text(remote), source: 'DyCoS' } : { value: null, source: null }
  const name = choose(partner?.companyName, sourceFields?.companyName)
  const vatId = choose(partner?.companyData?.vatId, sourceFields?.companyData?.vatId)
  const payment = choose(paymentTermText(partner), paymentTermText(sourceFields))
  const localCountry = knownCountry(partner?.address?.country)
  const sourceCountry = knownCountry(sourceFields?.address?.country)
  const snapshotCountry = knownCountry(carrier.snapshot?.country)
  const billingEvidence = []
  const seen = new Set()
  for (const position of imported?.financial?.costPositions || []) {
    const documentSourceId = text(position.documentSourceId)
    const documentLineSourceId = text(position.documentLineSourceId)
    if (!/^[1-9]\d*$/.test(documentSourceId) || seen.has(documentSourceId)) continue
    seen.add(documentSourceId)
    billingEvidence.push({
      kind: 'document_reference', documentSourceId,
      documentLineSourceId: /^[1-9]\d*$/.test(documentLineSourceId) ? documentLineSourceId : null,
      message: 'Kostenposition ist mit einem DyCoS-Beleg verknüpft. Bereits abgerechnet oder Zahlungsanfrage? Bitte prüfen.',
    })
  }
  return {
    carrierName: name.value,
    carrierVatId: vatId.value,
    carrierCountry: localCountry || sourceCountry || snapshotCountry,
    payment: invoicePaymentReference(payment.value),
    referenceSources: { carrierName: name.source, carrierVatId: vatId.source, carrierCountry: localCountry ? 'Drehpunkt' : sourceCountry ? 'DyCoS' : snapshotCountry ? 'Auftrag' : null, payment: payment.source },
    partnerReference: { partnerId: matchedPartnerId, match: partnerMatch, sourceCarrierId: sourceCarrierId || null, sourcePartnerUsed: [name.source, vatId.source, payment.source].includes('DyCoS') || Boolean(!localCountry && sourceCountry) },
    // Current safe DyCoS mapping excludes invoice heads (unclassified document
    // kinds 2/3/7), external invoice references and tax/gross booking amounts.
    // Technical document IDs are only review indications, never proof of billing.
    financial: { vatCents: null, grossCents: null },
    billingDataAvailable: false,
    billingEvidence,
    partnerAmbiguous,
  }
}
