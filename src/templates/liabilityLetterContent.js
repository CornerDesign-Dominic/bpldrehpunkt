import { formatDocumentDate } from './liabilityDocumentData.js'

export const LIABILITY_LETTER_TEXT = {
  salutation: 'Sehr geehrte Damen und Herren,',
  introduction: 'hiermit halten wir Sie für sämtliche entstandenen Schäden sowie daraus resultierende Kosten und Aufwendungen haftbar, die im Zusammenhang mit dem nachfolgend genannten Transportauftrag entstanden sind oder noch entstehen werden.',
  reservation: 'Wir behalten uns vor, die uns entstandenen sowie noch entstehenden Schäden, Kosten und Aufwendungen geltend zu machen.',
  insuranceNotice: 'Bitte informieren Sie vorsorglich Ihre Versicherung über den vorliegenden Sachverhalt.',
  closing: 'Mit freundlichen Grüßen',
}

export function formatLiabilityAddressLine({ company, street, zip, city, country }) {
  const place = [zip, city].filter(Boolean).join(' ').trim()
  return [company, street, place, country].filter((value) => value?.trim()).join(', ')
}

export function liabilityRecipientLines({ transportCompany, transportStreet, transportZip, transportCity, transportCountry }) {
  const place = [transportZip, transportCity].filter(Boolean).join(' ').trim()
  return [transportCompany, transportStreet, place, transportCountry].filter(Boolean)
}

// Shared by the screen preview and PDF, including the legacy manual/PDF form.
// An explicit empty selection must never fall back to unrelated legacy stops.
export function liabilityDocumentLocations(documentData) {
  const stops = Array.isArray(documentData.selectedStops)
    ? documentData.selectedStops
    : ['loading', 'unloading'].map((type) => ({
      id: type,
      type,
      company: documentData[`${type}Company`],
      street: documentData[`${type}Street`],
      postalCode: documentData[`${type}Zip`],
      city: documentData[`${type}City`],
      country: documentData[`${type}Country`],
      date: documentData[`${type}Date`],
      originalText: documentData[`${type}OriginalText`],
    }))
  return stops.map((stop, index) => ({
    id: `${stop.id || stop.type}-${index}`,
    heading: [formatDocumentDate(stop.date), stop.type === 'loading' ? 'Ladestelle:' : 'Entladestelle:'].filter(Boolean).join(' '),
    address: stop.originalText?.trim() || formatLiabilityAddressLine({ ...stop, zip: stop.postalCode }),
  }))
}

export function liabilityStopNeedsReview(stop) {
  if (!String(stop.date || '').trim()) return true
  if (String(stop.originalText || '').trim()) return false
  return ['company', 'street', 'postalCode', 'city', 'country'].some(field => !String(stop[field] || '').trim())
}
