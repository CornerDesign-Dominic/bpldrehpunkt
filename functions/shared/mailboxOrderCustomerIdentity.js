// The order export consumes confirmed account mappings from the stammdaten
// importer. A source reference without its business account number is not
// sufficient evidence, especially after partner merges.
export function mailboxOrderCustomerIdentity(partner, number) {
  if (!partner || partner.mergedIntoPartnerId || partner.status === 'merged' || typeof number !== 'string') return null
  const references = partner.dycosReferences || {}
  const sources = Array.isArray(partner.dycosImport?.sourceReferences) ? partner.dycosImport.sourceReferences : []
  const owns = [partner.debtorNumber, ...(Array.isArray(references.debtorNumbers) ? references.debtorNumbers : [])].includes(number)
  if (!owns) return null
  const ids = new Set()
  const legacy = partner.dycosIdentities?.[`debtor-${number}`]
  if (legacy) {
    if (legacy.kind !== 'debtor' || legacy.number !== number || typeof legacy.sourceId !== 'string') return null
    ids.add(legacy.sourceId)
  }
  if (references.accounts !== undefined && !Array.isArray(references.accounts)) return null
  for (const account of references.accounts || []) {
    if (account?.entity !== 'customer' || account.number !== number) continue
    if (typeof account.sourceId !== 'string' || !sources.some(source => source?.entity === 'customer' && source.id === account.sourceId)) return null
    ids.add(account.sourceId)
  }
  if (ids.size !== 1) return null
  const sourceId = [...ids][0]
  if (!/^[1-9]\d{0,9}$/.test(sourceId) || Number(sourceId) > 2147483647) return null
  return { kind: 'debtor', number, sourceId }
}
