import { subtractWorkingMinutes, normalizeShipmentTrackingOperatingHours, SHIPMENT_TRACKING_TIMEZONE } from './shipmentTrackingOperatingHours.js'
import { formatShipmentTrackingWorkingDuration, normalizeShipmentTrackingRuleCatalog, shipmentTrackingCatalogRules, validateShipmentTrackingRuleCatalog } from './shipmentTrackingRuleCatalog.js'
import { resolveShipmentTrackingPolicy } from './shipmentTrackingPolicyResolver.js'
import { ARRIVAL_CONFIRMATION_RULE_ID, normalizeShipmentTrackingArrivalConfirmation } from './shipmentTrackingArrivalConfirmation.js'

const topicLabels = Object.freeze({ licensePlate: 'Kennzeichen', loadingSite: 'Ladestelle' })
const weekdayLabels = Object.freeze(['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'])
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const berlinFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: SHIPMENT_TRACKING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function hasValue(value) { return Boolean(text(value)) }
function asDate(value) {
  if (value?.toDate) return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string' && value) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}
function localFromParts(year, month, day, hour, minute) {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) return null
  return { date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }
}

/** Converts an imported planned time or a real timestamp into a Berlin wall time. */
export function shipmentTrackingBerlinLocal(value) {
  if (typeof value === 'string') {
    const match = value.trim().match(localDateTimePattern)
    if (match) return localFromParts(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]))
  }
  const date = asDate(value)
  if (!date) return null
  const parts = Object.fromEntries(berlinFormatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return localFromParts(Number(parts.year), Number(parts.month), Number(parts.day), Number(parts.hour), Number(parts.minute))
}

/** Uses the Berlin offset of the given wall time. Business hours never use the DST switch hour. */
export function shipmentTrackingBerlinIso(local) {
  if (!local?.date || !local?.time) return null
  const match = `${local.date} ${local.time}`.match(localDateTimePattern)
  if (!match) return null
  const intendedUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
  const shown = shipmentTrackingBerlinLocal(new Date(intendedUtc))
  if (!shown) return null
  const [shownYear, shownMonth, shownDay] = shown.date.split('-').map(Number)
  const displayedUtc = Date.UTC(shownYear, shownMonth - 1, shownDay, Number(shown.time.slice(0, 2)), Number(shown.time.slice(3, 5)))
  return new Date(intendedUtc + intendedUtc - displayedUtc).toISOString()
}

function ruleTitle(group) {
  if (group === 'initialRequest') return 'Erste Anfrage an Unternehmer'
  if (group === 'reminder') return 'Erinnerung an Unternehmer'
  return 'Interne Eskalation'
}
function reasonFor(rule) { return rule.offsetWorkingHours === 0 ? 'Zum Beladebeginn' : `${formatShipmentTrackingWorkingDuration(rule.offsetWorkingHours)} vor frühester Beladung` }
function isTopicComplete(topic, tracking) {
  if (topic === 'licensePlate') return hasValue(tracking?.licensePlate) || hasValue(tracking?.tractorLicensePlate) || hasValue(tracking?.trailerLicensePlate)
  return Boolean(tracking?.actualArrivalLoadingAt || tracking?.loadingStartedAt || tracking?.loadingCompletedAt || tracking?.actualDepartureLoadingAt)
}
function externalRuleDispatch(tracking, ruleId) {
  const dispatch = tracking?.externalRuleDispatches?.[ruleId]
  return dispatch && typeof dispatch === 'object' && (dispatch.sentAt || dispatch.dispatchId) ? dispatch : null
}
function arrivalConfirmationDispatch(tracking) {
  const dispatch = tracking?.actualArrivalConfirmationDispatch
  return dispatch && typeof dispatch === 'object' && (dispatch.sentAt || dispatch.dispatchId) ? dispatch : null
}
function pausedAutomation(tracking, scheduledAt, now) {
  const scheduled = asDate(scheduledAt)
  if (!scheduled) return null
  const pausedAt = asDate(tracking?.automationPausedAt)
  const skippedBefore = asDate(tracking?.automationSkippedBefore)
  const importSkippedBefore = asDate(tracking?.importScheduleSkippedBefore)
  if (tracking?.automationPaused === true && scheduled.getTime() <= now.getTime()) return { from: pausedAt, until: null, active: true }
  if (importSkippedBefore && scheduled.getTime() <= importSkippedBefore.getTime()) return { from: importSkippedBefore, until: importSkippedBefore, active: false, reason: 'import-date-change' }
  if (skippedBefore && scheduled.getTime() <= skippedBefore.getTime()) {
    const lastPause = tracking?.lastAutomationPause
    return { from: asDate(lastPause?.from), until: asDate(lastPause?.until) || skippedBefore, active: false, reason: 'automation-paused' }
  }
  return null
}
function carrierRecipient(tracking) {
  const email = text(tracking?.recipients?.carrier?.email)
  // The recipient is captured when tracking starts from the TA dispatch address
  // or is later manually corrected in this tracking document.
  return ['manual', 'transport-order-import'].includes(tracking?.recipients?.carrier?.source) && emailPattern.test(email)
    ? { role: 'carrier', email, state: 'configured' }
    : { role: 'carrier', email: null, state: 'missing' }
}
function internalRecipient() { return { role: 'internal', email: null, state: 'notApplicable' } }
function dayLabel(date) { return weekdayLabels[new Date(`${date}T00:00:00Z`).getUTCDay()] }
function adjustmentReason(result) {
  if (!result?.moved) return null
  const closed = [...new Set((result.reasons || []).filter((reason) => reason.includes(': geschlossen')).map((reason) => reason.slice(0, 10)))].sort()
  if (closed.length) {
    const labels = closed.map(dayLabel)
    return `Vorverlegt, da ${labels.join(' und ')} ${labels.length === 1 ? 'geschlossen ist' : 'geschlossen sind'}.`
  }
  return 'Vorverlegt auf die letzte zulässige BPL-Betriebszeit.'
}
function elapsedText(minutes) {
  const rounded = Math.max(0, Math.round(minutes))
  const hours = Math.floor(rounded / 60)
  const remainder = rounded % 60
  return `${hours ? `${hours} Std.` : ''}${hours && remainder ? ' ' : ''}${remainder ? `${remainder} Min.` : ''}` || '0 Min.'
}
function diagnosticsFor(policyDiagnostics) {
  return policyDiagnostics.map((entry) => ({ code: entry.code, topic: entry.topic, message: entry.message }))
}
function catalogAvailability(catalog) {
  if (!catalog || typeof catalog !== 'object') return 'missing'
  try { validateShipmentTrackingRuleCatalog(catalog); return 'available' } catch { return 'invalid' }
}

