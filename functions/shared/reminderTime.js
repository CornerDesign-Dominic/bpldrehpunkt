const TIME_ZONE = 'Europe/Berlin'
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/
const instantPattern = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, calendar: 'gregory', numberingSystem: 'latn',
  era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

// Date.UTC treats years 0..99 as 1900..1999; setting the full year avoids it.
function wallClockMillis({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  const instant = new Date(0)
  instant.setUTCFullYear(year, month - 1, day)
  instant.setUTCHours(hour, minute, second, 0)
  return instant.getTime()
}
function dateParts(value, minimumYear = 1) {
  if (typeof value !== 'string') return null
  const match = datePattern.exec(value)
  if (!match) return null
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  if (parts.year < minimumYear || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return null
  const roundTrip = new Date(wallClockMillis(parts))
  return roundTrip.getUTCFullYear() === parts.year && roundTrip.getUTCMonth() + 1 === parts.month && roundTrip.getUTCDate() === parts.day ? parts : null
}
function berlinParts(instant) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  // Sampling near 0001-01-01 can cross into the preceding astronomical year.
  const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year)
  return { year, month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) }
}
function instantMillis(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value !== 'string') return NaN
  const match = instantPattern.exec(value)
  if (!match || !dateParts(match[1], 0)) return NaN
  return Date.parse(value)
}
function failure(code, message, candidates = []) { return { valid: false, code, message, candidates } }

/** Resolve a strictly validated Berlin wall time. DST gaps never shift a time;
 * overlaps require an explicit earlier/later occurrence from the user.
 * Intl supplies offsets, including historical second-based Berlin offsets.
 */
export function resolveReminderTime(input = {}) {
  const { date, time, occurrence } = input && typeof input === 'object' ? input : {}
  const calendar = dateParts(date)
  if (!calendar) return failure('invalid-date', 'Bitte ein gültiges Datum im Format JJJJ-MM-TT erfassen.')
  if (typeof time !== 'string' || !timePattern.test(time)) return failure('invalid-time', 'Bitte eine gültige Uhrzeit im Format HH:MM erfassen.')
  if (occurrence != null && occurrence !== 'earlier' && occurrence !== 'later') return failure('invalid-occurrence', 'Bitte das erste oder zweite Vorkommen der Uhrzeit auswählen.')
  const [hour, minute] = time.split(':').map(Number)
  const expected = { ...calendar, hour, minute, second: 0 }
  const wall = wallClockMillis(expected)
  // Probe both sides of a Berlin offset transition; then verify each proposed
  // instant against every requested wall-clock field instead of normalizing it.
  const offsets = new Set([-48, -24, -12, 0, 12, 24, 48].map((hours) => {
    const sample = wall + hours * HOUR_MS
    return wallClockMillis(berlinParts(new Date(sample))) - sample
  }))
  const candidates = [...offsets].map((offset) => wall - offset)
    .filter((candidate) => {
      const actual = berlinParts(new Date(candidate))
      return Object.entries(expected).every(([field, value]) => actual[field] === value)
    }).sort((left, right) => left - right).map((candidate) => new Date(candidate).toISOString())
  if (!candidates.length) return failure('nonexistent-time', 'Diese Uhrzeit gibt es wegen der Zeitumstellung in Berlin nicht. Bitte eine andere Uhrzeit wählen.')
  if (candidates.length > 1 && !occurrence) return failure('ambiguous-time', 'Diese Uhrzeit kommt wegen der Zeitumstellung zweimal vor. Bitte das erste oder zweite Vorkommen auswählen.', candidates)
  const ambiguous = candidates.length > 1
  return { valid: true, dueAt: ambiguous && occurrence === 'later' ? candidates.at(-1) : candidates[0], ambiguous, candidates, occurrence: ambiguous ? occurrence : null }
}

/** The calendar date in Berlin, independent of browser/server local timezone. */
export function berlinToday(now = new Date()) {
  const milliseconds = instantMillis(now)
  if (!Number.isFinite(milliseconds)) throw new RangeError('Für das Berliner Datum ist ein gültiger Zeitpunkt erforderlich.')
  const { year, month, day } = berlinParts(new Date(milliseconds))
  if (year < 1 || year > 9999) throw new RangeError('Das Berliner Datum liegt außerhalb des unterstützten Jahresbereichs.')
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** No catch-up: the only due window is [dueAt, dueAt + 60 seconds).
 * Inputs must be Date instances or ISO instants with an explicit UTC offset.
 */
export function reminderMinuteState(dueAt, now = new Date()) {
  const due = instantMillis(dueAt), clock = instantMillis(now)
  if (!Number.isFinite(due) || !Number.isFinite(clock)) return 'invalid'
  if (clock < due) return 'upcoming'
  return clock < due + MINUTE_MS ? 'due' : 'missed'
}
