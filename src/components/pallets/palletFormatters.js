const numberFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
const dateFormatter = new Intl.DateTimeFormat('de-DE')

export function formatPalletNumber(value, withSign = false) {
  const number = Number(value) || 0
  return `${withSign && number > 0 ? '+' : ''}${numberFormatter.format(number)}`
}

export function formatPalletDate(date) {
  return dateFormatter.format(new Date(`${date}T00:00:00`))
}

export function formatLastPalletClosing(closing) {
  return closing ? `${formatPalletDate(closing.date)} · ${formatPalletNumber(closing.balance, true)}` : '—'
}
