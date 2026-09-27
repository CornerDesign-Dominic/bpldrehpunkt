import { businessPartnerRoles } from './businessPartnerRoles.js'
import { normalizeShipmentTrackingRuleCatalog, shipmentTrackingCatalogRules } from './shipmentTrackingRuleCatalog.js'

/**
 * Returns defaults exclusively for a newly created partner. Existing partner
 * documents must never be passed through this function as a migration.
 */
export function newShipmentTrackingPartnerPolicy(partner = {}, catalog = null) {
  const roles = businessPartnerRoles(partner)
  const normalizedCatalog = normalizeShipmentTrackingRuleCatalog(catalog)
  const retiredRuleIds = new Set(normalizedCatalog.retiredRuleIds)
  const enabledRuleIds = roles.carrier
    ? Object.fromEntries(shipmentTrackingCatalogRules(normalizedCatalog)
      .filter((rule) => rule.group === 'internalEscalation' && !retiredRuleIds.has(rule.id))
      .map((rule) => [rule.id, true]))
    : {}
  return {
    customer: {
      licensePlateImportant: roles.customer,
      loadingSiteInformationImportant: roles.customer,
    },
    carrier: { enabledRuleIds },
  }
}