/** The near-loading confirmation intentionally has no connection to the
 * editable rule catalogue. It nevertheless uses the same recipient,
 * pause/import-shift and sent-state semantics as every carrier rule. */
export function shipmentTrackingArrivalConfirmationRule({ imported = null, tracking = null, carrier = null, settings = null, operatingHours = null, now = new Date() } = {}) {
  const configured = normalizeShipmentTrackingArrivalConfirmation(settings)
  if (!configured.enabled || carrier?.shipmentTrackingPolicy?.carrier?.actualArrivalConfirmationEnabled !== true) return null
  const reference = shipmentTrackingBerlinLocal(imported?.loading?.window?.from)
  const clock = asDate(now) || new Date()
  let scheduledAt = null
  let adjustment = null
  if (reference) {
    try {
      const result = subtractWorkingMinutes(normalizeShipmentTrackingOperatingHours(operatingHours), reference, configured.offsetWorkingHours * 60)
      scheduledAt = shipmentTrackingBerlinIso(result.local)
      adjustment = adjustmentReason(result)
    } catch { /* The read-only preview exposes the unavailable timestamp. */ }
  }
  const dispatch = arrivalConfirmationDispatch(tracking)
  const pause = pausedAutomation(tracking, scheduledAt, clock)
  const completed = Boolean(tracking?.actualArrivalLoadingAt)
  const status = completed ? 'notRequired' : dispatch ? 'sent' : pause ? 'skipped' : scheduledAt && new Date(scheduledAt).getTime() <= clock.getTime() ? 'due' : 'upcoming'
  const delayMs = scheduledAt ? clock.getTime() - new Date(scheduledAt).getTime() : null
  return {
    ruleId: ARRIVAL_CONFIRMATION_RULE_ID, topic: 'loadingSite', kind: 'external', title: 'Aktuellen Stand anfragen',
    reason: `${configured.offsetWorkingHours} Arbeitsstunden vor frühester Beladung`, source: 'arrival-confirmation',
    recipient: carrierRecipient(tracking), scheduledAt, status, adjustmentReason: adjustment, arrivalConfirmation: true,
    withinDispatchWindow: status === 'due' && delayMs >= 0 && delayMs <= 10 * 60 * 1000,
    ...(pause ? { pause } : {}), ...(dispatch ? { dispatch } : {}),
  }
}

/**
 * Pure, read-only shipment-tracking preview. I/O, access checks and rendering
 * intentionally live outside this helper.
 */
