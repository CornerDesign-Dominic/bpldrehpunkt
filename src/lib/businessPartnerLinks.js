export function businessPartnerDetailPath(partnerId) {
  return `/kunden-unternehmer/stammdaten/${encodeURIComponent(partnerId)}`
}

export function palletAccountPath(partnerId) {
  return `/paletten/${encodeURIComponent(partnerId)}`
}

export function crmPartnerPath(partnerId) {
  return `/crm/${encodeURIComponent(partnerId)}`
}

// Insolvency documents deliberately use the canonical business-partner ID as
// their document ID. Keep it encoded at each route boundary so IDs imported
// with literal percent signs, spaces, or slashes survive navigation unchanged.
export function insolvencyCasePath(partnerId) {
  return `/insolvenzen/${encodeURIComponent(partnerId)}`
}
