import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

export const BUSINESS_PARTNERS_COLLECTION = 'businessPartners'

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

export function createEmptyBusinessPartner() {
  return {
    companyName: '',
    shortName: '',
    debtorNumber: '',
    creditorNumber: '',
    timocomNumber: '',
    transeuNumber: '',
    status: 'active',
    paymentTermDays: '',
    creditNoteProcedure: false,
    creditLimit: null,
    address: { street: '', houseNumber: '', postalCode: '', city: '', country: '' },
    contact: { phone: '', email: '', website: '' },
    contacts: [],
    portals: [],
    companyData: { vatId: '', commercialRegisterNumber: '', registerCourt: '' },
  }
}

function createPayload(values) {
  return {
    companyName: trimValue(values.companyName),
    shortName: trimValue(values.shortName),
    debtorNumber: trimValue(values.debtorNumber),
    creditorNumber: trimValue(values.creditorNumber),
    timocomNumber: trimValue(values.timocomNumber),
    transeuNumber: trimValue(values.transeuNumber),
    status: values.status,
    paymentTermDays: normalizeOptionalNonNegativeInteger(values.paymentTermDays, 'Zahlungsziel'),
    creditNoteProcedure: Boolean(values.creditNoteProcedure),
    creditLimit: normalizeOptionalNonNegativeNumber(values.creditLimit, 'Kreditlimit'),
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

export async function updateBusinessPartner(partnerId, values) {
  await updateDoc(doc(db, BUSINESS_PARTNERS_COLLECTION, partnerId), {
    ...createPayload(values),
    updatedAt: serverTimestamp(),
  })
}

export async function updateBusinessPartnerCreditLimit(partnerId, creditLimit) {
  await updateDoc(doc(db, BUSINESS_PARTNERS_COLLECTION, partnerId), {
    creditLimit: normalizeOptionalNonNegativeNumber(creditLimit, 'Kreditlimit'),
    updatedAt: serverTimestamp(),
  })
}
