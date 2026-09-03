export const VACATION_MONTHS = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(new Date(2024, month, 1)))

export function vacationMonthDays(year, month) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startOffset = (first.getDay() + 6) % 7
  const result = Array.from({ length: startOffset }, () => null)
  for (let day = 1; day <= last.getDate(); day += 1) result.push(new Date(year, month, day))
  while (result.length % 7) result.push(null)
  return result
}
