function currentDate() {
  const today = new Date()
  const offset = today.getTimezoneOffset() * 60_000
  return new Date(today.getTime() - offset).toISOString().slice(0, 10)
}

export function createBusinessDocumentData() {
  return {
    recipientCompany: '',
    recipientStreet: '',
    recipientZip: '',
    recipientCity: '',
    recipientCountry: '',
    subject: '',
    content: '',
    date: currentDate(),
  }
}

export function formatBusinessDocumentDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

export function businessDocumentRecipientLines({ recipientCompany, recipientStreet, recipientZip, recipientCity, recipientCountry }) {
  const place = [recipientZip, recipientCity].filter(Boolean).join(' ').trim()
  return [recipientCompany, recipientStreet, place, recipientCountry].filter(Boolean)
}