export function shipmentTrackingDryRun({ imported = null, tracking = null, customer = null, carrier = null, catalog = null, operatingHours = null, arrivalConfirmationSettings = null, now = new Date() } = {}) {
  const catalogState = catalogAvailability(catalog)
  const resolvedCatalog = normalizeShipmentTrackingRuleCatalog(catalog)
  const resolvedHours = normalizeShipmentTrackingOperatingHours(operatingHours)
  const customerLinked = Boolean(imported?.customer?.partnerId)
  const carrierLinked = Boolean(imported?.carrier?.partnerId)
  // Policies are only meaningful for the partner actually linked to this
  // order. Never apply an object supplied without an order-side assignment.
  const policy = resolveShipmentTrackingPolicy({ customer: customerLinked ? customer : null, carrier: carrierLinked ? carrier : null, catalog: resolvedCatalog })
  const reference = shipmentTrackingBerlinLocal(imported?.loading?.window?.from)
  const clock = asDate(now) || new Date()
  const diagnostics = diagnosticsFor(policy.diagnostics)
  if (catalogState === 'missing') diagnostics.push({ code: 'missing-rule-catalog', topic: null, message: 'Der globale Regelkatalog fehlt. Wirksame Regelstufen können nicht bestimmt werden.' })
  if (catalogState === 'invalid') diagnostics.push({ code: 'invalid-rule-catalog', topic: null, message: 'Der globale Regelkatalog ist ungültig. Wirksame Regelstufen können nicht bestimmt werden.' })
  if (!customerLinked) diagnostics.push({ code: 'missing-customer-link', topic: null, message: 'Dem Auftrag ist kein Kunde zugeordnet.' })
  if (!carrierLinked) diagnostics.push({ code: 'missing-carrier-link', topic: null, message: 'Dem Auftrag ist kein Unternehmer zugeordnet.' })
  if (!customer && imported?.customer?.partnerId) diagnostics.push({ code: 'missing-customer-partner', topic: null, message: 'Der zugeordnete Kunde konnte nicht geladen werden.' })
  if (!carrier && imported?.carrier?.partnerId) diagnostics.push({ code: 'missing-carrier-partner', topic: null, message: 'Der zugeordnete Unternehmer konnte nicht geladen werden.' })
  if (!reference) diagnostics.push({ code: 'missing-loading-time', topic: null, message: 'Die früheste geplante Beladungszeit fehlt. Fälligkeiten können nicht berechnet werden.' })

  const catalogRules = new Map(shipmentTrackingCatalogRules(resolvedCatalog).map((rule) => [rule.id, rule]))
  const rules = []
  for (const [topic, resolution] of Object.entries(policy.topics)) {
    for (const effective of catalogState === 'available' ? resolution.rules : []) {
      const rule = catalogRules.get(effective.id)
      if (!rule) continue
      const kind = rule.group === 'internalEscalation' || rule.group === 'customerRequirement' ? 'internal' : 'external'
      const recipient = kind === 'internal' ? internalRecipient() : carrierRecipient(tracking)
      const completed = isTopicComplete(topic, tracking)
      let scheduledAt = null
      let adjustment = null
      if (reference) {
        try {
          const result = subtractWorkingMinutes(resolvedHours, reference, rule.offsetWorkingHours * 60)
          scheduledAt = shipmentTrackingBerlinIso(result.local)
          adjustment = adjustmentReason(result)
        } catch {
          diagnostics.push({ code: `schedule-unavailable-${rule.id}`, topic, message: `Die Fälligkeit für ${topicLabels[topic]} konnte mit den aktuellen Betriebszeiten nicht berechnet werden.` })
        }
      }
      const dispatch = kind === 'external' ? externalRuleDispatch(tracking, rule.id) : null
      const pause = pausedAutomation(tracking, scheduledAt, clock)
      const status = completed ? 'notRequired' : dispatch ? 'sent' : pause ? 'skipped' : scheduledAt && new Date(scheduledAt).getTime() <= clock.getTime() ? 'due' : 'upcoming'
      rules.push({ ruleId: rule.id, topic, kind, scheduledAt, status, recipient, title: ruleTitle(rule.group), reason: reasonFor(rule), adjustmentReason: adjustment, source: effective.source, ...(pause ? { pause } : {}), ...(dispatch ? { dispatch } : {}) })
    }
  }
  if (carrierLinked) {
    const arrivalConfirmation = shipmentTrackingArrivalConfirmationRule({ imported, tracking, carrier, settings: arrivalConfirmationSettings, operatingHours: resolvedHours, now: clock })
    if (arrivalConfirmation) rules.push(arrivalConfirmation)
  }
  rules.sort((left, right) => (left.scheduledAt || '9999').localeCompare(right.scheduledAt || '9999') || left.ruleId.localeCompare(right.ruleId))
  const relevant = rules.filter((rule) => rule.status !== 'notRequired' && rule.status !== 'sent' && rule.status !== 'skipped')
  if (!rules.length && catalogState === 'available' && !diagnostics.length) diagnostics.push({ code: 'no-active-rules', topic: null, message: 'In den aktuellen Partnerregeln ist keine aktive Regelstufe vorhanden.' })
  const hints = [
    ...diagnostics.map((diagnostic) => ({ id: diagnostic.code + (diagnostic.topic || ''), status: 'pending', description: diagnostic.message })),
    ...relevant.filter((rule) => rule.kind === 'external' && rule.recipient.state === 'missing').map((rule) => ({ id: `${rule.ruleId}-recipient`, status: 'pending', description: `Unternehmer-Empfänger fehlt (${topicLabels[rule.topic]}).` })),
    ...relevant.filter((rule) => rule.status === 'due' && rule.scheduledAt).map((rule) => ({ id: `${rule.ruleId}-due`, status: 'overdue', description: `${topicLabels[rule.topic]}regel seit ${elapsedText((clock.getTime() - new Date(rule.scheduledAt).getTime()) / 60000)} fällig.` })),
  ]
  const nextAction = relevant.filter((rule) => rule.scheduledAt).sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))[0] || null
  return { timezone: SHIPMENT_TRACKING_TIMEZONE, reference, rules, diagnostics, hints, nextAction, policy }
}
