export const VACATION_MONTHS = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(new Date(2024, month, 1)))

// Both vacation calendars consume these variants. Their visual treatment is
// defined once in vacation.css via the matching `vacation-calendar-bar--…`
// and `vacation-legend__item--…` classes.
export const VACATION_CALENDAR_LEGEND = Object.freeze([
  { kind: 'approved', label: 'Genehmigt' },
  { kind: 'pending', label: 'Ausstehend' },
  { kind: 'change_requested', label: 'Änderung angefragt' },
  { kind: 'cancellation_requested', label: 'Storno angefragt' },
  { kind: 'holiday', label: 'Feiertag' },
  { kind: 'block', label: 'Urlaubssperre' },
])

export function vacationMonthDays(year, month) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startOffset = (first.getDay() + 6) % 7
  const result = Array.from({ length: startOffset }, () => null)
  for (let day = 1; day <= last.getDate(); day += 1) result.push(new Date(year, month, day))
  while (result.length % 7) result.push(null)
  return result
}
