import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
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

const damageCasesRef = collection(db, DAMAGE_CASES_COLLECTION)
const statusByValue = new Map(DAMAGE_CASE_STATUSES.map((status) => [status.value, status.label]))

const trim = (value) => typeof value === 'string' ? value.trim() : ''
const optionalText = (value) => trim(value) || null
const optionalAmount = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Die Schadenhöhe muss eine positive Zahl sein.')
  return amount
}

function mapSnapshot(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

function payload(values, responsibleUsersById) {
  const responsibleUserId = optionalText(values.responsibleUserId)
  const responsibleUser = responsibleUserId ? responsibleUsersById.get(responsibleUserId) : null
  if (responsibleUserId && !responsibleUser) throw new Error('Die verantwortliche Person ist nicht verfügbar.')
  const status = DAMAGE_CASE_STATUSES.some((item) => item.value === values.status) ? values.status : 'new'
  const title = trim(values.title)
  const damageDate = trim(values.damageDate)
  const damageType = trim(values.damageType)
  if (!title || !damageDate || !damageType) throw new Error('Bitte Schadendatum, Kurzbezeichnung und Schadenart erfassen.')
  return {
    status,
    damageDate,
    title,
    description: optionalText(values.description),
    damageType,
    transportReference: optionalText(values.transportReference),
    claimant: optionalText(values.claimant),
    contractor: optionalText(values.contractor),
    responsibleUserId,
    responsibleUserName: responsibleUser ? getUserDisplayName(responsibleUser, responsibleUser) : null,
    dueDate: optionalText(values.dueDate),
    damageAmount: optionalAmount(values.damageAmount),
  }
}

export function createEmptyDamageCase() {
  return {
    damageDate: new Date().toISOString().slice(0, 10),
    title: '', description: '', damageType: '', status: 'new', transportReference: '', claimant: '', contractor: '', responsibleUserId: '', dueDate: '', damageAmount: '',
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
      ...payload(values, responsibleUsersById),
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
  })
  return caseRef.id
}

export async function updateDamageCase(damageCase, values, actor, responsibleUsersById) {
  await updateDoc(doc(db, DAMAGE_CASES_COLLECTION, damageCase.id), {
    ...payload(values, responsibleUsersById),
    updatedAt: serverTimestamp(),
    updatedBy: actor.user.uid,
    updatedByName: getUserDisplayName(actor.profile, actor.user),
  })
}
