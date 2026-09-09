import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { getUserDisplayName } from './userProfiles.js'

export const DAMAGE_CASES_COLLECTION = 'damageCases'
export const DAMAGE_CASE_STATUSES = [
  { value: 'new', label: 'Neu' },
  { value: 'documents_missing', label: 'Unterlagen fehlen' },
  { value: 'insurance_reported', label: 'Versicherung gemeldet' },
  { value: 'in_settlement', label: 'In Regulierung' },
  { value: 'acknowledged', label: 'Anerkannt' },
  { value: 'partially_settled', label: 'Teilreguliert' },
  { value: 'rejected', label: 'Abgelehnt' },
  { value: 'settled', label: 'Reguliert' },
  { value: 'economically_closed', label: 'Wirtschaftlich erledigt' },
]
export const DAMAGE_CASE_TYPES = [
  { value: 'Bruchschaden', label: 'Bruchschaden' },
  { value: 'Verlustschaden', label: 'Verlustschaden' },
  { value: 'Verspätungsschaden', label: 'Verspätungsschaden' },
  { value: 'Temperaturschaden', label: 'Temperaturschaden' },
  { value: 'Nässe / Wasserschaden', label: 'Nässe / Wasserschaden' },
  { value: 'Diebstahl / Raub', label: 'Diebstahl / Raub' },
  { value: 'Sonstiger', label: 'Sonstiger' },
]
export const DAMAGE_LEGAL_BASES = [
  { value: 'cmr', label: 'CMR' },
  { value: 'national', label: 'National' },
  { value: 'goodwill', label: 'Kulanz' },
  { value: 'other', label: 'Sonstiges' },
]
export const DAMAGE_INSURANCE_RELEVANCE = [
  { value: 'yes', label: 'Ja' },
  { value: 'no', label: 'Nein' },
  { value: 'pending', label: 'Noch offen' },
]
export const DAMAGE_CONTRACTOR_LIABILITY = [
  { value: 'open', label: 'Offen' },
  { value: 'acknowledged', label: 'Anerkannt' },
  { value: 'rejected', label: 'Abgelehnt' },
  { value: 'partially_acknowledged', label: 'Teilweise anerkannt' },
]

const damageCasesRef = collection(db, DAMAGE_CASES_COLLECTION)
const statusByValue = new Map(DAMAGE_CASE_STATUSES.map((status) => [status.value, status.label]))

