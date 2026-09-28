const berlinDateTimeFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const berlinPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function utcValue({ year, month, day, hour, minute }) { return Date.UTC(year, month - 1, day, hour, minute) }

/** Converts a non-ambiguous BPL wall-clock timestamp into an instant. */
export function shipmentTrackingActivationAt(value) {
  const match = `${value?.date || ''} ${value?.time || ''}`.match(/^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  const target = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]) }
  let instant = new Date(utcValue(target))
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(berlinPartsFormatter.formatToParts(instant).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
    const adjustment = utcValue(target) - utcValue(parts)
    if (!adjustment) break
    instant = new Date(instant.getTime() + adjustment)
  }
  return Number.isNaN(instant.getTime()) ? null : instant
}

function duration(milliseconds) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours} Std. ${minutes} Min.`
}

export function shipmentTrackingActivationPresentation(activation, { now = new Date() } = {}) {
  const scheduledAt = shipmentTrackingActivationAt(activation?.startAt)
  if (!scheduledAt) return { available: false, countdown: 'Automatischer Startzeitpunkt nicht berechenbar.', startAt: null }
  const reference = now instanceof Date ? now : new Date(now)
  const milliseconds = scheduledAt.getTime() - reference.getTime()
  return {
    available: true,
    countdown: milliseconds > 0 ? `Automatischer Start in ${duration(milliseconds)}` : 'Automatischer Start wird ausgeführt …',
    startAt: `Startzeitpunkt: ${berlinDateTimeFormatter.format(scheduledAt)} Uhr`,
  }
}
