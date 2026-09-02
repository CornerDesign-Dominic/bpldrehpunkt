import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { createHistoryPayload } from './partnerHistory.js'

export const BUSINESS_PARTNERS_COLLECTION = 'businessPartners'
export const BUSINESS_PARTNER_STATUSES = [
  { value: 'active', label: 'Aktiv' },
  { value: 'inactive', label: 'Inaktiv' },
  { value: 'insolvency', label: 'Insolvenz' },
  { value: 'blocked', label: 'Gesperrt' },
]

const businessPartnersRef = collection(db, BUSINESS_PARTNERS_COLLECTION)

const trimValue = (value) => (value ?? '').trim()

function normalizeOptionalNonNegativeNumber(value, fieldName) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`Ungültiger Wert für ${fieldName}`)
  return number
}

function normalizeOptionalNonNegativeInteger(value, fieldName) {
  const number = normalizeOptionalNonNegativeNumber(value, fieldName)
  if (number !== null && !Number.isInteger(number)) throw new Error(`Ungültiger Wert für ${fieldName}`)
  return number
}

export function getBusinessPartnerType({ debtorNumber, creditorNumber }) {
  const hasDebtorNumber = Boolean(debtorNumber?.trim())
  const hasCreditorNumber = Boolean(creditorNumber?.trim())

  if (hasDebtorNumber && hasCreditorNumber) return 'Kunde & Unternehmer'
  if (hasDebtorNumber) return 'Kunde'
  return 'Unternehmer'
}

export function getBusinessPartnerStatusLabel(status) {
  return BUSINESS_PARTNER_STATUSES.find((item) => item.value === status)?.label || '—'
}

export function createEmptyBusinessPartner() {
  return {
    companyName: '',
    debtorNumber: '',
    creditorNumber: '',
    timocomNumber: '',
    transeuNumber: '',
    dplNumber: '',
    pakiNumber: '',
    status: 'active',
    paymentTermDays: '',
    creditNoteProcedure: false,
    creditLimit: null,
    palletNote: '',
    crmStatus: '',
    potential: '',
    address: { street: '', houseNumber: '', postalCode: '', city: '', country: '' },
    contact: { phone: '', fax: '', email: '', website: '' },
    contacts: [],
    portals: [],
    companyData: { vatId: '', taxNumber: '', commercialRegisterNumber: '', registerCourt: '' },
  }
}

function createPayload(values) {
  return {
    companyName: trimValue(values.companyName),
    debtorNumber: trimValue(values.debtorNumber),
    creditorNumber: trimValue(values.creditorNumber),
    timocomNumber: trimValue(values.timocomNumber),
    transeuNumber: trimValue(values.transeuNumber),
    dplNumber: trimValue(values.dplNumber),
    pakiNumber: trimValue(values.pakiNumber),
    status: values.status,
    paymentTermDays: normalizeOptionalNonNegativeInteger(values.paymentTermDays, 'Zahlungsziel'),
    creditNoteProcedure: Boolean(values.creditNoteProcedure),
    creditLimit: normalizeOptionalNonNegativeNumber(values.creditLimit, 'Kreditlimit'),
    palletNote: trimValue(values.palletNote),
    crmStatus: trimValue(values.crmStatus),
    potential: trimValue(values.potential),
    address: Object.fromEntries(Object.entries(values.address).map(([key, value]) => [key, trimValue(value)])),
    contact: Object.fromEntries(Object.entries(values.contact).map(([key, value]) => [key, trimValue(value)])),
    contacts: (values.contacts ?? []).map((contact) => ({ id: contact.id, name: trimValue(contact.name), department: contact.department, departmentOther: trimValue(contact.departmentOther), phone: trimValue(contact.phone), mobile: trimValue(contact.mobile), email: trimValue(contact.email) })),
    portals: (values.portals ?? []).map((portal) => ({ id: portal.id, name: trimValue(portal.name), url: trimValue(portal.url), username: trimValue(portal.username), password: trimValue(portal.password), purpose: trimValue(portal.purpose) })),
    companyData: Object.fromEntries(Object.entries(values.companyData).map(([key, value]) => [key, trimValue(value)])),
  }
}

