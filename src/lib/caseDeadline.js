const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function optionalDeadlineTime(value) {
  const time = typeof value === 'string' ? value.trim() : ''
  if (time && !/^\d{2}:\d{2}$/.test(time)) throw new Error('Bitte eine gültige Uhrzeit erfassen.')
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
