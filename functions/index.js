import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

initializeApp()
const db = getFirestore()
const roles = new Set(['user', 'admin', 'superadmin'])
const levels = new Set(['none', 'view', 'edit'])
const modules = ['vacation', 'calendar', 'team', 'masterData', 'crm', 'pallets', 'news', 'documents', 'todos']
const normalFields = ['firstName', 'lastName', 'birthDate', 'phone', 'email', 'jobTitle', 'active', 'employmentStart', 'personnelNumber']

function permissions(value) { return Object.fromEntries(modules.map((module) => [module, levels.has(value?.[module]) ? value[module] : 'none'])) }
function profileFields(value) { return Object.fromEntries(normalFields.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])) }
async function vacationManagerFields(value, fallback = {}) {
  const vacationManager = value?.vacationManager === undefined ? fallback?.vacationManager === true : value.vacationManager === true
  const vacationManagerAllDepartments = vacationManager && (value?.vacationManagerAllDepartments === undefined ? fallback?.vacationManagerAllDepartments === true : value.vacationManagerAllDepartments === true)
  const requestedDepartments = value?.vacationManagerDepartments === undefined ? fallback?.vacationManagerDepartments : value.vacationManagerDepartments
  const vacationManagerDepartments = vacationManager && !vacationManagerAllDepartments && Array.isArray(requestedDepartments)
    ? [...new Set(requestedDepartments.filter((department) => typeof department === 'string' && department.trim()).map((department) => department.trim()))]
    : []
  const unchangedLegacyDepartments = JSON.stringify(vacationManagerDepartments) === JSON.stringify(fallback?.vacationManagerDepartments || [])
  if (value?.vacationManagerDepartments !== undefined && vacationManager && !vacationManagerAllDepartments && !unchangedLegacyDepartments) {
    if (vacationManagerDepartments.some((id) => id.includes('/'))) throw new HttpsError('invalid-argument', 'Eine ausgewählte Abteilung ist ungültig.')
    const selectedDepartments = await Promise.all(vacationManagerDepartments.map((id) => db.doc(`departments/${id}`).get()))
    if (selectedDepartments.some((department) => !department.exists || department.data().active === false)) throw new HttpsError('invalid-argument', 'Eine ausgewählte Abteilung ist nicht verfügbar.')
  }
  return { vacationManager, vacationManagerAllDepartments, vacationManagerDepartments }
}
function departmentName(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '' }
function normalizedDepartmentName(value) { return departmentName(value).toLocaleLowerCase('de-DE') }
async function ensureDepartment(name) {
  const cleanName = departmentName(name)
  if (!cleanName) return null
  const existing = await db.collection('departments').where('normalizedName', '==', normalizedDepartmentName(cleanName)).limit(1).get()
  if (!existing.empty) return { id: existing.docs[0].id, ...existing.docs[0].data() }
  const reference = db.collection('departments').doc()
  const department = { id: reference.id, name: cleanName, normalizedName: normalizedDepartmentName(cleanName), active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }
  await reference.set(department)
  return department
}
async function departmentFields(value, fallback = {}) {
  if (value?.departmentId === undefined) return { departmentId: fallback.departmentId || null, department: fallback.departmentName || fallback.department || '', departmentName: fallback.departmentName || fallback.department || '' }
  if (!value.departmentId) return { departmentId: null, department: '', departmentName: '' }
  if (typeof value.departmentId !== 'string' || value.departmentId.includes('/')) throw new HttpsError('invalid-argument', 'Die ausgewählte Abteilung ist ungültig.')
  const department = await db.doc(`departments/${value.departmentId}`).get()
  if (!department.exists || (department.data().active === false && department.id !== fallback.departmentId)) throw new HttpsError('invalid-argument', 'Die ausgewählte Abteilung ist nicht verfügbar.')
  return { departmentId: department.id, department: department.data().name, departmentName: department.data().name }
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
  const selectedDepartment = await departmentFields(data)
  const selectedVacationManagerFields = await vacationManagerFields(actor.role === 'superadmin' ? data : {})
  const user = await getAuth().createUser({ email: data.email, password: data.password, disabled: data.active === false })
  await getAuth().setCustomUserClaims(user.uid, { role })
  await db.doc(`users/${user.uid}`).set({ ...profileFields(data), ...selectedDepartment, email: data.email, active: data.active !== false, role, permissions: actor.role === 'superadmin' ? permissions(data.permissions) : permissions(), ...selectedVacationManagerFields, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
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
  const update = { ...profileFields(data), ...(await departmentFields(data, old)), updatedAt: FieldValue.serverTimestamp() }
  if (typeof data.email === 'string' && data.email.trim()) update.email = data.email.trim()
  if (actor.role === 'superadmin') { update.role = role; update.permissions = permissions(data.permissions); Object.assign(update, await vacationManagerFields(data, old)) }
  await ref.update(update)
  await getAuth().updateUser(uid, { email: data.email ?? old.email, disabled: data.active === false, ...(data.password ? { password: data.password } : {}) })
  if (actor.role === 'superadmin') await getAuth().setCustomUserClaims(uid, { role })
  return { uid }
})

async function assertSuperadmin(request) {
  const actor = await assertManager(request)
  if (actor.role !== 'superadmin') throw new HttpsError('permission-denied', 'Keine Berechtigung zur Abteilungsverwaltung.')
  return actor
}

export const migrateLegacyDepartments = onCall({ region: 'europe-west3' }, async (request) => {
  await assertSuperadmin(request)
  const users = await db.collection('users').get()
  let migratedUsers = 0
  for (const user of users.docs) {
    const data = user.data()
    const update = {}
    if (!data.departmentId && departmentName(data.department)) {
      const department = await ensureDepartment(data.department)
      update.departmentId = department.id
      update.department = department.name
      update.departmentName = department.name
    }
    if (Array.isArray(data.vacationManagerDepartments)) {
      const mapped = []
      for (const departmentValue of data.vacationManagerDepartments) {
        if (typeof departmentValue !== 'string' || !departmentValue.trim()) continue
        const byId = departmentValue.includes('/') ? null : await db.doc(`departments/${departmentValue}`).get()
        mapped.push(byId?.exists ? byId.id : (await ensureDepartment(departmentValue)).id)
      }
      const uniqueMapped = [...new Set(mapped)]
      if (JSON.stringify(uniqueMapped) !== JSON.stringify(data.vacationManagerDepartments)) update.vacationManagerDepartments = uniqueMapped
    }
    if (Object.keys(update).length) {
      update.updatedAt = FieldValue.serverTimestamp()
      await user.ref.update(update)
      migratedUsers += 1
    }
  }
  return { migratedUsers }
})

export const createDepartment = onCall({ region: 'europe-west3' }, async (request) => {
  await assertSuperadmin(request)
  const name = departmentName(request.data?.name)
  if (!name) throw new HttpsError('invalid-argument', 'Der Abteilungsname ist erforderlich.')
  const existing = await db.collection('departments').where('normalizedName', '==', normalizedDepartmentName(name)).limit(1).get()
  if (!existing.empty) throw new HttpsError('already-exists', 'Diese Abteilung existiert bereits.')
  const reference = db.collection('departments').doc()
  await reference.set({ id: reference.id, name, normalizedName: normalizedDepartmentName(name), active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  return { id: reference.id }
})

export const updateDepartment = onCall({ region: 'europe-west3' }, async (request) => {
  await assertSuperadmin(request)
  const { id, name, active } = request.data ?? {}
  if (typeof id !== 'string' || id.includes('/')) throw new HttpsError('invalid-argument', 'Abteilungs-ID fehlt.')
  const reference = db.doc(`departments/${id}`)
  const current = await reference.get()
  if (!current.exists) throw new HttpsError('not-found', 'Abteilung nicht gefunden.')
  const update = { updatedAt: FieldValue.serverTimestamp() }
  if (name !== undefined) {
    const cleanName = departmentName(name)
    if (!cleanName) throw new HttpsError('invalid-argument', 'Der Abteilungsname ist erforderlich.')
    const duplicate = await db.collection('departments').where('normalizedName', '==', normalizedDepartmentName(cleanName)).limit(1).get()
    if (!duplicate.empty && duplicate.docs[0].id !== id) throw new HttpsError('already-exists', 'Diese Abteilung existiert bereits.')
    update.name = cleanName
    update.normalizedName = normalizedDepartmentName(cleanName)
  }
  if (typeof active === 'boolean') update.active = active
  await reference.update(update)
  if (update.name) {
    const users = await db.collection('users').where('departmentId', '==', id).get()
    await Promise.all(users.docs.map((user) => user.ref.update({ department: update.name, departmentName: update.name, updatedAt: FieldValue.serverTimestamp() })))
  }
  return { id }
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
  if (!employee.exists || !canManageVacationDepartment(profile, employee.data().departmentId || employee.data().department || '')) throw new HttpsError('permission-denied', 'Keine Zuständigkeit für diesen Urlaubsantrag.')
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
  const [requestSnapshot, employeeSnapshot, holidaySnapshot, blockSnapshot] = await Promise.all([db.collection('vacationRequests').get(), db.collection('users').get(), db.collection('calendarHolidays').get(), db.collection('vacationBlocks').get()])
  const employees = new Map(employeeSnapshot.docs.map((item) => [item.id, item.data()]))
  const managedEmployees = employeeSnapshot.docs
    .filter((item) => canManageVacationDepartment(manager, item.data().departmentId || item.data().department || ''))
    .map((item) => {
      const employee = item.data()
      return { id: item.id, name: [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() || employee.email || '—', department: employee.departmentName || employee.department || 'Keine Abteilung', departmentId: employee.departmentId || employee.department || '' }
    })
  const requests = requestSnapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => canManageVacationDepartment(manager, employees.get(item.userId)?.departmentId || employees.get(item.userId)?.department || ''))
    .map((item) => {
      const employee = employees.get(item.userId) || {}
      return { ...item, employeeName: [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() || employee.email || '—', employeeEmail: employee.email || '', employeeDepartment: employee.departmentName || employee.department || '—', employeeDepartmentId: employee.departmentId || employee.department || '', requestType: requestType(item), submittedAt: submittedAt(item) }
    })
  const calendarItems = (snapshot, fallbackLabel) => snapshot.docs.map((item) => {
    const data = item.data()
    const startDate = data.startDate || data.date || ''
    const endDate = data.endDate || data.date || startDate
    return { id: item.id, ...data, startDate, endDate, label: departmentName(data.label || data.name) || fallbackLabel }
  }).filter((item) => item.startDate && item.endDate)
  return { requests, employees: managedEmployees, holidays: calendarItems(holidaySnapshot, 'Feiertag'), blocks: calendarItems(blockSnapshot, 'Urlaubssperre') }
})

export const processVacationRequest = onCall({ region: 'europe-west3' }, async (request) => {
  const manager = await assertVacationManager(request)
  const { requestId, decision, managerComment } = request.data ?? {}
  if (typeof requestId !== 'string' || !['approved', 'rejected'].includes(decision)) throw new HttpsError('invalid-argument', 'Ungültige Bearbeitungsdaten.')
  if (managerComment !== undefined && typeof managerComment !== 'string') throw new HttpsError('invalid-argument', 'Ungültige Bearbeitungsdaten.')
  const { requestRef, vacationRequest } = await managedVacationRequest(manager, requestId)
  if (!['pending', 'change_requested', 'cancellation_requested'].includes(vacationRequest.data().status)) throw new HttpsError('failed-precondition', 'Der Urlaubsantrag wurde bereits bearbeitet.')
  const processed = { status: decision, managerComment: (managerComment || '').trim(), processedBy: request.auth.uid, processedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), ...(decision === 'approved' ? { approvedBy: request.auth.uid } : { rejectedBy: request.auth.uid }) }
  await requestRef.update(processed)
  return { requestId, status: decision }
})
