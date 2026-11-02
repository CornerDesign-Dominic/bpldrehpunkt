const field = (key, label, type = 'text', required = false, options = []) => ({ key, label, type, required, options })
const description = field('description', 'Beschreibung', 'textarea')
const deadline = [field('deadlineDate', 'Neue Frist / Termin', 'date'), field('deadlineTime', 'Uhrzeit der Frist', 'time'), field('deadlineNote', 'Hinweis zur Frist')]
export const mailboxRecordKinds = {
  todo: { label: 'To-do', module: 'todos', collection: 'todos', route: '/todos/', fields: [field('title', 'Titel', 'text', true), description, field('dueDate', 'Fällig am', 'date'), field('priority', 'Priorität', 'select', false, ['low', 'medium', 'high']), field('reference', 'Referenz')] },
  damage: { label: 'Schaden', module: 'damages', collection: 'damageCases', route: '/schaeden/', counter: 'damageCaseCounters', prefix: 'S', fields: [description, field('damageDate', 'Schadendatum', 'date', true), field('damageType', 'Schadenart', 'select', true, ['Bruchschaden', 'Verlustschaden', 'Verspätungsschaden', 'Temperaturschaden', 'Nässe / Wasserschaden', 'Diebstahl / Raub', 'Sonstiger']), field('damageAmount', 'Schadenhöhe', 'number', true), field('transportReference', 'Transportauftragsnummer'), field('claimant', 'Anspruchsteller'), field('contractor', 'Unternehmer'), ...deadline] },
  collection: { label: 'Inkasso', module: 'inkasso', collection: 'inkassoCases', route: '/inkasso/', counter: 'inkassoCaseCounters', prefix: 'I', fields: [description, field('debtorName', 'Schuldner laut Quelle'), field('collectionAgency', 'Inkassounternehmen'), field('collectionReference', 'Inkasso-Aktenzeichen'), field('invoiceNumbers', 'Rechnungsnummern'), field('claimAmount', 'Forderungsbetrag brutto', 'number'), field('invoiceDate', 'Rechnungsdatum', 'date'), field('originalDueDate', 'Ursprünglich fällig am', 'date'), field('lastReminderDate', 'Letzte Mahnung', 'date'), field('lawFirm', 'Anwaltskanzlei'), field('lawyerReference', 'Anwaltsaktenzeichen'), ...deadline] },
  court: { label: 'Gericht', module: 'legalDisputes', collection: 'legalDisputes', route: '/legal-disputes/', counter: 'legalDisputeCaseCounters', prefix: 'G', fields: [field('transportReference', 'Transportauftragsnummer', 'text', true), field('counterparty', 'Gegenpartei'), field('caseType', 'Fallart'), description, field('court', 'Gericht'), field('courtReference', 'Gerichtsaktenzeichen'), field('lawFirm', 'Anwaltskanzlei'), field('lawyerReference', 'Anwaltsaktenzeichen'), field('amountInDispute', 'Streitwert', 'number'), field('startedAt', 'Beginn', 'date'), ...deadline] },
  calendar: { label: 'Kalender', module: 'calendar', collection: 'calendars', route: '/kalender', fields: [field('title', 'Titel', 'text', true), description, field('startDate', 'Beginn am', 'date', true), field('endDate', 'Ende am', 'date', true), field('allDay', 'Ganztägig', 'select', false, ['true', 'false']), field('startTime', 'Beginn um', 'time'), field('endTime', 'Ende um', 'time')] },
}
export const recordFieldLabel = field => field.label
export function recordAmount(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : NaN
  if (typeof raw !== 'string') return NaN
  let value = raw.trim().replace(/^(?:EUR|€)\s*/i, '').replace(/\s*(?:EUR|€)$/i, '').replace(/[\s\u00a0]/g, '')
  if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(value)) value = value.replaceAll('.', '').replace(',', '.')
  else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(value)) value = value.replaceAll(',', '')
  else if (/^\d+(?:[.,]\d{1,2})?$/.test(value)) value = value.replace(',', '.')
  else return NaN
  return Number.isFinite(Number(value)) ? Number(value) : NaN
}
export function validRecordDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value).getTime()) && new Date(value).toISOString().slice(0, 10) === value
}
export function recordValues(kind, input = {}, { required = false } = {}) {
  const config = mailboxRecordKinds[kind]
  if (!config) throw new Error('Ungültige Aktion.')
  const values = {}
  for (const definition of config.fields) {
    const raw = input[definition.key]
    const value = raw === undefined || raw === null ? '' : String(raw).trim()
    if (value.length > (definition.type === 'textarea' ? 4000 : 240) || value.includes('\0')) throw new Error(`${definition.label}: Eingabe zu lang oder ungültig.`)
    if (!value) { if (required && definition.required) throw new Error(`Bitte ${definition.label} erfassen.`); continue }
    if (definition.type === 'date' && !validRecordDate(value)) throw new Error(`${definition.label}: Datum prüfen.`)
    if (definition.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${definition.label}: Uhrzeit prüfen.`)
    if (definition.type === 'number' && !Number.isFinite(recordAmount(value))) throw new Error(`${definition.label}: Betrag prüfen.`)
    if (definition.type === 'select' && !definition.options.includes(value)) throw new Error(`${definition.label}: Auswahl prüfen.`)
    values[definition.key] = definition.type === 'number' ? recordAmount(value) : value
  }
  if (values.deadlineTime && !values.deadlineDate) throw new Error('Zur Fristuhrzeit fehlt das Datum.')
  if (kind === 'calendar') {
    if ((values.title || '').length > 160) throw new Error('Der Termintitel darf höchstens 160 Zeichen enthalten.')
    if (values.startDate && values.endDate && values.endDate < values.startDate) throw new Error('Das Terminende liegt vor dem Beginn.')
    if (required && values.allDay === 'false' && (!values.startTime || !values.endTime)) throw new Error('Bitte Beginn und Ende mit Uhrzeit erfassen.')
    if (values.startDate === values.endDate && values.startTime && values.endTime && values.endTime <= values.startTime) throw new Error('Das Terminende muss nach dem Beginn liegen.')
  }
  return values
}
export function recordInvoices(rows = []) {
  if (!Array.isArray(rows) || rows.length > 50) throw new Error('Höchstens 50 Rechnungen können übernommen werden.')
  const seen = new Set()
  return rows.map(row => {
    const invoiceNumber = typeof row?.invoiceNumber === 'string' ? row.invoiceNumber.trim() : ''
    const key = invoiceNumber.toLowerCase().replace(/\s+/g, '')
    if (!invoiceNumber || invoiceNumber.length > 240 || seen.has(key)) throw new Error('Bitte eindeutige Rechnungsnummern erfassen.')
    seen.add(key)
    const netAmount = recordAmount(row.netAmount)
    const vatAmount = recordAmount(row.vatAmount)
    if (![netAmount, vatAmount].every(value => Number.isFinite(value) && value >= 0) || !Number.isFinite(netAmount + vatAmount)) throw new Error('Bitte je Rechnung Nettobetrag und USt.-Betrag prüfen. Fehlende Umsatzsteuer nicht automatisch als null annehmen.')
    return { invoiceNumber, netAmount, vatAmount, grossAmount: netAmount + vatAmount }
  })
}
