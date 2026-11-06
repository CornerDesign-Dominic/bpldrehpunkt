const actionNames = {
  tracking: ['Sendungsstatus', 'Shipment status'], order: ['Auftragserfassung', 'Order capture'],
  invoice: ['Rechnungsprüfung', 'Invoice review'], terms: ['AGB-Prüfung', 'Terms review'],
  todo: ['To-do', 'To-do'], damage: ['Schaden', 'Damage'], collection: ['Inkasso', 'Collection'],
  court: ['Gericht / Streit', 'Court / dispute'], calendar: ['Termin / Frist', 'Appointment / deadline'],
}
export function mailTriageActionName(kind, language = 'de') { return actionNames[kind]?.[language === 'en' ? 1 : 0] || kind || '—' }
export function mailTriageOutcomeName(outcome, language = 'de') {
  return outcome === 'missed' ? language === 'en' ? 'Missing recommendation' : 'Empfehlung übersehen' : language === 'en' ? 'Rejected recommendation' : 'Empfehlung verworfen'
}
export function mailTriageChoiceName(choices, id, language = 'de') { const choice = choices.find(item => item.id === id); return choice?.[language === 'en' ? 'en' : 'de'] || id || '—' }
export function mailTriageDate(value, language = 'de') {
  const date = new Date(value)
  return Number.isFinite(value) && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(date) : '—'
}
export function mailTriageFilterPayload(input = {}) {
  return Object.fromEntries(['status', 'outcome', 'kind', 'mailbox', 'dateFrom', 'dateUntil'].flatMap(key => typeof input[key] === 'string' && input[key].trim() ? [[key, input[key].trim()]] : []))
}
export function mailTriageDeletionItems(items, selectedIds) {
  const selected = new Set(selectedIds)
  return items.filter(item => selected.has(item.id)).map(item => ({ id: item.id, revision: item.revision }))
}
