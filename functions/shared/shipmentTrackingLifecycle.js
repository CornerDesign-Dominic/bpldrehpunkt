import { addCalendarDays, effectiveOperatingHours, normalizeShipmentTrackingOperatingHours, SHIPMENT_TRACKING_TIMEZONE } from './shipmentTrackingOperatingHours.js'

export const shipmentTrackingLifecyclePhases = Object.freeze(['upcoming', 'preparation', 'in_progress', 'aftercare', 'completed'])

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/
const berlinFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: SHIPMENT_TRACKING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function localFromParts(year, month, day, hour, minute) {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) return null
  return { date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }
}

export function shipmentTrackingBerlinLocal(value) {
  if (value && typeof value === 'object' && typeof value.date === 'string' && typeof value.time === 'string') {
    const match = `${value.date} ${value.time}`.match(localDateTimePattern)
    return match ? localFromParts(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])) : null
  }
  if (typeof value === 'string') {
    const match = value.trim().match(localDateTimePattern)
    if (match) return localFromParts(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]))
    const instant = new Date(value)
    if (!Number.isNaN(instant.getTime())) value = instant
  }
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null
  if (!date || Number.isNaN(date.getTime())) return null
  const parts = Object.fromEntries(berlinFormatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return localFromParts(Number(parts.year), Number(parts.month), Number(parts.day), Number(parts.hour), Number(parts.minute))
}

function compareLocal(left, right) { return `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`) }

/** The start of the second preceding open BPL day. */
export function preparationStart(settings, earliestLoading) {
  const earliest = shipmentTrackingBerlinLocal(earliestLoading)
  if (!earliest) return null
  const normalized = normalizeShipmentTrackingOperatingHours(settings)
  let candidate = earliest.date
  let counted = 0
  for (let offset = 1; offset <= 370; offset += 1) {
    candidate = addCalendarDays(candidate, -1)
    const day = effectiveOperatingHours(normalized, candidate)
    if (!day.isOpen) continue
    counted += 1
    if (counted === 2) return { date: candidate, time: day.from }
  }
  return null
}

/** The end of the second following open BPL day after the unloading deadline. */
export function aftercareCompletionAt(settings, latestUnloading) {
  const latest = shipmentTrackingBerlinLocal(latestUnloading)
  if (!latest) return null
  const normalized = normalizeShipmentTrackingOperatingHours(settings)
  let candidate = latest.date
  let counted = 0
  for (let offset = 1; offset <= 370; offset += 1) {
    candidate = addCalendarDays(candidate, 1)
    const day = effectiveOperatingHours(normalized, candidate)
    if (!day.isOpen) continue
    counted += 1
    if (counted === 2) return { date: candidate, time: day.to }
  }
  return null
}

/** Pure lifecycle evaluation. Planned loading/unloading times are never changed. */
export function shipmentTrackingLifecycle({ earliestLoading, latestUnloading, operatingHours, now = new Date() } = {}) {
  const clock = shipmentTrackingBerlinLocal(now)
  const earliest = shipmentTrackingBerlinLocal(earliestLoading)
  if (!clock || !earliest) return { phase: 'upcoming', preparationAt: null, completionAt: null, diagnostic: 'missing-earliest-loading' }
  const preparationAt = preparationStart(operatingHours, earliest)
  if (!preparationAt) return { phase: 'upcoming', preparationAt: null, completionAt: null, diagnostic: 'preparation-window-unavailable' }
  if (compareLocal(clock, preparationAt) < 0) return { phase: 'upcoming', preparationAt, completionAt: null, diagnostic: null }
  if (compareLocal(clock, earliest) < 0) return { phase: 'preparation', preparationAt, completionAt: null, diagnostic: null }
  const latest = shipmentTrackingBerlinLocal(latestUnloading)
  if (!latest || compareLocal(clock, latest) < 0) return { phase: 'in_progress', preparationAt, completionAt: null, diagnostic: latest ? null : 'missing-latest-unloading' }
  const completionAt = aftercareCompletionAt(operatingHours, latest)
  if (!completionAt) return { phase: 'aftercare', preparationAt, completionAt: null, diagnostic: 'aftercare-window-unavailable' }
  return { phase: compareLocal(clock, completionAt) < 0 ? 'aftercare' : 'completed', preparationAt, completionAt, diagnostic: null }
}

export function isActiveShipmentTrackingPhase(phase) { return ['preparation', 'in_progress', 'aftercare'].includes(phase) }
