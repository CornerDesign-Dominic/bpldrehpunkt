const TEMPLATE_IDS = Object.freeze({
  licensePlate: 'shipment_tracking_license_plate_request',
  loadingSite: 'shipment_tracking_arrival_request',
  combined: 'shipment_tracking_license_plate_and_arrival_request',
  generalUpdate: 'shipment_tracking_general_status_update',
  loadingEta: 'shipment_tracking_loading_eta_request',
  loadingArrival: 'shipment_tracking_loading_arrival_request',
  loadingDeparture: 'shipment_tracking_loading_departure_request',
  unloadingEta: 'shipment_tracking_unloading_eta_request',
  unloadingArrival: 'shipment_tracking_unloading_arrival_request',
  loadingUpdate: 'shipment_tracking_loading_update_request',
  unloadingUpdate: 'shipment_tracking_unloading_update_request',
})

const templateLabels = Object.freeze({
  [TEMPLATE_IDS.licensePlate]: 'Kennzeichen anfragen',
  [TEMPLATE_IDS.loadingSite]: 'LKW-Ankunft anfragen',
  [TEMPLATE_IDS.combined]: 'Kennzeichen und LKW-Ankunft anfragen',
  [TEMPLATE_IDS.generalUpdate]: 'Allgemeines Status-Update anfragen',
  [TEMPLATE_IDS.loadingEta]: 'ETA Ladestelle anfragen',
  [TEMPLATE_IDS.loadingArrival]: 'LS Ankunft anfragen',
  [TEMPLATE_IDS.loadingDeparture]: 'LS Abfahrt anfragen',
  [TEMPLATE_IDS.unloadingEta]: 'ETA Entladestelle anfragen',
  [TEMPLATE_IDS.unloadingArrival]: 'Tatsächliche Ankunft Entladestelle anfragen',
  [TEMPLATE_IDS.loadingUpdate]: 'Update zur Beladung anfragen',
  [TEMPLATE_IDS.unloadingUpdate]: 'Update zur Entladung anfragen',
})

const topicLabels = Object.freeze({ licensePlate: 'Kennzeichen', loadingSite: 'LKW-Ankunft' })

function text(value) { return typeof value === 'string' ? value.trim() : '' }

function templateIdFor(topics) {
  if (topics.includes('licensePlate') && topics.includes('loadingSite')) return TEMPLATE_IDS.combined
  if (topics.includes('licensePlate')) return TEMPLATE_IDS.licensePlate
  return TEMPLATE_IDS.loadingSite
}

function bundleId({ recipient, scheduledAt, templateId, ruleIds }) {
  return [recipient, scheduledAt, templateId, ...ruleIds].join('|')
}

/**
 * Groups only currently due, unfinished external carrier rules. A bundle is
 * deliberately valid only for one order preview, one configured recipient and
 * one exact calculated due time. The callable recalculates this result before
 * it sends, so the opaque id cannot be used to select arbitrary rules.
 */
export function shipmentTrackingManualDispatchBundles(preview) {
  const groups = new Map()
  for (const rule of Array.isArray(preview?.rules) ? preview.rules : []) {
    const recipient = text(rule?.recipient?.email)
    const scheduledAt = text(rule?.scheduledAt)
    if (rule?.arrivalConfirmation === true || rule?.status !== 'due' || rule?.kind !== 'external' || rule?.recipient?.state !== 'configured' || !recipient || !scheduledAt) continue
    const key = `${recipient}\u0000${scheduledAt}`
    const group = groups.get(key) || { recipient, scheduledAt, rules: [] }
    group.rules.push(rule)
    groups.set(key, group)
  }

  return [...groups.values()].map((group) => {
    const ruleIds = [...new Set(group.rules.map((rule) => text(rule.ruleId)).filter(Boolean))].sort()
    const topics = [...new Set(group.rules.map((rule) => rule.topic).filter((topic) => Object.hasOwn(topicLabels, topic)))].sort()
    const templateId = templateIdFor(topics)
    return {
      id: bundleId({ recipient: group.recipient, scheduledAt: group.scheduledAt, templateId, ruleIds }),
      recipient: group.recipient,
      scheduledAt: group.scheduledAt,
      ruleIds,
      topics,
      topicLabels: topics.map((topic) => topicLabels[topic]),
      templateId,
      templateLabel: templateLabels[templateId],
    }
  }).filter((bundle) => bundle.ruleIds.length && bundle.topics.length).sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt) || left.recipient.localeCompare(right.recipient) || left.id.localeCompare(right.id))
}

export { TEMPLATE_IDS as shipmentTrackingManualDispatchTemplateIds }
