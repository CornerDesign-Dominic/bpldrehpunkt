import { detectDelimiter, emailCandidate, parseDelimited, websiteCandidate } from './customerCsv.js'

const text = (value) => String(value ?? '').trim()
const headerKey = (value) => text(value).toLocaleLowerCase('de-DE').replace(/[\s.\-–/]+/g, '')
const fields = {
  unternehmer: 'companyName', strasse: 'street', plz: 'postalCode', ort: 'city', land: 'country',
  utnliefnummer: 'creditorNumber', zugeordnkunde: 'linkedDebtorNumber', ustid: 'vatId', steuernummer: 'taxNumber',
  internet: 'internet', infos: 'infos', zahlungsbedingung1: 'paymentTermsOriginal', iban: 'iban', bic: 'bic',
  ibanprüfdatum: 'ibanVerifiedAt', ibanuberpruftdatum: 'ibanVerifiedAt', ibanüberprüftdatum: 'ibanVerifiedAt',
  erfasstam: 'dycosCreatedAt', timocomnr: 'timocomNumber',
}

function fieldForHeader(value) {
  const key = headerKey(value)
  if (key === 'ibangeprüftdatum' || key === 'ibangepruftdatum') return 'ibanVerifiedAt'
  if (fields[key]) return fields[key]
  const match = key.match(/^(ansprechpartner|abteilunganspr|telefonanspr|handynranspr|mailanspr)([123])$/)
  if (!match) return null
  const suffix = { ansprechpartner: 'Name', abteilunganspr: 'Department', telefonanspr: 'Phone', handynranspr: 'Mobile', mailanspr: 'Email' }[match[1]]
  return `contact${match[2]}${suffix}`
}

const allEmails = (value) => text(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []

export function carrierContacts(raw) {
  const result = []
  for (const number of [1, 2, 3]) {
    const prefix = `contact${number}`
    const name = text(raw[`${prefix}Name`]); const department = text(raw[`${prefix}Department`])
    const phone = text(raw[`${prefix}Phone`]); const mobile = text(raw[`${prefix}Mobile`])
    const email = emailCandidate(raw[`${prefix}Email`]).toLowerCase()
    if (name || department || phone || mobile || email) result.push({ id: `dycos-carrier-${number}`, name, department, phone, mobile, email })
  }
  const extras = [...allEmails(raw.infos), ...allEmails(raw.internet)]
  for (const candidate of extras) {
    const email = candidate.toLowerCase()
    if (!result.some((entry) => entry.email.toLowerCase() === email)) result.push({ id: `dycos-carrier-email-${result.length + 1}`, name: '', department: '', phone: '', mobile: '', email })
  }
  const seen = new Set()
  return result.filter((entry) => { if (!entry.email) return true; const email = entry.email.toLowerCase(); if (seen.has(email)) return false; seen.add(email); return true })
}

export function parseCarrierCsv(csvText) {
  const source = String(csvText ?? '').replace(/^\uFEFF/, '')
  const firstLine = source.split(/\r?\n/).find((line) => line.trim()) || ''
  if (!firstLine) return { headers: [], missingHeaders: ['Unternehmer', 'UTN/Lief.Nummer'], rows: [] }
  const records = parseDelimited(source, detectDelimiter(firstLine)).filter((row) => row.some((value) => text(value)))
  const sourceHeaders = records.shift() || []
  const mapped = sourceHeaders.map(fieldForHeader)
  const missingHeaders = [['companyName', 'Unternehmer'], ['creditorNumber', 'UTN/Lief.Nummer']].filter(([key]) => !mapped.includes(key)).map(([, label]) => label)
  const rows = records.map((values, index) => {
    const raw = Object.fromEntries(mapped.flatMap((key, column) => key ? [[key, text(values[column])]] : []))
    const errors = []
    if (!raw.creditorNumber) errors.push('Kreditorennummer: Pflichtwert fehlt.')
    if (!raw.companyName) errors.push('Unternehmer: Pflichtwert fehlt.')
    const warnings = []
    const retainedRaw = { ...raw }
    delete retainedRaw.infos
    return { rowNumber: index + 2, creditorNumber: raw.creditorNumber || '', companyName: raw.companyName || '', data: { ...retainedRaw, paymentTermDays: raw.paymentTermsOriginal || '', website: text(raw.internet).includes('@') ? '' : websiteCandidate(raw.internet), contacts: carrierContacts(raw), rawValues: retainedRaw }, errors, warnings }
  })
  const counts = new Map()
  rows.forEach((row) => { if (row.creditorNumber) counts.set(row.creditorNumber, (counts.get(row.creditorNumber) || 0) + 1) })
  rows.forEach((row) => { if (row.creditorNumber && counts.get(row.creditorNumber) > 1) row.errors.push('Kreditorennummer kommt in dieser Datei mehrfach vor.') })
  return { headers: sourceHeaders, missingHeaders, rows }
}
