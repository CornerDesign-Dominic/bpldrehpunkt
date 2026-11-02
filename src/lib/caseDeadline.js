import { berlinToday, resolveReminderTime } from '../../shared/reminderTime.js'

export { berlinToday }

export function optionalDeadlineTime(value) {
  const time = typeof value === 'string' ? value.trim() : ''
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Object.assign(new Error('Bitte eine gültige Uhrzeit erfassen.'), { code: 'invalid-time' })
  return time || null
}

export function reminderDeadlineTime(values) {
  const time = optionalDeadlineTime(values?.time)
  if (values?.reminderEnabled === true && !time) throw Object.assign(new Error('Für eine Erinnerung ist eine Uhrzeit erforderlich.'), { code: 'invalid-time' })
  return time
}

/** Shared case deadline payload. The responsible users are resolved by the
 * server; creator addresses are neither assigned nor changed by this editor. */
export function caseDeadlineReminder(values) {
  const date = typeof values?.date === 'string' ? values.date.trim() : ''
  const time = reminderDeadlineTime(values)
  const occurrence = Object.hasOwn(values || {}, 'occurrence') ? values.occurrence : values?.reminderOccurrence
  const result = resolveReminderTime({ date, time: time || '12:00', occurrence: time ? occurrence ?? null : null })
  if (!result.valid) {
    const error = new Error(result.message)
    error.code = result.code
    throw error
  }
  return { date, time, reminderEnabled: values?.reminderEnabled === true, reminderOccurrence: time ? result.occurrence : null }
}

export function deadlineDateTimeLabel(date, time) {
  const formattedDate = date ? new Intl.DateTimeFormat('de-DE').format(new Date(`${date}T12:00:00`)) : '—'
  return time ? `${formattedDate} · ${time}` : formattedDate
}


/** Compare local calendar dates, not elapsed hours. Noon-versus-midnight
 * rounding shifts today's deadline to tomorrow and behaves differently at DST. */
export function calendarDaysUntil(date, now = new Date()) {
  const day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date(NaN)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return NaN
  try { return Math.round((day.getTime() - new Date(`${berlinToday(now)}T00:00:00Z`).getTime()) / 86400000) }
  catch { return NaN }
}
