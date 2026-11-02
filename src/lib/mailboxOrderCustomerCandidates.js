const clean = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('de-DE')
const vat = value => clean(value).replace(/[^a-z0-9]/g, '')
const location = value => clean(value).replace(/[\s.,-]/g, '')
const numbers = partner => [partner.debtorNumber, ...(partner.dycosReferences?.debtorNumbers || [])].filter(Boolean)

// Suggestions never assign a customer. Conflicting VAT IDs must not be hidden
// by a coincidentally identical town; every candidate still needs confirmation.
export function mailboxOrderCustomerCandidates(partners, order) {
  const requestedVat = vat(order?.customerVatId)
  const requestedPostal = location(order?.customerPostalCode)
  const requestedCity = location(order?.customerCity)
  const requestedName = clean(order?.customerName)
  return partners.flatMap(partner => {
    if (partner.mergedIntoPartnerId || partner.status === 'merged' || !numbers(partner).length) return []
    const partnerVat = vat(partner.companyData?.vatId)
    if (requestedVat && partnerVat && requestedVat !== partnerVat) return []
    const vatMatch = Boolean(requestedVat && partnerVat === requestedVat)
    const addressMatch = Boolean(requestedPostal && requestedCity && location(partner.address?.postalCode) === requestedPostal && location(partner.address?.city) === requestedCity)
    const nameMatch = Boolean(requestedName && clean(partner.companyName) === requestedName)
    const numberMatch = Boolean(order?.customerNumber && numbers(partner).includes(order.customerNumber))
    if (!vatMatch && !addressMatch && !nameMatch && !numberMatch) return []
    return [{ partner, vatMatch, addressMatch, nameMatch, numberMatch, score: (numberMatch ? 100 : 0) + (vatMatch ? 80 : 0) + (addressMatch ? 20 : 0) + (nameMatch ? 10 : 0) }]
  }).sort((a, b) => b.score - a.score || a.partner.companyName.localeCompare(b.partner.companyName, 'de'))
}
