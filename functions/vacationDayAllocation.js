import { HttpsError } from 'firebase-functions/v2/https'

export function vacationHalfDayDate(values) {
  if (Number(values.days) % 1 !== 0.5) return ''
  const date = values.startDate === values.endDate ? values.startDate : values.halfDayDate
  const parsed = typeof date === 'string' ? new Date(`${date}T12:00:00Z`) : new Date(NaN)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date < values.startDate || date > values.endDate) {
    throw new HttpsError('invalid-argument', 'Bitte das Datum des halben Urlaubstags im Urlaubszeitraum angeben.')
  }
  return date
}
