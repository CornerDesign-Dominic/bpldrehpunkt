import { normalizeShipmentTrackingPolicy, shipmentTrackingCarrierRules, shipmentTrackingPartnerRoles } from './shipmentTrackingPolicy.js'

export function shipmentTrackingPolicyCardState(partner, policy, canEdit, catalog) {
  const normalizedPolicy = normalizeShipmentTrackingPolicy(policy)
  return { roles: shipmentTrackingPartnerRoles(partner), policy: normalizedPolicy, carrierRules: shipmentTrackingCarrierRules(normalizedPolicy, catalog), editable: canEdit === true }
}
