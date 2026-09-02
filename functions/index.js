import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

initializeApp()
const db = getFirestore()
const roles = new Set(['user', 'admin', 'superadmin'])
const levels = new Set(['none', 'view', 'edit'])
const modules = ['vacation', 'team', 'masterData', 'crm', 'pallets', 'news', 'documents', 'todos']
const normalFields = ['firstName', 'lastName', 'birthDate', 'phone', 'email', 'jobTitle', 'department', 'active', 'employmentStart', 'personnelNumber']

function permissions(value) { return Object.fromEntries(modules.map((module) => [module, levels.has(value?.[module]) ? value[module] : 'none'])) }
function profileFields(value) { return Object.fromEntries(normalFields.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])) }
function vacationManagerFields(value) {
  const vacationManager = value?.vacationManager === true
  const vacationManagerAllDepartments = vacationManager && value?.vacationManagerAllDepartments === true
  const vacationManagerDepartments = vacationManager && !vacationManagerAllDepartments && Array.isArray(value?.vacationManagerDepartments)
    ? [...new Set(value.vacationManagerDepartments.filter((department) => typeof department === 'string' && department.trim()).map((department) => department.trim()))]
    : []
  return { vacationManager, vacationManagerAllDepartments, vacationManagerDepartments }
}
async function callerProfile(uid) { return (await db.doc(`users/${uid}`).get()).data() }
async function assertManager(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.')
  const profile = await callerProfile(request.auth.uid)
  if (!['admin', 'superadmin'].includes(profile?.role)) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Benutzerverwaltung.')
  return profile
}

export const createManagedUser = onCall({ region: 'europe-west3' }, async (request) => {
  const actor = await assertManager(request)
  const data = request.data ?? {}
  if (!data.email || !data.password || !data.firstName || !data.lastName) throw new HttpsError('invalid-argument', 'Name, E-Mail und Initialpasswort sind erforderlich.')
  if (data.password.length < 8) throw new HttpsError('invalid-argument', 'Das Initialpasswort muss mindestens 8 Zeichen enthalten.')
  const role = actor.role === 'superadmin' && roles.has(data.role) ? data.role : 'user'
  const user = await getAuth().createUser({ email: data.email, password: data.password, disabled: data.active === false })
  await getAuth().setCustomUserClaims(user.uid, { role })
  await db.doc(`users/${user.uid}`).set({ ...profileFields(data), email: data.email, active: data.active !== false, role, permissions: actor.role === 'superadmin' ? permissions(data.permissions) : permissions(), ...vacationManagerFields(actor.role === 'superadmin' ? data : {}), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  return { uid: user.uid }
})

export const updateManagedUser = onCall({ region: 'europe-west3' }, async (request) => {
  const actor = await assertManager(request)
  const { uid, ...data } = request.data ?? {}
  if (!uid) throw new HttpsError('invalid-argument', 'Benutzer-ID fehlt.')
  const ref = db.doc(`users/${uid}`); const target = await ref.get()
  if (!target.exists) throw new HttpsError('not-found', 'Benutzerprofil nicht gefunden.')
  const old = target.data()
  if (actor.role !== 'superadmin' && old.role !== 'user') throw new HttpsError('permission-denied', 'Admins dürfen keine privilegierten Konten verwalten.')
  const role = actor.role === 'superadmin' && roles.has(data.role) ? data.role : old.role
  if (data.password && data.password.length < 8) throw new HttpsError('invalid-argument', 'Das neue Passwort muss mindestens 8 Zeichen enthalten.')
  const update = { ...profileFields(data), updatedAt: FieldValue.serverTimestamp() }
  if (actor.role === 'superadmin') { update.role = role; update.permissions = permissions(data.permissions); Object.assign(update, vacationManagerFields(data)) }
  await ref.update(update)
  await getAuth().updateUser(uid, { email: data.email ?? old.email, disabled: data.active === false, ...(data.password ? { password: data.password } : {}) })
  if (actor.role === 'superadmin') await getAuth().setCustomUserClaims(uid, { role })
  return { uid }
})

function isVacationManager(profile) { return profile?.role === 'superadmin' || profile?.vacationManager === true }
function canManageVacationDepartment(profile, department) {
  return profile?.role === 'superadmin'
    || (profile?.vacationManager === true && (profile.vacationManagerAllDepartments === true || (Array.isArray(profile.vacationManagerDepartments) && profile.vacationManagerDepartments.includes(department))))
}
async function assertVacationManager(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.')
  const profile = await callerProfile(request.auth.uid)
  if (!isVacationManager(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Urlaubsmanagement.')
  return profile
}
async function managedVacationRequest(profile, requestId) {
  const requestRef = db.doc(`vacationRequests/${requestId}`)
  const vacationRequest = await requestRef.get()
  if (!vacationRequest.exists) throw new HttpsError('not-found', 'Urlaubsantrag nicht gefunden.')
  const employee = await db.doc(`users/${vacationRequest.data().userId}`).get()
  if (!employee.exists || !canManageVacationDepartment(profile, employee.data().department || '')) throw new HttpsError('permission-denied', 'Keine Zuständigkeit für diesen Urlaubsantrag.')
  return { requestRef, vacationRequest, employee }
}
function requestType(data) {
  if (data.requestKind === 'cancellation' || data.cancellationRequest) return 'cancellation'
  return data.originalRequestId ? 'change' : 'request'
}
function submittedAt(data) {
  const date = data.createdAt?.toDate?.()
  return date ? date.toISOString() : null
}

export const listManagedVacationRequests = onCall({ region: 'europe-west3' }, async (request) => {
  const manager = await assertVacationManager(request)
  const [requestSnapshot, employeeSnapshot] = await Promise.all([db.collection('vacationRequests').get(), db.collection('users').get()])
  const employees = new Map(employeeSnapshot.docs.map((item) => [item.id, item.data()]))
  const requests = requestSnapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => canManageVacationDepartment(manager, employees.get(item.userId)?.department || ''))
    .map((item) => {
      const employee = employees.get(item.userId) || {}
      return { ...item, employeeName: [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() || employee.email || '—', employeeDepartment: employee.department || '—', requestType: requestType(item), submittedAt: submittedAt(item) }
    })
  return { requests }
})

export const processVacationRequest = onCall({ region: 'europe-west3' }, async (request) => {
  const manager = await assertVacationManager(request)
  const { requestId, decision } = request.data ?? {}
  if (typeof requestId !== 'string' || !['approved', 'rejected'].includes(decision)) throw new HttpsError('invalid-argument', 'Ungültige Bearbeitungsdaten.')
  const { requestRef, vacationRequest } = await managedVacationRequest(manager, requestId)
  if (!['pending', 'change_requested', 'cancellation_requested'].includes(vacationRequest.data().status)) throw new HttpsError('failed-precondition', 'Der Urlaubsantrag wurde bereits bearbeitet.')
  const processed = { status: decision, processedBy: request.auth.uid, processedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), ...(decision === 'approved' ? { approvedBy: request.auth.uid } : { rejectedBy: request.auth.uid }) }
  await requestRef.update(processed)
  return { requestId, status: decision }
})
