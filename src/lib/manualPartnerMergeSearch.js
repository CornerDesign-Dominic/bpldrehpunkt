import { partnerReferenceNumbers } from './partnerReferencePresentation.js'

export function matchingManualMergePartners(partners, currentPartnerId, query) {
  const needle = String(query ?? '').trim().toLocaleLowerCase('de-DE')
  return partners.filter((partner) => {
    if (!partner?.id || partner.id === currentPartnerId || partner.status !== 'active' || partner.mergedIntoPartnerId) return false
    if (!needle) return true
    const values = [partner.companyName, ...partnerReferenceNumbers(partner, 'debtor').numbers, ...partnerReferenceNumbers(partner, 'creditor').numbers]
    return values.some((value) => String(value ?? '').toLocaleLowerCase('de-DE').includes(needle))
  })
}
