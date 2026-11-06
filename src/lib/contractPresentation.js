export const CONTRACT_CYCLES = {
  monthly: ['Monatlich', 'Monthly'], quarterly: ['Vierteljährlich', 'Quarterly'], 'half-yearly': ['Halbjährlich', 'Half-yearly'],
  yearly: ['Jährlich', 'Yearly'], once: ['Einmalig', 'One-off'],
}
export const CONTRACT_DEADLINE_TYPES = {
  deadline: ['Frist', 'Deadline'], appointment: ['Termin', 'Appointment'],
  cancellation: ['Kündigungsfrist', 'Cancellation deadline'], renewal: ['Verlängerung', 'Renewal'],
  'contract-end': ['Vertragsende', 'Contract end'],
}
export function contractLabel(labels, value, language) { return labels[value]?.[language === 'en' ? 1 : 0] || value }
export function parseContractMoney(value) {
  const source = String(value).trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(source)) return null
  const [whole, fraction = ''] = source.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents <= 100_000_000_000 ? cents : null
}
export function contractLineTotal(position) {
  return position.grossAmountCents
}
// Separate actual billing periods. Do not turn one-off fees into recurring costs.
export function contractCostTotals(positions) {
  return positions.reduce((totals, position) => {
    if (Object.hasOwn(totals, position.billingCycle)) totals[position.billingCycle] += contractLineTotal(position)
    return totals
  }, { monthly: 0, quarterly: 0, 'half-yearly': 0, yearly: 0, once: 0 })
}
export function formatContractMoney(cents, language) {
  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}
export function formatContractDate(value, language) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE') : '—'
}
export function formatContractTimestamp(value, language) {
  return value?.toDate?.().toLocaleString(language === 'en' ? 'en-GB' : 'de-DE') || '—'
}
export function localContractDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
export function nextContractCharge(anchorDate, billingCycle, today = localContractDate()) {
  const valid = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }
  if (!valid(anchorDate) || !valid(today)) return null
  if (billingCycle === 'once' || anchorDate >= today) return anchorDate
  const step = { monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12 }[billingCycle]
  if (!step) return null
  const [year, month, day] = anchorDate.split('-').map(Number)
  const [currentYear, currentMonth] = today.split('-').map(Number)
  const elapsed = (currentYear - year) * 12 + currentMonth - month
  function occurrence(periods) {
    const offset = month - 1 + periods * step
    const targetYear = year + Math.floor(offset / 12)
    const targetMonth = offset % 12
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
    return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
  }
  const periods = Math.max(0, Math.floor(elapsed / step))
  const candidate = occurrence(periods)
  return candidate >= today ? candidate : occurrence(periods + 1)
}
export function contractMutationError(error, language) {
  const en = language === 'en'
  if (['functions/aborted', 'functions/failed-precondition'].includes(error?.code)) return en ? 'The record has changed. Close the form, reload the file and try again.' : 'Der Eintrag wurde zwischenzeitlich geändert. Bitte Formular schließen, Akte neu laden und erneut versuchen.'
  if (error?.code === 'functions/permission-denied') return en ? 'You do not have permission to change this contract.' : 'Du hast keine Berechtigung, diesen Vertrag zu ändern.'
  if (error?.code === 'functions/invalid-argument') return en ? 'Please check the required fields, amounts and dates.' : 'Bitte Pflichtfelder, Beträge und Datumsangaben prüfen.'
  return en ? 'The change could not be confirmed. Your input has been kept. Please retry.' : 'Die Änderung konnte nicht bestätigt werden. Die Eingaben bleiben erhalten. Bitte erneut versuchen.'
}
