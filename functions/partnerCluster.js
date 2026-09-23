const identifier = (value) => typeof value === 'string' ? value.trim() : ''

export const PARTNER_REFERENCE_CATALOG = Object.freeze([
  { collection: 'transportOrders', fields: ['imported.customer.partnerId', 'imported.carrier.partnerId'] },
  { collection: 'todos', fields: ['customerId', 'carrierId'], originFields: ['damageCaseId', 'insolvencyId', 'legalDisputeId', 'inkassoCaseId', 'reference'] },
  { collection: 'damageCases', fields: ['claimantPartnerId', 'contractorPartnerId'], originFields: ['transportReference'] },
  { collection: 'insolvencies', fields: ['partnerId'], documentIdIsPartnerId: true },
  { collection: 'inkassoCases', fields: ['debtorPartnerId'] },
  { collection: 'palletMovements', fields: ['partnerId', 'customerId', 'carrierId'] },
  { collection: 'palletClosings', fields: ['partnerId'] },
  { collection: 'customerImportRows', fields: ['customerId', 'result.partnerId'] },
  { collection: 'carrierImportRows', fields: ['carrierId', 'result.partnerId'] },
  { collection: 'businessPartners', fields: ['linkedCarrierReference.partnerId'] },
  { collection: 'legalDisputes', fields: [], originFields: ['transportReference'] },
])

export function resolvePartnerInIndex(partnersById, partnerId) {
  let current = partnersById.get(identifier(partnerId))
  const visited = new Set()
  while (current?.mergedIntoPartnerId) {
    if (visited.has(current.id)) throw new Error('Zyklische Partner-Weiterleitung.')
    visited.add(current.id)
    const nextId = identifier(current.mergedIntoPartnerId)
    if (!nextId || nextId === current.id) throw new Error('Ungültige Partner-Weiterleitung.')
    current = partnersById.get(nextId)
    if (!current) throw new Error('Weiterleitungsziel nicht vorhanden.')
  }
  if (current?.status === 'merged') throw new Error('Archivierter Partner ohne aktives Weiterleitungsziel.')
  return current || null
}

export function partnerClusterMembers(partners, rootId) {
  const byId = new Map(partners.map((partner) => [partner.id, partner]))
  const root = resolvePartnerInIndex(byId, rootId)
  if (!root) return []
  return partners.filter((partner) => resolvePartnerInIndex(byId, partner.id)?.id === root.id)
}

export function indexPartnerClusters(partners) {
  const byId = new Map(partners.map((partner) => [partner.id, partner]))
  const membersByRoot = new Map()
  for (const partner of partners) {
    const root = resolvePartnerInIndex(byId, partner.id)
    if (!root) continue
    membersByRoot.set(root.id, [...(membersByRoot.get(root.id) || []), partner])
  }
  return membersByRoot
}

export function mergeClusterRedirects(partners, sourceId, targetId) {
  const byId = new Map(partners.map((partner) => [partner.id, partner]))
  const source = byId.get(sourceId); const target = byId.get(targetId)
  if (!source || !target || sourceId === targetId || source.mergedIntoPartnerId || target.mergedIntoPartnerId || source.status === 'merged' || target.status === 'merged') throw new Error('Nur zwei verschiedene aktive Hauptpartner können zusammengeführt werden.')
  const members = partnerClusterMembers(partners, sourceId)
  if (members.some((member) => member.id === targetId)) throw new Error('Ein Partner kann nicht mit seinem eigenen Cluster zusammengeführt werden.')
  return members.filter((member) => member.id !== sourceId)
}

export function assertFlatPartnerCluster(partners) {
  const byId = new Map(partners.map((partner) => [partner.id, partner]))
  for (const partner of partners) {
    if (!partner.mergedIntoPartnerId) {
      if (partner.status === 'merged') throw new Error(`Archivierter Partner ohne Weiterleitung: ${partner.id}`)
      continue
    }
    const targetId = identifier(partner.mergedIntoPartnerId)
    if (partner.status !== 'merged' || !targetId || targetId === partner.id || !byId.has(targetId) || byId.get(targetId).mergedIntoPartnerId || byId.get(targetId).status === 'merged') throw new Error(`Nicht flache Partner-Weiterleitung: ${partner.id}`)
  }
  return true
}

export function partnerNumbers(partner, kind) {
  const primary = kind === 'debtor' ? 'debtorNumber' : 'creditorNumber'
  const list = kind === 'debtor' ? 'debtorNumbers' : 'creditorNumbers'
  return [...new Set([partner?.[primary], ...(partner?.dycosReferences?.[list] || [])].map((value) => String(value ?? '').trim()).filter(Boolean))]
}

export function ownedPartnerNumbers(source, descendantMembers) {
  const owned = (kind) => {
    const descendants = new Set(descendantMembers.flatMap((member) => partnerNumbers(member, kind)))
    return partnerNumbers(source, kind).filter((number) => !descendants.has(number))
  }
  return { debtors: owned('debtor'), creditors: owned('creditor') }
}

export function effectivePartnerReference(partnersById, originalId) {
  const active = resolvePartnerInIndex(partnersById, originalId)
  return { originalPartnerId: originalId || '', effectivePartnerId: active?.id || '', effectivePartnerName: active?.companyName || '' }
}
