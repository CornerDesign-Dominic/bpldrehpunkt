export function paymentTermText(partner) {
  const value = partner?.paymentTermDays
  const original = String(partner?.paymentTermsOriginal ?? '').trim()
  if (typeof value === 'number') return original || String(value)
  if (typeof value === 'string') return value.trim()
  return original
}
