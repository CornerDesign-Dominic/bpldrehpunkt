function hasReference(value) { return Boolean(value !== null && value !== undefined && String(value).trim()) }

function roleValues(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.entries(value).filter(([, enabled]) => enabled === true).map(([role]) => role)
  return typeof value === 'string' ? [value] : []
}

function explicitRoles(partner) {
  return new Set([
    ...roleValues(partner?.businessPartnerRoles),
    ...roleValues(partner?.partnerRoles),
  ].map((role) => String(role).trim().toLocaleLowerCase('de-DE')))
}

function hasExplicitRole(roles, role) {
  return role === 'customer' ? roles.has('customer') || roles.has('kunde') : roles.has('carrier') || roles.has('unternehmer')
}

/**
 * Determines business roles from business facts, never from a requirement to
 * already have accounting numbers. Provisional TA-import carriers remain
 * carriers while their creditor number is deliberately still missing.
 */
export function businessPartnerRoles(partner = {}) {
  const references = partner?.dycosReferences || {}
  const explicit = explicitRoles(partner)
  const provisionalTransportCarrier = partner?.taImportStatus?.source === 'dycosTransportOrder'
    && Array.isArray(partner?.taImportStatus?.missingRequiredFields)
    && partner.taImportStatus.missingRequiredFields.includes('creditorNumber')
  return {
    customer: hasReference(partner?.debtorNumber) || (Array.isArray(references.debtorNumbers) && references.debtorNumbers.some(hasReference)) || hasExplicitRole(explicit, 'customer'),
    carrier: hasReference(partner?.creditorNumber) || (Array.isArray(references.creditorNumbers) && references.creditorNumbers.some(hasReference)) || provisionalTransportCarrier || hasExplicitRole(explicit, 'carrier'),
  }
}

export function businessPartnerRoleLabel(partner = {}) {
  const roles = businessPartnerRoles(partner)
  if (roles.customer && roles.carrier) return 'Kunde & Unternehmer'
  if (roles.customer) return 'Kunde'
  if (roles.carrier) return 'Unternehmer'
  return 'Keine fachliche Rolle hinterlegt'
}
