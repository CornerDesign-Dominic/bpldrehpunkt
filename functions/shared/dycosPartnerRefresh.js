const number = value => typeof value === 'string' && /^(0|[1-9]\d{0,9})$/.test(value) && Number(value) <= 2147483647

export function dycosPartnerRefreshAccounts(partner = {}) {
  const accounts = []
  for (const [typ, field, aliases, entity] of [['kunde', 'debtorNumber', 'debtorNumbers', 'customer'], ['utn', 'creditorNumber', 'creditorNumbers', 'carrier']]) {
    const references = partner.dycosReferences || {}
    const values = [partner[field], ...(Array.isArray(references[aliases]) ? references[aliases] : []), ...(Array.isArray(references.accounts) ? references.accounts : []).filter(account => account?.entity === entity).map(account => account.number)]
    for (const nummer of new Set(values)) if (number(nummer)) accounts.push({ typ, nummer })
  }
  return accounts
}

export function dycosPartnerRefreshTargets(partner = {}) {
  const all = dycosPartnerRefreshAccounts(partner), targets = []
  for (const [typ, field] of [['kunde', 'debtorNumber'], ['utn', 'creditorNumber']]) {
    const primary = all.find(account => account.typ === typ && account.nummer === partner[field])
    const options = all.filter(account => account.typ === typ)
    if (!primary && options.length > 1) return null
    if (primary || options[0]) targets.push(primary || options[0])
  }
  return targets
}
