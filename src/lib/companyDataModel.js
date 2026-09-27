export const COMPANY_FIELDS = {
  identity: [['legalName', 'Firmierung'], ['tradeName', 'Geschäftsbezeichnung'], ['legalForm', 'Rechtsform'], ['managingDirector', 'Geschäftsführung']],
  address: [['street', 'Straße und Hausnummer'], ['postalCode', 'Postleitzahl'], ['city', 'Ort'], ['country', 'Land']],
  contact: [['phone', 'Telefon'], ['fax', 'Fax'], ['email', 'Allgemeine E-Mail'], ['billingEmail', 'Rechnungs-E-Mail'], ['website', 'Website'], ['contactPerson', 'Ansprechperson']],
  legal: [['registerCourt', 'Registergericht'], ['registerNumber', 'Handelsregisternummer'], ['vatId', 'USt-IdNr.'], ['taxNumber', 'Steuernummer']],
  bank: [['bankName', 'Bank'], ['iban', 'IBAN'], ['bic', 'BIC']],
}

export const COMPANY_FOOTER_EDIT_GROUPS = [
  { title: 'Firma und Anschrift', fields: [['legalName', 'Firmierung'], ['street', 'Straße und Hausnummer'], ['postalCode', 'Postleitzahl'], ['city', 'Ort']] },
  { title: 'Geschäftsführung und Register', fields: [['managingDirector', 'Geschäftsführung'], ['registerNumber', 'Handelsregisternummer'], ['registerCourt', 'Registergericht'], ['vatId', 'USt-IdNr.']] },
  { title: 'Kontakt', fields: [['phone', 'Telefon'], ['email', 'E-Mail'], ['website', 'Website']] },
  { title: 'Bankverbindung', fields: [['bankName', 'Bank'], ['iban', 'IBAN'], ['bic', 'SWIFT / BIC']] },
]

export const COMPANY_FIELD_LIMITS = {
  legalName: 200, tradeName: 200, legalForm: 80, managingDirector: 200,
  street: 200, postalCode: 24, city: 120, country: 120,
  phone: 80, fax: 80, email: 320, billingEmail: 320, website: 320, contactPerson: 200,
  registerCourt: 120, registerNumber: 120, vatId: 80, taxNumber: 80,
  bankName: 160, iban: 80, bic: 40,
}

export const DEFAULT_COMPANY_DATA = Object.freeze({
  legalName: 'Brennpunkt Logistik GmbH', tradeName: '', legalForm: 'GmbH', managingDirector: 'Dieter Elas',
  street: 'Reinshagenstr. 1', postalCode: '42369', city: 'Wuppertal', country: 'Deutschland',
  phone: '+49 202 26155-771', fax: '', email: 'info@brennpunkt-logistik.de', billingEmail: '', website: 'www.brennpunkt-logistik.de', contactPerson: '',
  registerCourt: 'Wuppertal', registerNumber: 'HRB 27075', vatId: 'DE304818005', taxNumber: '',
  bankName: 'Stadtsparkasse', iban: 'DE16 3405 0000 0000 1318 47', bic: 'WELADED1XXX',
})

export function normalizeCompanyData(value) {
  const source = value || DEFAULT_COMPANY_DATA
  return Object.fromEntries(Object.values(COMPANY_FIELDS).flat().map(([key]) => [key, typeof source[key] === 'string' ? source[key] : '']))
}

export function companySenderLine(company) {
  const place = [company.postalCode && `${company.country === 'Deutschland' ? 'D-' : ''}${company.postalCode}`, company.city].filter(Boolean).join(' ')
  return [company.legalName, company.street, place, company.country && company.country !== 'Deutschland' ? company.country : ''].filter(Boolean).join(' · ')
}

export function companyFooterColumns(company) {
  const line = (text, bold = false) => text ? { text, bold } : null
  return [
    [line(company.legalName, true), line(company.street), line([[company.postalCode, company.city].filter(Boolean).join(' '), company.country && company.country !== 'Deutschland' ? company.country : ''].filter(Boolean).join(', '))],
    [line(company.managingDirector && `Geschäftsführung: ${company.managingDirector}`), line(company.registerNumber && `Handelsregister: ${company.registerNumber}${company.registerCourt ? ` ${company.registerCourt}` : ''}`), line(company.vatId && `USt-ID-Nr.: ${company.vatId}`)],
    [line(company.phone && `Tel: ${company.phone}`), line(company.email && `E-Mail: ${company.email}`), line(company.website && `Web: ${company.website}`)],
    [line(company.bankName, true), line(company.iban && `IBAN: ${company.iban}`), line(company.bic && `SWIFT: ${company.bic}`)],
  ].map((column) => column.filter(Boolean))
}
