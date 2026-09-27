const customerDefaults = Object.freeze({ licensePlateImportant: false, loadingSiteInformationImportant: false })

export const DEFAULT_SHIPMENT_TRACKING_POLICY = Object.freeze({
  customer: customerDefaults,
  carrier: Object.freeze({ enabledRuleIds: Object.freeze({}) }),
})

const booleanMap = (value) => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).filter(([id, enabled]) => typeof id === 'string' && enabled === true))
const legacyRuleIds = Object.freeze({
  licensePlate: { request16WorkingHours: 'licensePlate.external.initial', remind8WorkingHours: 'licensePlate.external.reminder.1', remind4WorkingHours: 'licensePlate.external.reminder.2', informBpl2WorkingHours: 'licensePlate.internal.escalation.1' },
  loadingSite: { request12WorkingHours: 'loadingSite.external.initial', arrivalRequest4WorkingHours: 'loadingSite.external.reminder.1', informBpl2WorkingHours: 'loadingSite.internal.escalation.1', remindAtLoadingStart: 'loadingSite.internal.escalation.2' },
})

/** Normalisiert neue und historische Partner-Policies ohne Infrastrukturzugriff. */
export function normalizeShipmentTrackingPolicy(value) {
  const enabledRuleIds = booleanMap(value?.carrier?.enabledRuleIds)
  for (const [topic, fields] of Object.entries(legacyRuleIds)) for (const [field, id] of Object.entries(fields)) if (value?.carrier?.[topic]?.[field] === true && enabledRuleIds[id] === undefined) enabledRuleIds[id] = true
  return {
    customer: { licensePlateImportant: value?.customer?.licensePlateImportant === true, loadingSiteInformationImportant: value?.customer?.loadingSiteInformationImportant === true },
    carrier: { enabledRuleIds },
  }
}
