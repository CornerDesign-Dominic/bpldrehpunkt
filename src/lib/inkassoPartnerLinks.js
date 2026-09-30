// Keep the role selected for an Inkasso debtor when a case creates a linked
// to-do. The canonical partner ID is retained without transformation.
// Legacy cases without a stored role retain the former carrier fallback.
export function inkassoTodoPartnerValues(inkassoCase = {}) {
  const partnerId = typeof inkassoCase.debtorPartnerId === 'string' ? inkassoCase.debtorPartnerId : ''
  const partnerName = typeof inkassoCase.debtorName === 'string' ? inkassoCase.debtorName : ''
  if (!partnerId) return {}
  return inkassoCase.debtorPartnerRole === 'customer'
    ? { customerId: partnerId, customerName: partnerName }
    : { carrierId: partnerId, carrierName: partnerName }
}
