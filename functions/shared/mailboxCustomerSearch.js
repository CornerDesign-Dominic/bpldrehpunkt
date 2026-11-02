export function mailboxCustomerSearchCriteria(order = {}) {
  const text = (value, max) => {
    if (value == null) return ''
    if (typeof value !== 'string' || value.length > max || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('Ungültige Kundensuchangaben.')
    return value.normalize('NFKC').trim()
  }
  const vatId = text(order.customerVatId, 40).replace(/[\s.-]/g, '').toUpperCase()
  if (vatId && !/^[A-Z]{2}[A-Z0-9]{2,28}$/.test(vatId)) throw new Error('Bitte eine gültige USt-ID eingeben.')
  const postalCode = text(order.customerPostalCode, 40), city = text(order.customerCity, 255)
  if (!vatId && (postalCode.length < 2 || city.length < 2)) throw new Error('Für die direkte DyCoS-Suche bitte USt-ID oder PLZ und Ort des Auftraggebers ergänzen.')
  return { vatId, postalCode, city, name: text(order.customerName, 255) }
}
export const mailboxCustomerSearchKey = order => JSON.stringify((({ vatId, postalCode, city }) => ({ vatId, postalCode, city }))(mailboxCustomerSearchCriteria(order)))
