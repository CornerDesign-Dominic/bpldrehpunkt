import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase.js'

export const EMPLOYEES_COLLECTION = 'employees'
export const ABSENCES_COLLECTION = 'absences'
export const DEPARTMENTS = ['Buchhaltung', 'Dispo Express', 'Dispo Transport']
export const ABSENCE_TYPES = [
  { value: 'vacation', label: 'Urlaub' }, { value: 'free', label: 'Frei' }, { value: 'sick', label: 'Krankheit' },
  { value: 'special_leave', label: 'Sonderurlaub' }, { value: 'business', label: 'Dienstlich abwesend' }, { value: 'other', label: 'Sonstiges' },
]
export const ABSENCE_STATUSES = [{ value: 'approved', label: 'Genehmigt' }, { value: 'requested', label: 'Beantragt' }, { value: 'rejected', label: 'Abgelehnt' }]
const employeesRef = collection(db, EMPLOYEES_COLLECTION)
const absencesRef = collection(db, ABSENCES_COLLECTION)
const trim = (value) => (value ?? '').trim()
const today = () => new Date().toISOString().slice(0, 10)
const snapshotData = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })

function employeePayload(values) { return { firstName: trim(values.firstName), lastName: trim(values.lastName), department: values.department || DEPARTMENTS[0], role: trim(values.role), employmentStart: values.employmentStart || null, vacationAllowance: Number(values.vacationAllowance) || 0, status: values.status || 'active', userId: values.userId || null } }
function absencePayload(values) { return { employeeId: values.employeeId, type: values.type || 'vacation', startDate: values.startDate, endDate: values.endDate, halfDay: Boolean(values.halfDay), note: trim(values.note), status: values.status || 'approved', requestedBy: values.requestedBy || null, approvedBy: values.approvedBy || null, approvedAt: values.approvedAt || null, rejectedAt: values.rejectedAt || null } }

export function createEmptyEmployee() { return { firstName: '', lastName: '', department: DEPARTMENTS[0], role: '', employmentStart: today(), vacationAllowance: 30, status: 'active', userId: '' } }
export function createEmptyAbsence(employeeId = '') { return { employeeId, type: 'vacation', startDate: today(), endDate: today(), halfDay: false, note: '', status: 'approved', requestedBy: null, approvedBy: null, approvedAt: null, rejectedAt: null } }
export const getEmployeeName = (employee) => employee ? `${employee.firstName} ${employee.lastName}`.trim() : '—'
export const getAbsenceType = (type) => ABSENCE_TYPES.find((item) => item.value === type)?.label || 'Sonstiges'
export const getAbsenceStatus = (status) => ABSENCE_STATUSES.find((item) => item.value === status)?.label || '—'

export async function listEmployees() { const snapshot = await getDocs(employeesRef); return snapshot.docs.map(snapshotData).sort((a, b) => getEmployeeName(a).localeCompare(getEmployeeName(b), 'de')) }
export async function getEmployee(employeeId) { const snapshot = await getDoc(doc(db, EMPLOYEES_COLLECTION, employeeId)); return snapshot.exists() ? snapshotData(snapshot) : null }
export async function listAbsences() { const snapshot = await getDocs(absencesRef); return snapshot.docs.map(snapshotData).sort((a, b) => a.startDate.localeCompare(b.startDate)) }
export async function createEmployee(values) { const reference = doc(employeesRef); await setDoc(reference, { id: reference.id, ...employeePayload(values), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); return reference.id }
export async function updateEmployee(employeeId, values) { await updateDoc(doc(db, EMPLOYEES_COLLECTION, employeeId), { ...employeePayload(values), updatedAt: serverTimestamp() }) }
export async function createAbsence(values) { const reference = doc(absencesRef); await setDoc(reference, { id: reference.id, ...absencePayload(values), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); return reference.id }

export function businessDays(startDate, endDate, halfDay = false) { let days = 0; const day = new Date(`${startDate}T12:00:00`); const end = new Date(`${endDate}T12:00:00`); while (day <= end) { const weekDay = day.getDay(); if (weekDay !== 0 && weekDay !== 6) days += 1; day.setDate(day.getDate() + 1) } return Math.max(0, days - (halfDay ? 0.5 : 0)) }
export function absenceOverlaps(absence, startDate, endDate) { return absence.endDate >= startDate && absence.startDate <= endDate && absence.status === 'approved' }
export function vacationSummary(employee, absences, date = today()) { const vacation = absences.filter((absence) => absence.employeeId === employee.id && absence.type === 'vacation' && absence.status === 'approved'); const taken = vacation.filter((absence) => absence.endDate < date).reduce((sum, absence) => sum + businessDays(absence.startDate, absence.endDate, absence.halfDay), 0); const planned = vacation.filter((absence) => absence.endDate >= date).reduce((sum, absence) => sum + businessDays(absence.startDate, absence.endDate, absence.halfDay), 0); return { allowance: Number(employee.vacationAllowance) || 0, taken, planned, remaining: (Number(employee.vacationAllowance) || 0) - taken - planned } }
