import { newShipmentTrackingPartnerPolicy } from '../../shared/shipmentTrackingPartnerDefaults.js'
import { normalizeShipmentTrackingPolicy } from './shipmentTrackingPolicy.js'

/**
 * Applies central tracking defaults only while a partner is created. A policy
 * explicitly chosen in the form is retained unchanged.
 */
export function newBusinessPartnerShipmentTrackingPolicy(values = {}, ruleCatalog = null) {
  return values.shipmentTrackingPolicy === undefined
    ? newShipmentTrackingPartnerPolicy(values, ruleCatalog)
    : normalizeShipmentTrackingPolicy(values.shipmentTrackingPolicy)
}
