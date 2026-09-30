export const SHIPMENT_TRACKING_RULE_CATALOG_PATH = 'systemSettings/shipmentTrackingRuleCatalog'
export const SHIPMENT_TRACKING_RULE_CATALOG_VERSION = 1
export const SHIPMENT_TRACKING_TOPICS = Object.freeze(['licensePlate', 'loadingSite'])

const fixedIds = Object.freeze({
  licensePlate: { initial: 'licensePlate.external.initial', reminder1: 'licensePlate.external.reminder.1', reminder2: 'licensePlate.external.reminder.2', escalation1: 'licensePlate.internal.escalation.1', customerRequirement: 'licensePlate.customer.required.internal' },
  loadingSite: { initial: 'loadingSite.external.initial', reminder1: 'loadingSite.external.reminder.1', escalation1: 'loadingSite.internal.escalation.1', escalation2: 'loadingSite.internal.escalation.2', customerRequirement: 'loadingSite.customer.required.internal' },
})

const cloneRule = (rule) => ({ id: rule.id, offsetWorkingHours: rule.offsetWorkingHours })
const cloneTopic = (topic) => ({ initialRequest: cloneRule(topic.initialRequest), reminders: topic.reminders.map(cloneRule), internalEscalations: topic.internalEscalations.map(cloneRule), ...(topic.customerRequirement ? { customerRequirement: cloneRule(topic.customerRequirement) } : {}) })

export const DEFAULT_SHIPMENT_TRACKING_RULE_CATALOG = Object.freeze({
  version: SHIPMENT_TRACKING_RULE_CATALOG_VERSION,
  topics: Object.freeze({
    licensePlate: Object.freeze({ initialRequest: Object.freeze({ id: fixedIds.licensePlate.initial, offsetWorkingHours: 16 }), reminders: Object.freeze([Object.freeze({ id: fixedIds.licensePlate.reminder1, offsetWorkingHours: 8 }), Object.freeze({ id: fixedIds.licensePlate.reminder2, offsetWorkingHours: 4 })]), internalEscalations: Object.freeze([Object.freeze({ id: fixedIds.licensePlate.escalation1, offsetWorkingHours: 2 })]), customerRequirement: Object.freeze({ id: fixedIds.licensePlate.customerRequirement, offsetWorkingHours: 2 }) }),
    loadingSite: Object.freeze({ initialRequest: Object.freeze({ id: fixedIds.loadingSite.initial, offsetWorkingHours: 12 }), reminders: Object.freeze([Object.freeze({ id: fixedIds.loadingSite.reminder1, offsetWorkingHours: 4 })]), internalEscalations: Object.freeze([Object.freeze({ id: fixedIds.loadingSite.escalation1, offsetWorkingHours: 2 }), Object.freeze({ id: fixedIds.loadingSite.escalation2, offsetWorkingHours: 0 })]), customerRequirement: Object.freeze({ id: fixedIds.loadingSite.customerRequirement, offsetWorkingHours: 2 }) }),
  }),
  retiredRuleIds: Object.freeze([]),
})

export function fallbackShipmentTrackingRuleCatalog() {
  return { version: SHIPMENT_TRACKING_RULE_CATALOG_VERSION, topics: Object.fromEntries(SHIPMENT_TRACKING_TOPICS.map((topic) => [topic, cloneTopic(DEFAULT_SHIPMENT_TRACKING_RULE_CATALOG.topics[topic])])), retiredRuleIds: [] }
}

const ruleId = (value) => typeof value === 'string' && /^[a-z][a-zA-Z0-9._-]{2,160}$/.test(value)
export function shipmentTrackingWorkingMinutes(value) {
  const hours = Number(value)
  const minutes = Math.round(hours * 60)
  return Number.isFinite(hours) && hours >= 0 && Math.abs(hours * 60 - minutes) < 0.000001 ? minutes : null
}

