const normalized = (value) => value === null || value === undefined ? '' : String(value).trim()

export function partnerReferenceNumbers(partner, kind) {
  const primaryKey = kind === 'debtor' ? 'debtorNumber' : 'creditorNumber'
  const listKey = kind === 'debtor' ? 'debtorNumbers' : 'creditorNumbers'
  const primary = normalized(partner?.[primaryKey])
  const references = Array.isArray(partner?.dycosReferences?.[listKey]) ? partner.dycosReferences[listKey] : []
  const numbers = [...new Set([primary, ...references.map(normalized)].filter(Boolean))]
  return { primary, numbers, additional: numbers.filter((number) => number !== primary) }
}

export function mergedPartnerHistoryEntry(history, source) {
  return {
    mergeId: history.mergeId || '',
    id: source?.id || history.sourcePartnerId || '',
    companyName: source?.companyName || history.sourcePartnerName || 'Archiviertes Stammdatenblatt',
    debtorNumber: normalized(source?.debtorNumber),
    creditorNumber: normalized(source?.creditorNumber),
    mergedAt: history.createdAt || source?.mergedAt || null,
    actorName: history.actor?.name || source?.mergedBy?.name || '',
    canOpen: Boolean(source?.id),
  }
}

export function partnerMergeReversalAction(entry) {
  return {
    enabled: Boolean(entry?.mergeId && entry?.reversal?.canSeparate),
    reason: entry?.reversal?.reason || 'Diese frühere Zusammenführung kann nicht automatisch sicher getrennt werden.',
  }
}
