import { resolveReminderTime } from '../../shared/reminderTime.js'

const messages = {
  'invalid-date': ['Bitte ein gültiges Erinnerungsdatum eingeben.', 'Enter a valid reminder date.'],
  'invalid-time': ['Bitte eine Uhrzeit für die Erinnerung eingeben.', 'Enter a time for the reminder.'],
  'invalid-occurrence': ['Bitte das erste oder zweite Vorkommen auswählen.', 'Select the first or second occurrence.'],
  'ambiguous-time': ['Diese Uhrzeit kommt in Berlin zweimal vor. Bitte das erste oder zweite Vorkommen wählen.', 'This time occurs twice in Berlin. Select the first or second occurrence.'],
  'nonexistent-time': ['Diese Uhrzeit gibt es wegen der Zeitumstellung in Berlin nicht. Bitte eine andere Uhrzeit wählen.', 'This time does not exist in Berlin because the clocks change. Choose another time.'],
}

export function reminderValidationMessage(error, language = 'de') {
  const code = error?.reminderCode || error?.code
  return messages[code]?.[language === 'en' ? 1 : 0] || error?.message || (language === 'en' ? 'The reminder could not be saved.' : 'Die Erinnerung konnte nicht gespeichert werden.')
}

export function validateReminderForm(values) {
  const result = resolveReminderTime({ date: values.date || '', time: values.time || '', occurrence: values.occurrence || null })
  if (!result.valid) {
    const error = new Error(reminderValidationMessage(result))
    error.reminderCode = result.code
    throw error
  }
  return result
}

/** Preserve an unchanged, incomplete legacy configuration during unrelated
 * edits. A changed schedule or a new reminder must have an explicit valid time. */
export function todoReminderFields(values, previous = null) {
  const fields = {
    reminderDate: values.reminderDate || null,
    reminderTime: values.reminderDate ? values.reminderTime || null : null,
    reminderOccurrence: values.reminderDate ? values.reminderOccurrence || null : null,
  }
  const unchanged = previous && Object.entries(fields).every(([key, value]) => (previous[key] || null) === value)
  if (fields.reminderDate && !unchanged) fields.reminderOccurrence = validateReminderForm({ date: fields.reminderDate, time: fields.reminderTime, occurrence: fields.reminderOccurrence }).occurrence
  return fields
}

export function calendarReminderFields(values) {
  if (values?.reminderEnabled !== true) return { reminderEnabled: false, reminderDate: null, reminderTime: null, reminderOccurrence: null }
  const resolved = validateReminderForm({ date: values.reminderDate, time: values.reminderTime, occurrence: values.reminderOccurrence })
  return { reminderEnabled: true, reminderDate: values.reminderDate, reminderTime: values.reminderTime, reminderOccurrence: resolved.occurrence }
}

export function reminderTimestampKey(value) {
  return value?.toMillis?.() ?? JSON.stringify(value ?? null)
}

export function reminderDueAtLabel(value, language = 'de') {
  const due = typeof value === 'string' ? new Date(value) : null
  if (!due || !Number.isFinite(due.getTime())) return ''
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' }).format(due)
}
