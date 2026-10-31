const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function optionalDeadlineTime(value) {
  const time = typeof value === 'string' ? value.trim() : ''
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Bitte eine gültige Uhrzeit erfassen.')
  return time || null
}

export function reminderDeadlineTime(values) {
  const time = optionalDeadlineTime(values?.time)
  if (values?.reminderEnabled === true && !time) throw new Error('Für eine Erinnerung ist eine Uhrzeit erforderlich.')
  return time
}

/** The recipient is deliberately fixed when a deadline is created. Editing a
 * deadline must never silently redirect a reminder to the editing user. */
export function deadlineCreatorEmail(actor) {
  const email = typeof actor?.profile?.email === 'string' ? actor.profile.email.trim() : typeof actor?.user?.email === 'string' ? actor.user.email.trim() : ''
  if (!EMAIL_PATTERN.test(email)) throw new Error('Für den Ersteller ist keine gültige E-Mail-Adresse hinterlegt.')
  return email
}

export function shortReminderRecipient(deadline) {
  if (!deadline?.reminderEnabled || typeof deadline.reminderRecipientEmail !== 'string') return '—'
  const at = deadline.reminderRecipientEmail.indexOf('@')
  return at < 0 ? '—' : `${deadline.reminderRecipientEmail.slice(0, at + 1)}...`
}

export function deadlineDateTimeLabel(date, time) {
  const formattedDate = date ? new Intl.DateTimeFormat('de-DE').format(new Date(`${date}T12:00:00`)) : '—'
  return time ? `${formattedDate} · ${time}` : formattedDate
}


/** Compare local calendar dates, not elapsed hours. Noon-versus-midnight
 * rounding shifts today's deadline to tomorrow and behaves differently at DST. */
export function calendarDaysUntil(date, now = new Date()) {
  const due = new Date(`${date}T12:00:00`)
  const day = (value) => {
    const serial = new Date(0)
    serial.setUTCFullYear(value.getFullYear(), value.getMonth(), value.getDate())
    return serial.getTime()
  }
  return Math.round((day(due) - day(now)) / 86400000)
}
