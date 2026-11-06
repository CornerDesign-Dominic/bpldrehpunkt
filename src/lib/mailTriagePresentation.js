export function mailTriageSourceName(sourceId, coverage = {}, language = 'de') {
  const en = language === 'en'
  const names = { subject: en ? 'Subject' : 'Betreff', body: en ? 'Current message' : 'Aktuelle Nachricht', forwarded: en ? 'Forwarded message' : 'Weitergeleitete Nachricht' }
  const index = /^document-([12])$/.exec(sourceId || '')?.[1]
  return names[sourceId] || (index ? coverage.documentNames?.[Number(index) - 1] || `${en ? 'Attachment' : 'Anhang'} ${index}` : en ? 'Source' : 'Quelle')
}
