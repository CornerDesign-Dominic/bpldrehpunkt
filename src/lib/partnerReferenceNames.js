import { resolvePartnerInIndex } from './partnerCluster.js'

export const casePartnerFields = Object.freeze({
  damage: [['claimantPartnerId', 'claimant'], ['contractorPartnerId', 'contractor']],
  inkasso: [['debtorPartnerId', 'debtorName']],
  insolvency: [['partnerId', 'partnerName']],
  legalDispute: [['counterpartyPartnerId', 'counterparty']],
  todo: [['customerId', 'customerName'], ['carrierId', 'carrierName']],
})

// Presentation only: never replace names or IDs used for editing/persistence.
// One index is shared by the whole visible list, with no per-row network reads.
export function presentPartnerReferences(record, fields, partnersById, canResolve = true) {
  const names = {}
  const search = []
  let failed = false
  for (const [idField, nameField] of fields) {
    const originalId = record[idField]
    search.push(record[nameField])
    if (!canResolve || !originalId) continue
    const original = partnersById.get(originalId)
    if (!original) { failed = true; continue }
    search.push(original.companyName)
    try {
      const current = resolvePartnerInIndex(partnersById, originalId)
      if (current?.companyName) { names[nameField] = current.companyName; search.push(current.companyName) }
    } catch { failed = true }
  }
  return { ...record, partnerReferenceNames: names, partnerSearchText: search.filter(Boolean).join(' '), partnerReferenceFailed: failed }
}

export function partnerReferenceName(record, field) {
  return record.partnerReferenceNames?.[field] || record[field] || ''
}

export function presentCasePartnerReferences(records, type, partners, canResolve = true) {
  const index = new Map(partners.map((partner) => [partner.id, partner]))
  return records.map((record) => presentPartnerReferences(record, casePartnerFields[type] || [], index, canResolve))
}

export function partnerClusterSearchNames(partners) {
  const index = new Map(partners.map((partner) => [partner.id, partner]))
  const names = new Map()
  for (const partner of partners) {
    let root
    try { root = resolvePartnerInIndex(index, partner.id) } catch { continue }
    if (!root) continue
    names.set(root.id, [...(names.get(root.id) || []), partner.companyName, partner.shortName].filter(Boolean))
  }
  return names
}
