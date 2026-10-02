export const shipmentTrackingArrivalConfirmationPath = 'systemSettings/shipmentTrackingArrivalConfirmation'
export const shipmentTrackingArrivalConfirmationTemplateId = 'shipment_tracking_actual_arrival_confirmation'
export const ARRIVAL_CONFIRMATION_RULE_ID = 'actualArrivalConfirmation.external'
export const DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION = Object.freeze({
  enabled: true,
  offsetWorkingHours: 2,
})

export function normalizeShipmentTrackingArrivalConfirmation(value) {
  const hours = Number(value?.offsetWorkingHours)
  return {
    enabled: value?.enabled !== false,
    offsetWorkingHours: Number.isInteger(hours) && hours >= 1 && hours <= 48 ? hours : DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION.offsetWorkingHours,
  }
}

export function validateShipmentTrackingArrivalConfirmation(value) {
  if (!value || typeof value !== 'object') throw new Error('Die Einstellungen fehlen.')
  if (typeof value.enabled !== 'boolean') throw new Error('Die Aktivierung muss angegeben werden.')
  if (!Number.isInteger(value.offsetWorkingHours) || value.offsetWorkingHours < 1 || value.offsetWorkingHours > 48) throw new Error('Der Zeitpunkt muss zwischen 1 und 48 Arbeitsstunden liegen.')
  return { enabled: value.enabled, offsetWorkingHours: value.offsetWorkingHours }
}
