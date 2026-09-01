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

export const CASE_MODULES = {
  legal: {
    collection: 'legalCases',
    route: '/rechtsfaelle',
    title: 'Rechtsfälle',
    singular: 'Rechtsfall',
    referencePrefix: 'RF',
    statuses: ['Neu', 'Prüfung', 'Außergerichtlich', 'Beim Anwalt', 'Gerichtlich', 'Vergleich', 'Gewonnen', 'Verloren', 'Erledigt'],
    types: ['Streitfall', 'Anwalt', 'Gericht', 'Sonstiges'],
  },
  debtCollection: {
    collection: 'debtCollectionCases',
    route: '/inkassofaelle',
    title: 'Inkassofälle',
    singular: 'Inkassofall',
    referencePrefix: 'IF',
    statuses: ['Neu', 'Übergeben', 'In Bearbeitung', 'Zahlungsvereinbarung', 'Teilzahlung', 'Mahnverfahren', 'Vollstreckung', 'Uneinbringlich', 'Bezahlt', 'Erledigt'],
  },
  insurance: {
    collection: 'insuranceCases',
    route: '/versicherungsfaelle',
    title: 'Versicherungsfälle / Schäden',
    singular: 'Schaden',
    referencePrefix: 'SF',
    statuses: ['Neu', 'Prüfung', 'Unterlagen fehlen', 'Versicherung gemeldet', 'In Regulierung', 'Rückfrage', 'Anerkannt', 'Teilreguliert', 'Abgelehnt', 'Reguliert', 'Erledigt'],
  },
}

function createInternalReference(prefix) {
  const now = new Date()
  const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'), String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'), String(now.getSeconds()).padStart(2, '0')].join('')
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export function createEmptyCase(moduleKey) {
  const module = CASE_MODULES[moduleKey]
  const common = {
    internalReference: createInternalReference(module.referencePrefix),
    title: '',
    status: 'Neu',
    partnerId: '',
    deadline: { dueDate: '', type: '', note: '', completed: false },
  }

  if (moduleKey === 'legal') return { ...common, caseType: 'Streitfall', opponent: '', courtReference: '', lawyer: '', financial: { disputeValue: '', ownClaim: '', opposingClaim: '', lawyerCosts: '', courtCosts: '', otherCosts: '' }, progress: '' }
  if (moduleKey === 'debtCollection') return { ...common, debtor: '', debtorReference: '', collectionAgency: '', financial: { principalAmount: '', additionalClaims: '', collectionCosts: '', paidAmount: '' }, progress: '' }
  return { ...common, damageDate: '', tourReference: '', damageType: '', description: '', insurer: '', policyNumber: '', externalReference: '', contactPerson: '', financial: { claimedAmount: '', recognizedAmount: '', settledAmount: '', deductible: '' }, progress: '' }
}

const trim = (value) => (value ?? '').trim()
const decimal = (value) => value === '' || value === null || value === undefined ? null : Number(value)

function cleanedFinancial(financial) {
  return Object.fromEntries(Object.entries(financial).map(([key, value]) => [key, decimal(value)]))
}

function total(values) {
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0)
}

function createPayload(moduleKey, values) {
  const { deadline = {}, financial = {} } = values
  const dueDate = trim(deadline.dueDate)
  const deadlineItem = dueDate ? { dueDate, type: trim(deadline.type), note: trim(deadline.note), completed: Boolean(deadline.completed) } : null
  const payload = {
    internalReference: trim(values.internalReference),
    title: trim(values.title),
    status: values.status,
    partnerId: values.partnerId || null,
    nextDueDate: deadlineItem && !deadlineItem.completed ? deadlineItem.dueDate : null,
    deadlines: deadlineItem ? [deadlineItem] : [],
    progress: trim(values.progress),
  }

  if (moduleKey === 'legal') {
    const costs = total([financial.lawyerCosts, financial.courtCosts, financial.otherCosts])
    return { ...payload, caseType: values.caseType, opponent: trim(values.opponent), courtReference: trim(values.courtReference), lawyer: trim(values.lawyer), financial: { ...cleanedFinancial(financial), totalCosts: costs } }
  }
  if (moduleKey === 'debtCollection') {
    const outstandingAmount = total([financial.principalAmount, financial.additionalClaims, financial.collectionCosts]) - (Number(financial.paidAmount) || 0)
    return { ...payload, debtor: trim(values.debtor), debtorReference: trim(values.debtorReference), collectionAgency: trim(values.collectionAgency), financial: { ...cleanedFinancial(financial), outstandingAmount } }
  }
  const remainingDamage = (Number(financial.claimedAmount) || 0) - (Number(financial.settledAmount) || 0) - (Number(financial.deductible) || 0)
  return { ...payload, damageDate: trim(values.damageDate), tourReference: trim(values.tourReference), damageType: trim(values.damageType), description: trim(values.description), insurer: trim(values.insurer), policyNumber: trim(values.policyNumber), externalReference: trim(values.externalReference), contactPerson: trim(values.contactPerson), financial: { ...cleanedFinancial(financial), remainingDamage } }
}

function mapSnapshot(snapshot) {
  const data = snapshot.data()
  const deadline = data.deadlines?.[0] ?? { dueDate: '', type: '', note: '', completed: false }
  return { id: snapshot.id, ...data, financial: data.financial ?? {}, deadline: { dueDate: deadline.dueDate ?? '', type: deadline.type ?? '', note: deadline.note ?? '', completed: Boolean(deadline.completed) } }
}

function collectionRef(moduleKey) {
  return collection(db, CASE_MODULES[moduleKey].collection)
}

export async function listCases(moduleKey) {
  const snapshot = await getDocs(query(collectionRef(moduleKey), orderBy('createdAt', 'desc')))
  return snapshot.docs.map(mapSnapshot)
}

export async function getCase(moduleKey, caseId) {
  const snapshot = await getDoc(doc(db, CASE_MODULES[moduleKey].collection, caseId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function createCase(moduleKey, values) {
  const caseRef = doc(collectionRef(moduleKey))
  await setDoc(caseRef, { id: caseRef.id, ...createPayload(moduleKey, values), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return caseRef.id
}

export async function updateCase(moduleKey, caseId, values) {
  await updateDoc(doc(db, CASE_MODULES[moduleKey].collection, caseId), { ...createPayload(moduleKey, values), updatedAt: serverTimestamp() })
}
