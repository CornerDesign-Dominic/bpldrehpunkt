import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  runTransaction,
  writeBatch,
} from 'firebase/firestore'
import { auth, db } from './firebase.js'
import { businessPartnerHistoryChanges } from '../../shared/businessPartnerHistory.js'
import { createHistoryPayload } from './partnerHistory.js'
import { paymentTermText } from './paymentTerms.js'
import { crmIndustryValue } from './crmIndustry.js'
import { normalizeShipmentTrackingPolicy } from './shipmentTrackingPolicy.js'
import { businessPartnerRoleLabel, businessPartnerRoles } from '../../shared/businessPartnerRoles.js'
import { newBusinessPartnerShipmentTrackingPolicy } from './newBusinessPartnerShipmentTrackingPolicy.js'
export { getPartnerCluster } from './partnerClusterQueries.js'

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

function explicitBusinessPartnerRoles(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((role) => role === 'customer' || role === 'carrier'))]
}

export function getBusinessPartnerType(partner = {}) {
  return businessPartnerRoleLabel(partner)
}

export function getBusinessPartnerRoles(partner = {}) {
  return businessPartnerRoles(partner)
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
    crmIndustry: '',
    potential: '',
    businessPartnerRoles: [],
    address: { street: '', houseNumber: '', postalCode: '', city: '', country: '' },
    contact: { phone: '', fax: '', email: '', website: '' },
    contacts: [],
    portals: [],
    companyData: { vatId: '', taxNumber: '', commercialRegisterNumber: '', registerCourt: '' },
  }
}

export function normalizePartnerPortal(portal = {}) {
  const { password: legacyAccessNumber, ...normalizedPortal } = portal
  return {
    ...normalizedPortal,
    accessNumber: portal.accessNumber ?? legacyAccessNumber ?? '',
  }
}

function createPayload(values, { isNew = false, ruleCatalog = null } = {}) {
  const shipmentTrackingPolicy = isNew
    ? newBusinessPartnerShipmentTrackingPolicy(values, ruleCatalog)
    : normalizeShipmentTrackingPolicy(values.shipmentTrackingPolicy)
  return {
    companyName: trimValue(values.companyName),
    debtorNumber: trimValue(values.debtorNumber),
    creditorNumber: trimValue(values.creditorNumber),
    timocomNumber: trimValue(values.timocomNumber),
    transeuNumber: trimValue(values.transeuNumber),
    dplNumber: trimValue(values.dplNumber),
    pakiNumber: trimValue(values.pakiNumber),
    status: values.status,
    paymentTermDays: paymentTermText(values),
    creditNoteProcedure: Boolean(values.creditNoteProcedure),
    creditLimit: normalizeOptionalNonNegativeNumber(values.creditLimit, 'Kreditlimit'),
    palletNote: trimValue(values.palletNote),
    crmStatus: trimValue(values.crmStatus),
    crmIndustry: trimValue(crmIndustryValue(values)),
    potential: trimValue(values.potential),
    ...(isNew ? { businessPartnerRoles: explicitBusinessPartnerRoles(values.businessPartnerRoles) } : {}),
    shipmentTrackingPolicy,
    address: Object.fromEntries(Object.entries(values.address).map(([key, value]) => [key, trimValue(value)])),
    contact: Object.fromEntries(Object.entries(values.contact).map(([key, value]) => [key, trimValue(value)])),
    contacts: (values.contacts ?? []).map((contact) => ({ id: contact.id, name: trimValue(contact.name), department: contact.department, departmentOther: trimValue(contact.departmentOther), phone: trimValue(contact.phone), mobile: trimValue(contact.mobile), email: trimValue(contact.email) })),
    portals: (values.portals ?? []).map((portal) => {
      const normalizedPortal = normalizePartnerPortal(portal)
      return { id: normalizedPortal.id, name: trimValue(normalizedPortal.name), url: trimValue(normalizedPortal.url), username: trimValue(normalizedPortal.username), accessNumber: trimValue(normalizedPortal.accessNumber), purpose: trimValue(normalizedPortal.purpose) }
    }),
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

export async function getEffectiveBusinessPartner(partnerId) {
  if (!partnerId) return null
  const visited = new Set()
  let current = await getBusinessPartner(partnerId)
  while (current?.mergedIntoPartnerId) {
    if (visited.has(current.id) || current.mergedIntoPartnerId === current.id) throw new Error('Zyklische Partner-Weiterleitung.')
    visited.add(current.id)
    current = await getBusinessPartner(current.mergedIntoPartnerId)
    if (!current) throw new Error('Weiterleitungsziel nicht vorhanden.')
  }
  if (current?.status === 'merged') throw new Error('Archivierter Partner ohne Zielpartner.')
  return current
}


function historyActor(actor) {
  const user = auth.currentUser
  return { id: actor?.id || user?.uid || null, name: actor?.name || user?.displayName || user?.email || null }
}

export async function createBusinessPartner(values, ruleCatalog = null, actor) {
  const partnerRef = doc(businessPartnersRef)
  const recordedBy = historyActor(actor)
  const batch = writeBatch(db)
  batch.set(partnerRef, {
    id: partnerRef.id, ...createPayload(values, { isNew: true, ruleCatalog }),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    createdByUserId: recordedBy.id, createdByName: recordedBy.name,
  })
  batch.set(doc(collection(partnerRef, 'history')), createHistoryPayload({ category: 'masterData', action: 'created', summary: 'Stammdatenblatt angelegt', actor: recordedBy }))
  await batch.commit()
  return partnerRef.id
}

export async function updateBusinessPartner(partnerId, values, actor) {
  const partnerRef = doc(db, BUSINESS_PARTNERS_COLLECTION, partnerId)
  const recordedBy = historyActor(actor)
  const next = createPayload(values)
  const operationId = crypto.randomUUID()
  await runTransaction(db, async (transaction) => {
    const previousSnapshot = await transaction.get(partnerRef)
    if (!previousSnapshot.exists()) throw new Error('Geschäftspartner nicht gefunden')
    const previous = previousSnapshot.data()
    const comparable = { ...previous, paymentTermDays: paymentTermText(previous), crmIndustry: crmIndustryValue(previous), shipmentTrackingPolicy: normalizeShipmentTrackingPolicy(previous.shipmentTrackingPolicy) }
    const changes = businessPartnerHistoryChanges(comparable, next)
    if (!changes.length) return
    transaction.update(partnerRef, { ...next, updatedAt: serverTimestamp() })
    for (const category of new Set(changes.map((change) => change.category))) {
      const selected = changes.filter((change) => change.category === category)
      const summaries = { creditLimit: 'Kreditlimit geändert', crm: 'CRM-Daten geändert', contactPerson: 'Ansprechpartner geändert', paymentData: 'Zahlungsdaten geändert', shipmentTrackingPolicy: 'Sendungsverfolgung-Einstellungen geändert' }
      let summary = summaries[category] || 'Stammdaten geändert'
      if (selected.length === 1 && ['creditLimit', 'crm', 'paymentData'].includes(category)) {
        const change = selected[0]
        const shown = (value) => value === null ? '—' : typeof value === 'boolean' ? value ? 'Ja' : 'Nein' : category === 'creditLimit' ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value) : String(value)
        summary = `${change.label}: ${shown(change.oldValue)} → ${shown(change.newValue)}`
      }
      transaction.set(doc(collection(partnerRef, 'history')), createHistoryPayload({ category, action: 'updated', summary, metadata: { operationId, changes: selected }, actor: recordedBy }))
    }
  })
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