function mapSnapshot(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

export async function listBusinessPartners() {
  const snapshot = await getDocs(query(businessPartnersRef, orderBy('companyName')))
  return snapshot.docs.map(mapSnapshot)
}

export async function getBusinessPartner(partnerId) {
  const snapshot = await getDoc(doc(db, BUSINESS_PARTNERS_COLLECTION, partnerId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function createBusinessPartner(values) {
  const partnerRef = doc(businessPartnersRef)
  await setDoc(partnerRef, {
    id: partnerRef.id,
    ...createPayload(values),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return partnerRef.id
}

function formatCurrency(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
}

function changed(left, right) {
  return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null)
}

function createBusinessPartnerHistoryEntries(previous, next, actor) {
  const entries = []
  const entry = (category, summary, metadata = {}) => entries.push({ category, action: 'updated', summary, metadata, actor })

  if (changed(previous.creditLimit, next.creditLimit)) entry('creditLimit', `Kreditlimit von ${formatCurrency(previous.creditLimit)} auf ${formatCurrency(next.creditLimit)} geändert`, { oldValue: previous.creditLimit ?? null, newValue: next.creditLimit ?? null })
  if (changed(previous.crmStatus, next.crmStatus)) entry('crm', `CRM-Status von ${previous.crmStatus || '—'} auf ${next.crmStatus || '—'} geändert`, { field: 'crmStatus', oldValue: previous.crmStatus || null, newValue: next.crmStatus || null })
  if (changed(previous.potential, next.potential)) entry('crm', `Potenzial von ${previous.potential || '—'} auf ${next.potential || '—'} geändert`, { field: 'potential', oldValue: previous.potential || null, newValue: next.potential || null })
  if (changed(previous.address, next.address)) entry('masterData', 'Adresse geändert', { field: 'address' })
  if (changed(previous.contacts, next.contacts)) entry('contactPerson', 'Ansprechpartner geändert', { field: 'contacts' })
  if (changed(previous.paymentTermDays, next.paymentTermDays)) entry('paymentData', `Zahlungsziel von ${previous.paymentTermDays ?? '—'} auf ${next.paymentTermDays ?? '—'} Tage geändert`, { field: 'paymentTermDays', oldValue: previous.paymentTermDays ?? null, newValue: next.paymentTermDays ?? null })
  if (changed(previous.creditNoteProcedure, next.creditNoteProcedure)) entry('paymentData', `Gutschriftverfahren ${next.creditNoteProcedure ? 'aktiviert' : 'deaktiviert'}`, { field: 'creditNoteProcedure', oldValue: Boolean(previous.creditNoteProcedure), newValue: Boolean(next.creditNoteProcedure) })

  const masterDataFields = ['companyName', 'debtorNumber', 'creditorNumber', 'timocomNumber', 'transeuNumber', 'dplNumber', 'pakiNumber', 'status', 'contact', 'companyData', 'portals', 'palletNote']
  if (masterDataFields.some((field) => changed(previous[field], next[field]))) entry('masterData', 'Stammdaten geändert', { fields: masterDataFields.filter((field) => changed(previous[field], next[field])) })
  return entries
}

export async function updateBusinessPartner(partnerId, values, actor) {
  const partnerRef = doc(db, BUSINESS_PARTNERS_COLLECTION, partnerId)
  const previousSnapshot = await getDoc(partnerRef)
  if (!previousSnapshot.exists()) throw new Error('Geschäftspartner nicht gefunden')
  const next = createPayload(values)
  const entries = createBusinessPartnerHistoryEntries(previousSnapshot.data(), next, actor)
  const batch = writeBatch(db)
  batch.update(partnerRef, { ...next, updatedAt: serverTimestamp() })
  entries.forEach((entry) => batch.set(doc(collection(partnerRef, 'history')), createHistoryPayload(entry)))
  await batch.commit()
}

export async function updateBusinessPartnerCrmFields(partnerId, values, actor) {
  const current = await getBusinessPartner(partnerId)
  if (!current) throw new Error('Geschäftspartner nicht gefunden')
  await updateBusinessPartner(partnerId, { ...current, ...values }, actor)
}

export async function updateBusinessPartnerCreditLimit(partnerId, creditLimit, actor) {
  await updateBusinessPartnerCrmFields(partnerId, { creditLimit }, actor)
}

export async function updateBusinessPartnerPalletNote(partnerId, palletNote) {
  await updateBusinessPartnerCrmFields(partnerId, { palletNote })
}
