export const LIABILITY_LETTER_TEXT = {
  salutation: 'Sehr geehrte Damen und Herren,',
  introduction: 'hiermit halten wir Sie für sämtliche entstandenen Schäden sowie daraus resultierende Kosten und Aufwendungen haftbar, die im Zusammenhang mit dem nachfolgend genannten Transportauftrag entstanden sind oder noch entstehen werden.',
  reservation: 'Wir behalten uns vor, die uns entstandenen sowie noch entstehenden Schäden, Kosten und Aufwendungen geltend zu machen.',
  insuranceNotice: 'Bitte informieren Sie vorsorglich Ihre Versicherung über den vorliegenden Sachverhalt.',
  closing: 'Mit freundlichen Grüßen',
  company: 'Brennpunkt Logistik GmbH',
}

export function formatLiabilityAddressLine({ company, street, zip, city, country }) {
  const place = [zip, city].filter(Boolean).join(' ').trim()
  return [company, street, place, country].filter((value) => value?.trim()).join(', ')
}

export function liabilityRecipientLines({ transportCompany, transportStreet, transportZip, transportCity, transportCountry }) {
  const place = [transportZip, transportCity].filter(Boolean).join(' ').trim()
  return [transportCompany, transportStreet, place, transportCountry].filter(Boolean)
}

export function liabilitySignature(documentData) {
  const signature = documentData?.attachments?.signature
  return signature?.signerName && signature?.imageData ? signature : null
}
