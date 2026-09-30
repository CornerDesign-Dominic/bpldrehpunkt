import { addCalendarDays, effectiveOperatingHours, normalizeShipmentTrackingOperatingHours, SHIPMENT_TRACKING_TIMEZONE } from './shipmentTrackingOperatingHours.js'

export const shipmentTrackingLifecyclePhases = Object.freeze(['upcoming', 'in_progress', 'completed'])

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

function nearestOpenBusinessDay(settings, date, direction) {
  const normalized = normalizeShipmentTrackingOperatingHours(settings)
  let candidate = date
  for (let offset = 1; offset <= 370; offset += 1) {
    candidate = addCalendarDays(candidate, direction)
    if (effectiveOperatingHours(normalized, candidate).isOpen) return candidate
  }
  return null
}

/** Start on the preceding open BPL day at the fixed time of 07:00. */
export function shipmentTrackingStartAt(settings, earliestLoading) {
  const earliest = shipmentTrackingBerlinLocal(earliestLoading)
  const date = earliest && nearestOpenBusinessDay(settings, earliest.date, -1)
  return date ? { date, time: '07:00' } : null
}

/** Finish on the next open BPL day after unloading at the fixed time of 07:00. */
export function shipmentTrackingCompletionAt(settings, latestUnloading) {
  const latest = shipmentTrackingBerlinLocal(latestUnloading)
  const date = latest && nearestOpenBusinessDay(settings, latest.date, 1)
  return date ? { date, time: '07:00' } : null
}

/** Pure lifecycle evaluation. Planned loading/unloading times are never changed. */
export function shipmentTrackingLifecycle({ earliestLoading, latestUnloading, operatingHours, now = new Date() } = {}) {
  const clock = shipmentTrackingBerlinLocal(now)
  const earliest = shipmentTrackingBerlinLocal(earliestLoading)
  if (!clock || !earliest) return { phase: 'upcoming', startAt: null, completionAt: null, diagnostic: 'missing-earliest-loading' }
  const startAt = shipmentTrackingStartAt(operatingHours, earliest)
  if (!startAt) return { phase: 'upcoming', startAt: null, completionAt: null, diagnostic: 'start-window-unavailable' }
  if (compareLocal(clock, startAt) < 0) return { phase: 'upcoming', startAt, completionAt: null, diagnostic: null }
  const latest = shipmentTrackingBerlinLocal(latestUnloading)
  if (!latest) return { phase: 'in_progress', startAt, completionAt: null, diagnostic: 'missing-latest-unloading' }
  const completionAt = shipmentTrackingCompletionAt(operatingHours, latest)
  if (!completionAt) return { phase: 'in_progress', startAt, completionAt: null, diagnostic: 'completion-window-unavailable' }
  return { phase: compareLocal(clock, completionAt) < 0 ? 'in_progress' : 'completed', startAt, completionAt, diagnostic: null }
}

export function isActiveShipmentTrackingPhase(phase) { return phase === 'in_progress' }
