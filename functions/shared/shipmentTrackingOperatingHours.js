export const SHIPMENT_TRACKING_TIMEZONE = 'Europe/Berlin'
export const WEEK_DAYS = [
  { key: 'monday', label: 'Montag' }, { key: 'tuesday', label: 'Dienstag' }, { key: 'wednesday', label: 'Mittwoch' },
  { key: 'thursday', label: 'Donnerstag' }, { key: 'friday', label: 'Freitag' }, { key: 'saturday', label: 'Samstag' }, { key: 'sunday', label: 'Sonntag' },
]

const defaultDay = (isOpen) => ({ isOpen, from: isOpen ? '07:00' : null, to: isOpen ? '17:00' : null })
export const DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS = Object.freeze({
  timezone: SHIPMENT_TRACKING_TIMEZONE,
  weekly: Object.freeze({ monday: defaultDay(true), tuesday: defaultDay(true), wednesday: defaultDay(true), thursday: defaultDay(true), friday: defaultDay(true), saturday: defaultDay(false), sunday: defaultDay(false) }),
  exceptions: Object.freeze({}),
})

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const weekdayKeys = WEEK_DAYS.map((day) => day.key)
const weekdayByUtcDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function cloneDay(value) { return { isOpen: value.isOpen, from: value.from, to: value.to } }
function validDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}
export function timeToMinutes(value) {
  if (typeof value !== 'string' || !timePattern.test(value)) return null
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}
export function minutesToTime(value) {
  const minutes = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)))
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
export function normalizeOperatingDay(value, fallback = defaultDay(false)) {
  const isOpen = value?.isOpen === true
  if (!isOpen) return { isOpen: false, from: null, to: null }
  const from = typeof value?.from === 'string' ? value.from : fallback.from
  const to = typeof value?.to === 'string' ? value.to : fallback.to
  return { isOpen: true, from, to }
}
export function normalizeShipmentTrackingOperatingHours(value) {
  const weekly = Object.fromEntries(WEEK_DAYS.map(({ key }) => [key, normalizeOperatingDay(value?.weekly?.[key], DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS.weekly[key])]))
  const exceptions = Object.fromEntries(Object.entries(value?.exceptions && typeof value.exceptions === 'object' ? value.exceptions : {})
    .filter(([date]) => validDate(date))
    .map(([date, exception]) => [date, { ...normalizeOperatingDay(exception), note: typeof exception?.note === 'string' ? exception.note.trim().slice(0, 240) : '' }]))
  return { timezone: SHIPMENT_TRACKING_TIMEZONE, weekly, exceptions }
}
export function validateShipmentTrackingOperatingHours(value) {
  if (value?.timezone && value.timezone !== SHIPMENT_TRACKING_TIMEZONE) throw new Error('Die Zeitzone muss Europe/Berlin sein.')
  if (!value?.weekly || typeof value.weekly !== 'object') throw new Error('Die wöchentlichen Betriebszeiten fehlen.')
  for (const key of weekdayKeys) {
    const day = value.weekly[key]
    if (!day || typeof day.isOpen !== 'boolean') throw new Error(`Die Einstellung für ${WEEK_DAYS.find((item) => item.key === key).label} ist unvollständig.`)
    if (!day.isOpen) continue
    const from = timeToMinutes(day.from)
    const to = timeToMinutes(day.to)
    if (from === null || to === null) throw new Error('Bei geöffneten Tagen sind Beginn und Ende erforderlich.')
    if (to <= from) throw new Error('Das Ende der Betriebszeit muss nach dem Beginn liegen.')
  }
  if (value?.exceptions !== undefined && (!value.exceptions || typeof value.exceptions !== 'object' || Array.isArray(value.exceptions))) throw new Error('Die Ausnahmen sind ungültig.')
  if (Object.keys(value?.exceptions || {}).length > 500) throw new Error('Es sind höchstens 500 Ausnahmen zulässig.')
  for (const [date, exception] of Object.entries(value?.exceptions || {})) {
    if (!validDate(date)) throw new Error('Eine Ausnahme enthält ein ungültiges Datum.')
    if (!exception || typeof exception.isOpen !== 'boolean') throw new Error('Eine Ausnahme ist unvollständig.')
    if (typeof exception.note !== 'undefined' && (typeof exception.note !== 'string' || exception.note.length > 240)) throw new Error('Eine Ausnahme-Notiz ist ungültig.')
    if (!exception.isOpen) continue
    const from = timeToMinutes(exception.from)
    const to = timeToMinutes(exception.to)
    if (from === null || to === null || to <= from) throw new Error('Eine geöffnete Ausnahme benötigt ein gültiges Zeitfenster.')
  }
  return normalizeShipmentTrackingOperatingHours(value)
}
export function weekdayForDate(date) {
  if (!validDate(date)) throw new Error('Ungültiges Datum.')
  return weekdayByUtcDay[new Date(`${date}T00:00:00Z`).getUTCDay()]
}
export function addCalendarDays(date, amount) {
  if (!validDate(date)) throw new Error('Ungültiges Datum.')
  const result = new Date(`${date}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + amount)
  return result.toISOString().slice(0, 10)
}
export function effectiveOperatingHours(settings, date) {
  const normalized = normalizeShipmentTrackingOperatingHours(settings)
  if (!validDate(date)) throw new Error('Ungültiges Datum.')
  const exception = normalized.exceptions[date]
  if (exception) return { ...cloneDay(exception), date, source: 'exception', note: exception.note || '' }
  return { ...cloneDay(normalized.weekly[weekdayForDate(date)]), date, source: 'weekly', note: '' }
}
export function isOpenAt(settings, localDateTime) {
  const rule = effectiveOperatingHours(settings, localDateTime?.date)
  const minute = timeToMinutes(localDateTime?.time)
  return Boolean(rule.isOpen && minute !== null && minute >= timeToMinutes(rule.from) && minute < timeToMinutes(rule.to))
}
function findPreviousOpenEnd(settings, date, reasons) {
  for (let offset = 0; offset <= 370; offset += 1) {
    const candidateDate = addCalendarDays(date, -offset)
    const rule = effectiveOperatingHours(settings, candidateDate)
    if (rule.isOpen) return { date: candidateDate, time: rule.to, rule }
    reasons.push(`${candidateDate}: geschlossen`)
  }
  throw new Error('Im betrachteten Zeitraum existiert keine Betriebszeit.')
}
export function lastAllowedOperatingTime(settings, reference) {
  if (!validDate(reference?.date) || timeToMinutes(reference?.time) === null) throw new Error('Referenzdatum oder Referenzuhrzeit ist ungültig.')
  const reasons = []
  const rule = effectiveOperatingHours(settings, reference.date)
  const minute = timeToMinutes(reference.time)
  if (rule.isOpen) {
    const from = timeToMinutes(rule.from)
    const to = timeToMinutes(rule.to)
    if (minute >= from && minute <= to) return { local: { date: reference.date, time: reference.time }, moved: false, reasons, rule }
    if (minute > to) {
      reasons.push(`${reference.date}: Betriebsschluss um ${rule.to}`)
      return { local: { date: reference.date, time: rule.to }, moved: true, reasons, rule }
    }
    reasons.push(`${reference.date}: Betriebsbeginn erst um ${rule.from}`)
  } else reasons.push(`${reference.date}: geschlossen${rule.source === 'exception' ? ' (Ausnahme)' : ''}`)
  const previous = findPreviousOpenEnd(settings, addCalendarDays(reference.date, -1), reasons)
  return { local: { date: previous.date, time: previous.time }, moved: true, reasons, rule: previous.rule }
}
export function subtractWorkingMinutes(settings, reference, minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error('Die Arbeitsstunden müssen eine gültige positive Zahl sein.')
  const start = lastAllowedOperatingTime(settings, reference)
  let date = start.local.date
  let minute = timeToMinutes(start.local.time)
  let remaining = Math.round(minutes)
  const reasons = [...start.reasons]
  for (let days = 0; days <= 370 && remaining > 0; days += 1) {
    const rule = effectiveOperatingHours(settings, date)
    if (!rule.isOpen) {
      reasons.push(`${date}: geschlossen${rule.source === 'exception' ? ' (Ausnahme)' : ''}`)
      date = addCalendarDays(date, -1)
      minute = 24 * 60
      continue
    }
    const from = timeToMinutes(rule.from)
    const to = timeToMinutes(rule.to)
    const availableUntil = Math.min(minute, to)
    const available = Math.max(0, availableUntil - from)
    if (remaining <= available) return { local: { date, time: minutesToTime(availableUntil - remaining) }, moved: start.moved || date !== reference.date, reasons, rule }
    remaining -= available
    reasons.push(`${date}: ${available} Arbeitsminuten genutzt`)
    date = addCalendarDays(date, -1)
    minute = 24 * 60
  }
  throw new Error('Im betrachteten Zeitraum existiert nicht genügend Betriebszeit.')
}
export function previewShipmentTrackingOperatingHours(settings, { referenceDate, referenceTime, workingHours, mode = 'subtract' }) {
  const reference = { date: referenceDate, time: referenceTime }
  const effective = effectiveOperatingHours(settings, referenceDate)
  const result = mode === 'latest'
    ? lastAllowedOperatingTime(settings, reference)
    : subtractWorkingMinutes(settings, reference, Number(workingHours) * 60)
  const usedRule = effective.source === 'exception'
    ? `Ausnahme am ${referenceDate}${effective.note ? ` (${effective.note})` : ''}`
    : `Standardzeit am ${referenceDate}`
  const explanation = result.moved
    ? `Der Zeitpunkt wurde wegen ${result.reasons.join('; ')} vorgezogen bzw. über geschlossene Zeiträume zurückgerechnet.`
    : 'Der Zeitpunkt liegt innerhalb der geltenden Betriebszeit.'
  return { timezone: SHIPMENT_TRACKING_TIMEZONE, reference, result: result.local, usedRule, effective, explanation, reasons: result.reasons }
}
