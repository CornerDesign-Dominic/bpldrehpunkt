import { normalizeShipmentTrackingRuleCatalog, shipmentTrackingCatalogRules } from '../../shared/shipmentTrackingRuleCatalog.js'
import { DEFAULT_SHIPMENT_TRACKING_POLICY, normalizeShipmentTrackingPolicy } from '../../shared/shipmentTrackingPolicy.js'
import { businessPartnerRoles } from '../../shared/businessPartnerRoles.js'

export { DEFAULT_SHIPMENT_TRACKING_POLICY, normalizeShipmentTrackingPolicy }

export function shipmentTrackingPartnerRoles(partner = {}) {
  return businessPartnerRoles(partner)
}

export function shipmentTrackingCarrierRules(policy, catalog) {
  const normalizedPolicy = normalizeShipmentTrackingPolicy(policy)
  return shipmentTrackingCatalogRules(normalizeShipmentTrackingRuleCatalog(catalog)).filter((rule) => rule.group !== 'customerRequirement').map((rule) => ({ ...rule, enabled: normalizedPolicy.carrier.enabledRuleIds[rule.id] === true }))
}
