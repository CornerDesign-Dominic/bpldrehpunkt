import { fallbackShipmentTrackingRuleCatalog, SHIPMENT_TRACKING_TOPICS } from './shipmentTrackingRuleCatalog.js'
import { normalizeShipmentTrackingPolicy } from './shipmentTrackingPolicy.js'
import { businessPartnerRoles } from './businessPartnerRoles.js'

const customerImportanceField = Object.freeze({ licensePlate: 'licensePlateImportant', loadingSite: 'loadingSiteInformationImportant' })

function partnerPolicy(partner) {
  return normalizeShipmentTrackingPolicy(partner?.shipmentTrackingPolicy)
}

function activeTopicRules(catalog, topic) {
  const current = (catalog || fallbackShipmentTrackingRuleCatalog()).topics?.[topic]
  const retired = new Set(Array.isArray(catalog?.retiredRuleIds) ? catalog.retiredRuleIds : [])
  const candidates = [
    { ...current?.initialRequest, group: 'initialRequest' },
    ...(Array.isArray(current?.reminders) ? current.reminders.map((rule) => ({ ...rule, group: 'reminder' })) : []),
    ...(Array.isArray(current?.internalEscalations) ? current.internalEscalations.map((rule) => ({ ...rule, group: 'internalEscalation' })) : []),
    ...(current?.customerRequirement ? [{ ...current.customerRequirement, group: 'customerRequirement' }] : []),
  ]
  const seen = new Set()
  return candidates.filter((rule) => typeof rule?.id === 'string' && rule.id && Number.isInteger(rule.offsetWorkingHours) && rule.offsetWorkingHours >= 0 && !retired.has(rule.id) && !seen.has(rule.id) && (seen.add(rule.id) || true))
}

function topicResolution(topic, customerPolicy, carrierPolicy, catalog, activeCarrierRuleIds) {
  const activeRules = activeTopicRules(catalog, topic)
  const customerImportant = customerPolicy.customer[customerImportanceField[topic]] === true
  const carrierEnabled = carrierPolicy.carrier.enabledRuleIds
  const carrierRules = activeRules.filter((rule) => rule.group !== 'customerRequirement')
  const carrierIds = new Set(carrierRules.filter((rule) => carrierEnabled[rule.id] === true).map((rule) => rule.id))
  const customerRequirement = activeRules.find((rule) => rule.group === 'customerRequirement')
  const diagnostics = []
  const forcedIds = []

  for (const id of Object.keys(carrierEnabled).filter((id) => carrierEnabled[id] === true && !activeCarrierRuleIds.has(id))) {
    diagnostics.push({ code: 'inactive-carrier-rule', topic, message: `Die aktivierte Regel ${id} ist im aktuellen Regelkatalog nicht verfügbar.` })
  }

  if (customerImportant) {
    if (!customerRequirement) diagnostics.push({ code: 'missing-customer-requirement', topic, message: `Für ${topic} ist keine Kundenanforderungs-Stufe im Regelkatalog vorhanden.` })
    else forcedIds.push(customerRequirement.id)
  }

  const forced = new Set(forcedIds)
  const rules = activeRules.filter((rule) => carrierIds.has(rule.id) || forced.has(rule.id)).map((rule) => ({ id: rule.id, source: carrierIds.has(rule.id) ? 'carrier' : 'customer-required' }))
  return { enabledRuleIds: rules.map((rule) => rule.id), rules, customerImportant, forcedRuleIds: forcedIds, diagnostics }
}

/**
 * Löst die effektive, auftragsbezogene Tracking-Policy ohne I/O auf.
 * customer und carrier werden bewusst getrennt normalisiert, auch wenn sie
 * auf denselben Partner zeigen.
 */
export function resolveShipmentTrackingPolicy({ customer = null, carrier = null, catalog = null } = {}) {
  const customerPolicy = partnerPolicy(customer)
  const carrierPolicy = partnerPolicy(carrier)
  const activeCarrierRuleIds = new Set(SHIPMENT_TRACKING_TOPICS.flatMap((topic) => activeTopicRules(catalog, topic).filter((rule) => rule.group !== 'customerRequirement').map((rule) => rule.id)))
  const topics = Object.fromEntries(SHIPMENT_TRACKING_TOPICS.map((topic) => [topic, topicResolution(topic, customerPolicy, carrierPolicy, catalog, activeCarrierRuleIds)]))
  return { topics, diagnostics: SHIPMENT_TRACKING_TOPICS.flatMap((topic) => topics[topic].diagnostics), partnerRoles: { customer: businessPartnerRoles(customer), carrier: businessPartnerRoles(carrier) } }
}