const trim = (value) => typeof value === 'string' ? value.trim() : ''
const optionalText = (value) => trim(value) || null
const optionalAmount = (value, label = 'Die Schadenhöhe') => {
  if (value === '' || value === null || value === undefined) return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} muss eine positive Zahl sein.`)
  return amount
}

function mapSnapshot(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

function optionalSelection(value, options) {
  return options.some((option) => option.value === value) ? value : null
}

function payload(values, responsibleUsersById, requireDamageType = false) {
  const responsibleUserId = optionalText(values.responsibleUserId)
  const responsibleUser = responsibleUserId ? responsibleUsersById.get(responsibleUserId) : null
  const responsibleUserName = responsibleUserId ? (responsibleUser ? getUserDisplayName(responsibleUser, responsibleUser) : optionalText(values.responsibleUserName)) : null
  if (responsibleUserId && !responsibleUserName) throw new Error('Die verantwortliche Person ist nicht verfügbar.')
  const status = DAMAGE_CASE_STATUSES.some((item) => item.value === values.status) ? values.status : 'new'
  const title = trim(values.title)
  const damageDate = trim(values.damageDate)
  const damageType = trim(values.damageType)
  if (!title || !damageDate || (requireDamageType && !damageType)) throw new Error('Bitte Schadendatum, Kurzbezeichnung und Schadenart erfassen.')
  return {
    status,
    damageDate,
    title,
    description: optionalText(values.description),
    damageType: damageType || null,
    transportReference: optionalText(values.transportReference),
    claimant: optionalText(values.claimant),
    claimantPartnerId: optionalText(values.claimantPartnerId),
    contractor: optionalText(values.contractor),
    contractorPartnerId: optionalText(values.contractorPartnerId),
    responsibleUserId,
    responsibleUserName,
    dueDate: optionalText(values.dueDate),
    damageAmount: optionalAmount(values.damageAmount),
    legalBasis: optionalSelection(values.legalBasis, DAMAGE_LEGAL_BASES),
    cargoWeightKg: optionalAmount(values.cargoWeightKg, 'Das Gewicht der Ware'),
    liabilityLimit: optionalAmount(values.liabilityLimit, 'Die Bemessungsgrenze'),
    insuranceRelevance: optionalSelection(values.insuranceRelevance, DAMAGE_INSURANCE_RELEVANCE),
    bplInsurance: optionalText(values.bplInsurance),
    bplInsuranceCaseNumber: optionalText(values.bplInsuranceCaseNumber),
    contractorInsurance: optionalText(values.contractorInsurance),
    contractorInsuranceCaseNumber: optionalText(values.contractorInsuranceCaseNumber),
    contractorLiability: optionalSelection(values.contractorLiability, DAMAGE_CONTRACTOR_LIABILITY),
    liabilityNote: optionalText(values.liabilityNote),
  }
}

export function createEmptyDamageCase() {
  return {
    damageDate: new Date().toISOString().slice(0, 10),
    title: '', description: '', damageType: '', status: 'new', transportReference: '', claimant: '', claimantPartnerId: '', contractor: '', contractorPartnerId: '', responsibleUserId: '', responsibleUserName: '', dueDate: '', damageAmount: '',
    legalBasis: '', cargoWeightKg: '', liabilityLimit: '', insuranceRelevance: '', bplInsurance: '', bplInsuranceCaseNumber: '', contractorInsurance: '', contractorInsuranceCaseNumber: '', contractorLiability: '', liabilityNote: '',
  }
}

export function damageCaseStatusLabel(status) {
  return statusByValue.get(status) || (status === 'completed' ? 'Erledigt' : status || '—')
}

export function isClosedDamageCase(damageCase) {
  return damageCase.status === 'economically_closed' || damageCase.status === 'completed'
}

export function damageDuePresentation(damageCase, now = new Date()) {
  if (!damageCase.dueDate || isClosedDamageCase(damageCase)) return { kind: 'none', label: 'Keine Frist', days: null }
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const due = new Date(`${damageCase.dueDate}T12:00:00`)
  const days = Math.round((due - today) / 86400000)
  if (days < 0) return { kind: 'overdue', label: `${Math.abs(days)} ${Math.abs(days) === 1 ? 'Tag' : 'Tage'} überfällig`, days }
  if (days === 0) return { kind: 'today', label: 'Heute', days }
  if (days <= 7) return { kind: 'soon', label: `In ${days} ${days === 1 ? 'Tag' : 'Tagen'}`, days }
  return { kind: 'none', label: 'Später', days }
}

export function sortDamageCases(cases) {
  const urgency = { overdue: 0, today: 1, soon: 2, none: 3 }
  return [...cases].sort((left, right) => {
    const dueDifference = urgency[damageDuePresentation(left).kind] - urgency[damageDuePresentation(right).kind]
    if (dueDifference) return dueDifference
    return (right.updatedAt?.seconds || 0) - (left.updatedAt?.seconds || 0)
  })
}

export async function listDamageCases() {
  const snapshots = await getDocs(query(damageCasesRef, orderBy('createdAt', 'desc')))
  return snapshots.docs.map(mapSnapshot)
}

export async function getDamageCase(damageCaseId) {
  const snapshot = await getDoc(doc(db, DAMAGE_CASES_COLLECTION, damageCaseId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function createDamageCase(values, actor, responsibleUsersById) {
  const year = String(new Date().getFullYear())
  const counterRef = doc(db, 'damageCaseCounters', year)
  const caseRef = doc(damageCasesRef)
  await runTransaction(db, async (transaction) => {
    const counter = await transaction.get(counterRef)
    const sequence = (counter.exists() ? Number(counter.data().nextNumber) || 0 : 0) + 1
    if (sequence > 9999) throw new Error(`Für ${year} können keine weiteren Fallnummern vergeben werden.`)
    transaction.set(counterRef, { year, nextNumber: sequence, updatedAt: serverTimestamp() })
    transaction.set(caseRef, {
      ...payload(values, responsibleUsersById, true),
      caseNumber: `S-${year}-${String(sequence).padStart(4, '0')}`,
      caseYear: year,
      caseSequence: sequence,
      openBplRisk: null,
      createdAt: serverTimestamp(),
      createdBy: actor.user.uid,
      createdByName: getUserDisplayName(actor.profile, actor.user),
      updatedAt: serverTimestamp(),
      updatedBy: actor.user.uid,
      updatedByName: getUserDisplayName(actor.profile, actor.user),
    })
    transaction.set(doc(collection(caseRef, 'updates')), damageUpdatePayload('system', 'Fall angelegt', actor))
  })
  return caseRef.id
}

export async function updateDamageCase(damageCase, values, actor, responsibleUsersById) {
  await updateDamageCaseFields(damageCase, values, actor, responsibleUsersById)
}

function damageUpdatePayload(type, text, actor) {
  return { type, text, createdByUserId: actor.user.uid, createdByName: getUserDisplayName(actor.profile, actor.user), createdAt: serverTimestamp() }
}

function changeMessages(previous, next) {
  const messages = []
  if (previous.status !== next.status) messages.push(`Status geändert: ${damageCaseStatusLabel(previous.status)} → ${damageCaseStatusLabel(next.status)}`)
  if ((previous.dueDate || null) !== (next.dueDate || null)) messages.push(next.dueDate ? `Frist geändert auf ${new Intl.DateTimeFormat('de-DE').format(new Date(`${next.dueDate}T12:00:00`))}` : 'Frist entfernt')
  return messages
}

function updateMetadata(actor) {
  return { updatedAt: serverTimestamp(), updatedBy: actor.user.uid, updatedByName: getUserDisplayName(actor.profile, actor.user) }
}

export async function updateDamageCaseFields(damageCase, changes, actor, responsibleUsersById, systemMessages = null) {
  const next = payload({ ...damageCase, ...changes }, responsibleUsersById)
  const changedFields = Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== (damageCase[key] ?? null)))
  if (!Object.keys(changedFields).length) return false
  const caseRef = doc(db, DAMAGE_CASES_COLLECTION, damageCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, { ...changedFields, ...updateMetadata(actor) })
  const messages = systemMessages === null ? changeMessages(damageCase, next) : (Array.isArray(systemMessages) ? systemMessages : [systemMessages])
  messages.filter(Boolean).forEach((text) => batch.set(doc(collection(caseRef, 'updates')), damageUpdatePayload('system', text, actor)))
  await batch.commit()
  return true
}

export async function listDamageCaseUpdates(damageCaseId) {
  return (await getDocs(query(collection(db, DAMAGE_CASES_COLLECTION, damageCaseId, 'updates'), orderBy('createdAt', 'desc')))).docs.map(mapSnapshot)
}

export async function addDamageCaseUpdate(damageCase, text, actor, responsibleUsersById) {
  const cleanText = trim(text)
  if (!cleanText) throw new Error('Bitte einen Update-Text eingeben.')
  if (cleanText.length > 1000) throw new Error('Das Update ist zu lang.')
  const caseRef = doc(db, DAMAGE_CASES_COLLECTION, damageCase.id)
  const batch = writeBatch(db)
  batch.update(caseRef, { ...payload(damageCase, responsibleUsersById), ...updateMetadata(actor) })
  batch.set(doc(collection(caseRef, 'updates')), damageUpdatePayload('note', cleanText, actor))
  await batch.commit()
}
