const text = (value) => typeof value === 'string' ? value.trim() : ''
export const canonicalHeader = (value) => text(value).replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').toLocaleLowerCase('de-DE')
const headers = {
  'kunden-nummer': 'debtorNumber', firma: 'companyName', strasse: 'street', land: 'country', plz: 'postalCode', ort: 'city',
  'erfasst am': 'dycosCreatedAt', 'schickt gutschrift': 'creditNote', zahlungsbedingung: 'paymentTermsOriginal', sprache: 'language', ustid: 'vatId', steuernummer: 'taxNumber', internet: 'website', 'zugeordneter unternehmer': 'linkedCreditorNumber',
  ansprechpartner1: 'contact1Name', anspr1: 'contact1Name', abteilung1: 'contact1Department', telefon1: 'contact1Phone', handynr1: 'contact1Mobile', mail1: 'contact1Email',
  name2: 'contact2Name', abteilung2: 'contact2Department', telefon2: 'contact2Phone', handynr2: 'contact2Mobile', mail2: 'contact2Email',
  name3: 'contact3Name', abteilung3: 'contact3Department', telefon3: 'contact3Phone', handynr3: 'contact3Mobile', mail3: 'contact3Email',
}

export function detectDelimiter(line) { let quoted = false; let comma = 0; let semicolon = 0; for (let index = 0; index < line.length; index += 1) { const character = line[index]; if (character === '"') { if (quoted && line[index + 1] === '"') index += 1; else quoted = !quoted } else if (!quoted && character === ',') comma += 1; else if (!quoted && (character === '\n' || character === '\r')) break; else if (!quoted && character === ';') semicolon += 1 } return semicolon >= comma ? ';' : ',' }
export function parseDelimited(source, delimiter) { const rows = []; let row = []; let value = ''; let quoted = false; for (let index = 0; index < source.length; index += 1) { const character = source[index]; if (character === '"') { if (quoted && source[index + 1] === '"') { value += '"'; index += 1 } else quoted = !quoted } else if (!quoted && character === delimiter) { row.push(value); value = '' } else if (!quoted && (character === '\n' || character === '\r')) { if (character === '\r' && source[index + 1] === '\n') index += 1; row.push(value); rows.push(row); row = []; value = '' } else value += character } if (quoted) throw new Error('Die CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.') ; if (value || row.length) { row.push(value); rows.push(row) } return rows }
export function emailCandidate(value) { const match = text(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return match?.[0] || '' }
export function websiteCandidate(value) { const source = text(value); return /^(?:www\.|https?:\/\/)/i.test(source) ? source : '' }
function contacts(data) { return [1, 2, 3].map((number) => { const prefix = `contact${number}`; const raw = [data[`${prefix}Name`], data[`${prefix}Department`], data[`${prefix}Phone`], data[`${prefix}Mobile`], data[`${prefix}Email`]].map(text); const email = raw.map(emailCandidate).find(Boolean) || ''; const website = raw.map(websiteCandidate).find(Boolean) || ''; if (!raw.some(Boolean)) return null; return { id: `dycos-${number}`, name: raw[0], department: raw[1], phone: raw[2], mobile: raw[3], email, website, raw: raw.filter(Boolean) } }).filter(Boolean) }

export function parseCustomerCsv(csvText) {
  const source = String(csvText ?? '').replace(/^\uFEFF/, ''); const firstLine = source.split(/\r?\n/).find((line) => line.trim()) || ''
  if (!firstLine) return { headers: [], missingHeaders: ['Kunden- nummer', 'Firma'], rows: [] }
  const rows = parseDelimited(source, detectDelimiter(firstLine)).filter((row) => row.some((value) => text(value)))
  const sourceHeaders = rows.shift() || []; const mapped = sourceHeaders.map((value) => headers[canonicalHeader(value)] || null)
  const missingHeaders = [['debtorNumber', 'Kunden- nummer'], ['companyName', 'Firma']].filter(([key]) => !mapped.includes(key)).map(([, label]) => label)
  const result = rows.map((values, index) => {
    const raw = Object.fromEntries(mapped.map((key, column) => [key, key ? text(values[column]) : undefined]).filter(([key]) => key))
    const errors = []; if (!raw.debtorNumber) errors.push('Kunden- nummer: Pflichtwert fehlt.'); if (!raw.companyName) errors.push('Firma: Pflichtwert fehlt.')
    const warnings = []
    const expectedContactFields = new Set(['website', 'contact1Email', 'contact2Email', 'contact3Email'])
    const unusual = Object.entries(raw).filter(([key, value]) => value && !expectedContactFields.has(key) && (emailCandidate(value) || websiteCandidate(value))).map(([key, value]) => ({ field: key, value }))
    return { rowNumber: index + 2, debtorNumber: raw.debtorNumber || '', companyName: raw.companyName || '', data: { ...raw, paymentTermDays: raw.paymentTermsOriginal || '', creditNoteProcedure: /^(?:ausgewählt|ja|x|1)$/i.test(raw.creditNote || ''), contacts: contacts(raw), rawValues: raw, unusualValues: unusual }, errors, warnings }
  })
  const duplicates = new Map(); result.forEach((row) => { if (row.debtorNumber) duplicates.set(row.debtorNumber, (duplicates.get(row.debtorNumber) || 0) + 1) }); result.forEach((row) => { if (row.debtorNumber && duplicates.get(row.debtorNumber) > 1) row.errors.push('Kunden- nummer kommt in dieser Datei mehrfach vor.') })
  return { headers: sourceHeaders, missingHeaders, rows: result }
}