export function formatShipmentTrackingWorkingDuration(value) {
  const totalMinutes = shipmentTrackingWorkingMinutes(value)
  if (totalMinutes === null) return '—'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours ? `${hours} Std.` : ''}${hours && minutes ? ' ' : ''}${minutes ? `${minutes} Min.` : ''}` || '0 Min.'
}
const topicLabel = (topic) => topic === 'licensePlate' ? 'Kennzeichen' : 'Ladestelle'

function assertRule(rule, { allowZero, label, requireId = true }) {
  if (!rule || typeof rule !== 'object') throw new Error(`${label} fehlt.`)
  if (requireId && !ruleId(rule.id)) throw new Error(`${label} hat keine gültige Regel-ID.`)
  const minutes = shipmentTrackingWorkingMinutes(rule.offsetWorkingHours)
  if (minutes === null || (!allowZero && minutes === 0)) throw new Error(`${label} benötigt eine ${allowZero ? 'nicht negative' : 'positive'} Zeitangabe in Stunden und Minuten.`)
}

function assertOrdered(topic, rules) {
  const ids = new Set()
  let previous = Infinity
  for (const { rule, label, allowZero } of rules) {
    assertRule(rule, { label, allowZero })
    if (ids.has(rule.id)) throw new Error(`${topicLabel(topic)} enthält dieselbe Regel-ID mehrfach.`)
    ids.add(rule.id)
    if (rule.offsetWorkingHours >= previous) throw new Error(`${topicLabel(topic)} muss in streng absteigender Reihenfolge konfiguriert sein.`)
    previous = rule.offsetWorkingHours
  }
}

export function validateShipmentTrackingRuleCatalog(value) {
  if (!value || typeof value !== 'object') throw new Error('Der Regelkatalog fehlt.')
  if (value.version !== SHIPMENT_TRACKING_RULE_CATALOG_VERSION) throw new Error('Die Version des Regelkatalogs ist ungültig.')
  if (!value.topics || typeof value.topics !== 'object') throw new Error('Die Regelbereiche fehlen.')
  const allIds = new Set()
  for (const topic of SHIPMENT_TRACKING_TOPICS) {
    const current = value.topics[topic]
    if (!current || typeof current !== 'object') throw new Error(`${topicLabel(topic)} fehlt.`)
    if (!Array.isArray(current.reminders) || current.reminders.length > 5) throw new Error(`${topicLabel(topic)} darf höchstens fünf Erinnerungen enthalten.`)
    if (!Array.isArray(current.internalEscalations) || current.internalEscalations.length < 1 || current.internalEscalations.length > 5) throw new Error(`${topicLabel(topic)} benötigt mindestens eine und höchstens fünf interne Eskalationen.`)
    const rules = [{ rule: current.initialRequest, label: `${topicLabel(topic)}: erste Anfrage`, allowZero: false }, ...current.reminders.map((rule, index) => ({ rule, label: `${topicLabel(topic)}: Erinnerung ${index + 1}`, allowZero: false })), ...current.internalEscalations.map((rule, index) => ({ rule, label: `${topicLabel(topic)}: interne Eskalation ${index + 1}`, allowZero: true }))]
    assertOrdered(topic, rules)
    if (current.customerRequirement) assertRule(current.customerRequirement, { label: `${topicLabel(topic)}: Kundenanforderung`, allowZero: true })
    rules.forEach(({ rule }) => {
      if (allIds.has(rule.id)) throw new Error('Regel-IDs müssen im gesamten Katalog eindeutig sein.')
      allIds.add(rule.id)
    })
    if (current.customerRequirement) {
      if (allIds.has(current.customerRequirement.id)) throw new Error('Regel-IDs müssen im gesamten Katalog eindeutig sein.')
      allIds.add(current.customerRequirement.id)
    }
  }
  if (!Array.isArray(value.retiredRuleIds) || value.retiredRuleIds.some((id) => !ruleId(id))) throw new Error('Die Liste entfernter Regel-IDs ist ungültig.')
  if (new Set(value.retiredRuleIds).size !== value.retiredRuleIds.length || value.retiredRuleIds.some((id) => allIds.has(id))) throw new Error('Aktive und entfernte Regel-IDs müssen eindeutig sein.')
  return { version: SHIPMENT_TRACKING_RULE_CATALOG_VERSION, topics: Object.fromEntries(SHIPMENT_TRACKING_TOPICS.map((topic) => [topic, cloneTopic(value.topics[topic])])), retiredRuleIds: [...value.retiredRuleIds] }
}

export function normalizeShipmentTrackingRuleCatalog(value) {
  try { return validateShipmentTrackingRuleCatalog(value) } catch { return fallbackShipmentTrackingRuleCatalog() }
}

function activeRules(catalog) {
  return SHIPMENT_TRACKING_TOPICS.flatMap((topic) => {
    const current = catalog.topics[topic]
    return [current.initialRequest, ...current.reminders, ...current.internalEscalations, current.customerRequirement].filter(Boolean).map((rule) => rule.id)
  })
}

function candidateRule(rule, idFactory, prefix) {
  if (rule?.id) return { id: rule.id, offsetWorkingHours: rule.offsetWorkingHours }
  return { id: `${prefix}.${idFactory()}`, offsetWorkingHours: rule?.offsetWorkingHours }
}

export function materializeShipmentTrackingRuleCatalog(input, previous = null, idFactory) {
  if (typeof idFactory !== 'function') throw new Error('Für neue Regelstufen fehlt eine sichere ID-Erzeugung.')
  const current = normalizeShipmentTrackingRuleCatalog(previous)
  const knownActiveIds = new Set(activeRules(current))
  const retiredIds = new Set(current.retiredRuleIds)
  const next = { version: SHIPMENT_TRACKING_RULE_CATALOG_VERSION, topics: {}, retiredRuleIds: [] }
  for (const topic of SHIPMENT_TRACKING_TOPICS) {
    const source = input?.topics?.[topic]
    if (!source || typeof source !== 'object') throw new Error(`${topicLabel(topic)} fehlt.`)
    const fixedInitial = current.topics[topic].initialRequest.id || fixedIds[topic].initial
    if (source.initialRequest?.id && source.initialRequest.id !== fixedInitial) throw new Error('Die erste Anfrage darf nicht ersetzt werden.')
    const fixedCustomerRequirement = current.topics[topic].customerRequirement?.id || fixedIds[topic].customerRequirement
    if (source.customerRequirement?.id && source.customerRequirement.id !== fixedCustomerRequirement) throw new Error('Die Kundenanforderung darf nicht ersetzt werden.')
    for (const rule of [...(source.reminders || []), ...(source.internalEscalations || [])]) if (rule?.id && !knownActiveIds.has(rule.id)) throw new Error('Neue Regel-IDs werden serverseitig vergeben.')
    const materializeList = (list, prefix) => (Array.isArray(list) ? list : []).map((rule) => candidateRule(rule, idFactory, prefix))
    const nextTopic = {
      initialRequest: { id: fixedInitial, offsetWorkingHours: source.initialRequest?.offsetWorkingHours },
      reminders: materializeList(source.reminders, `${topic}.external.reminder`),
      internalEscalations: materializeList(source.internalEscalations, `${topic}.internal.escalation`),
      customerRequirement: { id: fixedCustomerRequirement, offsetWorkingHours: source.customerRequirement?.offsetWorkingHours ?? current.topics[topic].customerRequirement?.offsetWorkingHours ?? DEFAULT_SHIPMENT_TRACKING_RULE_CATALOG.topics[topic].customerRequirement.offsetWorkingHours },
    }
    for (const rule of [nextTopic.initialRequest, ...nextTopic.reminders, ...nextTopic.internalEscalations, nextTopic.customerRequirement]) {
      if (retiredIds.has(rule.id)) throw new Error('Eine entfernte Regel-ID darf nicht wiederverwendet werden.')
    }
    next.topics[topic] = nextTopic
  }
  const nextActiveIds = new Set(activeRules({ ...next, retiredRuleIds: [] }))
  for (const id of knownActiveIds) if (!nextActiveIds.has(id)) retiredIds.add(id)
  next.retiredRuleIds = [...retiredIds].sort()
  return validateShipmentTrackingRuleCatalog(next)
}

export function shipmentTrackingCatalogRules(catalog) {
  const normalized = normalizeShipmentTrackingRuleCatalog(catalog)
  return SHIPMENT_TRACKING_TOPICS.flatMap((topic) => {
    const current = normalized.topics[topic]
    return [
      { ...current.initialRequest, topic, group: 'initialRequest', label: 'Erste Anfrage' },
      ...current.reminders.map((rule) => ({ ...rule, topic, group: 'reminder', label: 'Erinnerung' })),
      ...current.internalEscalations.map((rule) => ({ ...rule, topic, group: 'internalEscalation', label: 'BPL intern informieren' })),
      ...(current.customerRequirement ? [{ ...current.customerRequirement, topic, group: 'customerRequirement', label: 'Kunde wichtig: BPL intern informieren' }] : []),
    ]
  })
}
