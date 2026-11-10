// Shared, deterministic time arithmetic. Calendar days are always Berlin days;
// durations are elapsed instants (including daylight-saving transitions).
export const TIME_EVENT_TYPES = ['come', 'pause_start', 'pause_end', 'go']
export const TIME_CORRECTION_REASONS = ['forgot_stamp', 'forgot_break', 'wrong_booking', 'other']
export function validTimeDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && value >= '2000-01-01' && value <= '2199-12-31'
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function berlinTimeDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const get = (type) => parts.find((part) => part.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function addTimeDays(value, count) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}
export function timeDateRange(from, to) {
  if (!validTimeDate(from) || !validTimeDate(to) || from > to) throw new Error('Ungültiger Zeitraum.')
  const dates = []
  for (let date = from; date <= to; date = addTimeDays(date, 1)) {
    if (dates.length >= 36600) throw new Error('Zeitraum ist zu groß.')
    dates.push(date)
  }
  return dates
}
export function canCorrectOwnTime(date, now = new Date()) {
  const today = berlinTimeDate(now)
  return validTimeDate(date) && date >= addTimeDays(today, -7) && date <= today
}
export function progressiveTimeBreak(workedMinutes, bookedMinutes, rules = []) {
  let previousRequired = 0
  let deduction = 0
  for (const rule of [...rules].sort((a, b) => a.afterMinutes - b.afterMinutes)) {
    if (workedMinutes <= rule.afterMinutes) break
    const missingPrevious = Math.max(0, previousRequired - bookedMinutes)
    const missingIncrement = Math.max(0, rule.requiredMinutes - Math.max(previousRequired, bookedMinutes))
    deduction = Math.max(deduction, missingPrevious + Math.min(missingIncrement, workedMinutes - rule.afterMinutes))
    previousRequired = rule.requiredMinutes
  }
  return Math.min(workedMinutes, Math.max(0, deduction))
}
export function timeModelForDate(models, date) {
  return models.find((model) => model.validFrom <= date && (!model.validTo || model.validTo >= date)) || null
}
export function timeModelsOverlap(left, right) {
  return left.validFrom <= (right.validTo || '2199-12-31') && right.validFrom <= (left.validTo || '2199-12-31')
}
export function normalizeTimeEvents(events, date, now = new Date()) {
  if (!validTimeDate(date) || !Array.isArray(events) || events.length > 100) throw new Error('Ungültige Zeitbuchungen.')
  const ids = new Set()
  return events.map((event) => {
    if (!event || !TIME_EVENT_TYPES.includes(event.type) || typeof event.id !== 'string' || !/^[\w-]{1,128}$/.test(event.id) || ids.has(event.id)) throw new Error('Ungültige oder doppelte Buchung.')
    ids.add(event.id)
    if (typeof event.at !== 'string' || !validTimeDate(event.at.slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(event.at) || !Number.isFinite(Date.parse(event.at))) throw new Error('Ungültiger Buchungszeitpunkt.')
    const at = new Date(event.at)
    if (berlinTimeDate(at) !== date || at.getTime() > new Date(now).getTime() + 60_000) throw new Error('Buchung liegt am falschen Tag oder in der Zukunft.')
    return { id: event.id, type: event.type, at: at.toISOString(), ...(event.source ? { source: event.source } : {}) }
  }).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}
export function calculateTimeDay({ date, events = [], model = null, vacationFactor = 1, overtimeFraction = 0, overtimeRequestIds = [], holiday = false, now = new Date(), revision = 0 }) {
  const today = berlinTimeDate(now)
  const setting = model?.weekdays?.[String(new Date(`${date}T12:00:00Z`).getUTCDay())]
  const targetMinutes = holiday ? 0 : (setting?.targetMinutes || 0) * vacationFactor
  const overtimeDebitMinutes = holiday ? 0 : (setting?.targetMinutes || 0) * overtimeFraction
  const issues = []
  let status = 'away'
  let workStart = null
  let breakStart = null
  let workedMs = 0
  let breakMs = 0
  let previousAt = -Infinity
  for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const at = Date.parse(event.at)
    if (!Number.isFinite(at) || at <= previousAt || berlinTimeDate(at) !== date) { issues.push('Ungültige oder zeitgleiche Buchung.'); continue }
    previousAt = at
    if (event.type === 'come' && status === 'away') { status = 'working'; workStart = at }
    else if (event.type === 'pause_start' && status === 'working') { workedMs += at - workStart; workStart = null; status = 'break'; breakStart = at }
    else if (event.type === 'pause_end' && status === 'break') { breakMs += at - breakStart; breakStart = null; status = 'working'; workStart = at }
    else if (event.type === 'go' && status !== 'away') {
      if (status === 'working') workedMs += at - workStart
      else breakMs += at - breakStart
      workStart = null; breakStart = null; status = 'away'
    } else issues.push('Buchungsfolge muss geklärt werden.')
  }
  const open = status !== 'away'
  if (date === today && workStart !== null) workedMs += Math.max(0, new Date(now).getTime() - workStart)
  if (date === today && breakStart !== null) breakMs += Math.max(0, new Date(now).getTime() - breakStart)
  const incomplete = issues.length > 0 || (open && date < today)
  if (open && date < today) issues.push('Feierabend oder Pausenende fehlt.')
  if (!model) issues.push('Kein Arbeitszeitmodell hinterlegt.')
  const workedMinutes = Math.floor(workedMs / 60000)
  const bookedBreakMinutes = Math.floor(breakMs / 60000)
  const automaticBreakMinutes = holiday || vacationFactor === 0 ? 0 : progressiveTimeBreak(workedMinutes, bookedBreakMinutes, setting?.breaks)
  const creditedMinutes = Math.max(0, workedMinutes - automaticBreakMinutes)
  return { date, events, revision, workedMinutes, bookedBreakMinutes, automaticBreakMinutes, creditedMinutes, targetMinutes, overtimeDebitMinutes, overtimeRequestIds, balanceMinutes: creditedMinutes - targetMinutes - overtimeDebitMinutes, incomplete, calculationIncomplete: !model, status, issues }
}
export function effectiveTimeVacations(requests) {
  // Approved change/cancellation documents are workflow evidence, not another
  // absence: their persisted original request carries the effective dates.
  return requests.filter((request) => !request.originalRequestId && !request.vacationId && !request.changeRequest && request.requestKind !== 'cancellation' && !request.cancellationRequest
    && (!request.type || request.type === 'vacation') && ['approved', 'manual'].includes(request.status)
    && (request.status !== 'manual' || request.hrManualEntry === true)
    && validTimeDate(request.startDate) && validTimeDate(request.endDate) && request.startDate <= request.endDate)
}
export function vacationTimeDay(date, requests) {
  let factor = 1
  let overtimeFraction = 0
  const overtimeRequestIds = []
  for (const request of effectiveTimeVacations(requests)) {
    if (request.startDate > date || request.endDate < date) continue
    const halfDay = (request.startDate === request.endDate && request.days === 0.5) || (request.halfDayDate === date && Number.isFinite(request.days) && request.days % 1 === 0.5)
    const fraction = halfDay ? 0.5 : 1
    factor = Math.min(factor, 1 - fraction)
    if (request.vacationType === 'overtime') {
      // An accidentally overlapping request must never debit a day twice.
      overtimeFraction = Math.max(overtimeFraction, fraction)
      if (typeof request.id === 'string') overtimeRequestIds.push(request.id)
    }
  }
  return { vacationFactor: factor, overtimeFraction, overtimeRequestIds: [...new Set(overtimeRequestIds)] }
}
export function vacationTimeFactor(date, requests) {
  return vacationTimeDay(date, requests).vacationFactor
}
