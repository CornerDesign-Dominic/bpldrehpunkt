import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { requireActiveProfile, requireRole } from './access.js'

if (!getApps().length) initializeApp()
const db = getFirestore()
const roles = new Set(['user', 'admin', 'superadmin'])
const levels = new Set(['none', 'view', 'edit'])
const modules = ['vacation', 'calendar', 'team', 'masterData', 'crm', 'pallets', 'news', 'documents', 'templates', 'todos']
const normalFields = ['firstName', 'lastName', 'birthDate', 'phone', 'email', 'jobTitle', 'active', 'employmentStart', 'personnelNumber']

function permissions(value) { return Object.fromEntries(modules.map((module) => [module, levels.has(value?.[module]) ? value[module] : 'none'])) }
function profileFields(value) { return Object.fromEntries(normalFields.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])) }
function passwordIsValid(value) { return typeof value === 'string' && value.length >= 6 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) }
const passwordRequirementMessage = 'Das Passwort muss mindestens 6 Zeichen sowie einen Großbuchstaben, einen Kleinbuchstaben und eine Zahl enthalten.'
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
async function assertManager(request) {
  return requireRole(await requireActiveProfile(request), ['admin', 'superadmin'], 'Keine Berechtigung zur Benutzerverwaltung.')
}

export const createManagedUser = onCall({ region: 'europe-west3' }, async (request) => {
  const actor = await assertManager(request)
  const data = request.data ?? {}
  if (!data.email || !data.password || !data.firstName || !data.lastName) throw new HttpsError('invalid-argument', 'Name, E-Mail und Initialpasswort sind erforderlich.')
  if (!passwordIsValid(data.password)) throw new HttpsError('invalid-argument', passwordRequirementMessage)
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
  if (data.password && !passwordIsValid(data.password)) throw new HttpsError('invalid-argument', passwordRequirementMessage)
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
  if (actor.role !== 'superadmin') throw new HttpsError('permission-denied', 'Diese Aktion ist nur für Superadmins erlaubt.')
  return actor
}

function requiredEvaluationNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new HttpsError('invalid-argument', `${label} muss eine gültige Zahl sein.`)
  return value
}

function partnerEvaluationSettings(value) {
  const pallets = value?.pallets ?? {}
  const creditLimit = value?.creditLimit ?? {}
  const ranking = value?.ranking ?? {}
  const settings = {
    pallets: { greenMax: requiredEvaluationNumber(pallets.greenMax, 'Paletten: Grün bis'), redMin: requiredEvaluationNumber(pallets.redMin, 'Paletten: Ab Rot') },
    creditLimit: { redMax: requiredEvaluationNumber(creditLimit.redMax, 'Kreditlimit: Rot bis'), yellowMax: requiredEvaluationNumber(creditLimit.yellowMax, 'Kreditlimit: Gelb bis') },
    ranking: { redMax: requiredEvaluationNumber(ranking.redMax, 'Ranking: Rot bis'), greenMin: requiredEvaluationNumber(ranking.greenMin, 'Ranking: Ab Grün') },
  }
  if (settings.pallets.greenMax < 0 || settings.pallets.redMin <= settings.pallets.greenMax) throw new HttpsError('invalid-argument', 'Die Paletten-Grenzen sind nicht eindeutig.')
  if (settings.creditLimit.redMax < 0 || settings.creditLimit.yellowMax <= settings.creditLimit.redMax) throw new HttpsError('invalid-argument', 'Die Kreditlimit-Grenzen sind nicht eindeutig.')
  if (settings.ranking.redMax < 0 || settings.ranking.redMax > 5 || settings.ranking.greenMin < 0 || settings.ranking.greenMin > 5 || settings.ranking.greenMin <= settings.ranking.redMax) throw new HttpsError('invalid-argument', 'Die Ranking-Grenzen müssen eindeutig zwischen 0 und 5 liegen.')
  return settings
}

export const updatePartnerEvaluationSettings = onCall({ region: 'europe-west3' }, async (request) => {
  await assertSuperadmin(request)
  const settings = partnerEvaluationSettings(request.data?.settings)
  await db.doc('appSettings/partnerEvaluation').set({ ...settings, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true })
  return { settings }
})

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
  const profile = await requireActiveProfile(request)
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
function vacationRootId(data, fallbackId) { return data?.vacationId || data?.originalRequestId || fallbackId }
function vacationRequestStatus(data) {
  if (['pending', 'approved', 'rejected', 'withdrawn'].includes(data?.requestStatus)) return data.requestStatus
  if (data?.status === 'change_requested' || data?.status === 'cancellation_requested') return 'pending'
  return ['pending', 'approved', 'rejected', 'withdrawn'].includes(data?.status) ? data.status : 'pending'
}
function historyEventType(data, status) {
  const kind = requestType(data)
  const label = kind === 'cancellation' ? 'cancellation' : kind === 'change' ? 'change' : 'vacation'
  return `${label}_${status}`
}
function writeVacationHistory(transaction, { id, vacationId, userId, eventType, status, createdBy, comment = '', requestId = null, previousValues = null, nextValues = null }) {
  const reference = db.collection('vacationHistory').doc(id)
  transaction.set(reference, { id, vacationId, userId, eventType, status, createdAt: FieldValue.serverTimestamp(), createdBy, ...(comment ? { comment } : {}), ...(requestId ? { requestId } : {}), ...(previousValues ? { previousValues } : {}), ...(nextValues ? { nextValues } : {}) }, { merge: false })
}

export const recordVacationCreated = onDocumentCreated({ region: 'europe-west3', document: 'vacationRequests/{requestId}' }, async (event) => {
  const data = event.data.data()
  const requestId = event.params.requestId
  const kind = requestType(data)
  const status = kind === 'request' ? (['pending', 'approved', 'rejected', 'cancelled', 'withdrawn'].includes(data.mainStatus || data.status) ? data.mainStatus || data.status : 'pending') : vacationRequestStatus(data)
  await db.collection('vacationHistory').doc(`created-${requestId}`).set({ id: `created-${requestId}`, vacationId: vacationRootId(data, requestId), userId: data.userId, eventType: historyEventType(data, status), status, createdAt: FieldValue.serverTimestamp(), createdBy: data.userId, requestId })
})

export const listManagedVacationRequests = onCall({ region: 'europe-west3' }, async (request) => {
  const manager = await assertVacationManager(request)
  const [requestSnapshot, employeeSnapshot, holidaySnapshot, blockSnapshot] = await Promise.all([db.collection('vacationRequests').get(), db.collection('users').get(), db.collection('calendarHolidays').get(), db.collection('vacationBlocks').get()])
  let historySnapshot = null
  try {
    historySnapshot = await db.collection('vacationHistory').get()
  } catch (error) {
    // History is supplementary. A temporary read failure must not prevent a
    // manager from accessing existing vacation requests.
    logger.error('Urlaubsmanagement: Verlauf konnte nicht geladen werden.', { code: error?.code || 'unknown' })
  }
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
  const managedUserIds = new Set(managedEmployees.map((employee) => employee.id))
  const history = historySnapshot?.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => managedUserIds.has(item.userId)) || []
  return { requests, history, employees: managedEmployees, holidays: calendarItems(holidaySnapshot, 'Feiertag'), blocks: calendarItems(blockSnapshot, 'Urlaubssperre') }
})

export const withdrawVacationRequest = onCall({ region: 'europe-west3' }, async (request) => {
  await requireActiveProfile(request)
  const requestId = request.data?.requestId
  if (typeof requestId !== 'string' || !requestId) throw new HttpsError('invalid-argument', 'Ungültiger Urlaubsantrag.')

  const requestRef = db.collection('vacationRequests').doc(requestId)
  await db.runTransaction(async (transaction) => {
    const vacationRequest = await transaction.get(requestRef)
    const data = vacationRequest.data()
    if (!vacationRequest.exists || data?.userId !== request.auth.uid) throw new HttpsError('permission-denied', 'Keine Berechtigung für diesen Urlaubsantrag.')
    if (!['pending', 'change_requested', 'cancellation_requested'].includes(data.status) && vacationRequestStatus(data) !== 'pending') throw new HttpsError('failed-precondition', 'Der Urlaubsantrag kann nicht zurückgezogen werden.')
    const kind = requestType(data)
    const rootId = vacationRootId(data, requestId)
    const update = kind === 'request'
      ? { status: 'withdrawn', mainStatus: 'withdrawn', withdrawnBy: request.auth.uid, withdrawnAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }
      : { status: 'withdrawn', requestStatus: 'withdrawn', withdrawnBy: request.auth.uid, withdrawnAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }
    transaction.update(requestRef, update)
    writeVacationHistory(transaction, { id: `withdrawn-${requestId}`, vacationId: rootId, userId: data.userId, eventType: historyEventType(data, 'withdrawn'), status: 'withdrawn', createdBy: request.auth.uid, requestId })
  })
  return { requestId, status: 'withdrawn' }
})

export const replacePendingVacationRequest = onCall({ region: 'europe-west3' }, async (request) => {
  await requireActiveProfile(request)
  const { requestId, values } = request.data ?? {}
  if (typeof requestId !== 'string' || !requestId || !values || typeof values !== 'object') throw new HttpsError('invalid-argument', 'Ungültige Urlaubsanfrage.')
  const startDate = typeof values.startDate === 'string' ? values.startDate : ''
  const endDate = typeof values.endDate === 'string' ? values.endDate : ''
  const days = Number(values.days)
  const vacationType = ['normal', 'overtime', 'special'].includes(values.vacationType) ? values.vacationType : 'normal'
  const requestComment = typeof values.requestComment === 'string' ? values.requestComment.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate || !Number.isFinite(days) || days < 0) throw new HttpsError('invalid-argument', 'Ungültige Urlaubsdaten.')

  const previousRequestRef = db.collection('vacationRequests').doc(requestId)
  const replacementRequestRef = db.collection('vacationRequests').doc()
  await db.runTransaction(async (transaction) => {
    const previousRequest = await transaction.get(previousRequestRef)
    const previousData = previousRequest.data()
    if (!previousRequest.exists || previousData?.userId !== request.auth.uid) throw new HttpsError('permission-denied', 'Keine Berechtigung für diesen Urlaubsantrag.')
    if (previousData.status !== 'pending' || previousData.originalRequestId || previousData.requestKind === 'cancellation' || previousData.cancellationRequest) throw new HttpsError('failed-precondition', 'Nur ein ausstehender Urlaubsantrag kann überarbeitet werden.')
    transaction.update(previousRequestRef, { status: 'superseded', supersededBy: replacementRequestRef.id, supersededAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    writeVacationHistory(transaction, { id: `replaced-${requestId}`, vacationId: requestId, userId: request.auth.uid, eventType: 'vacation_replaced', status: 'withdrawn', createdBy: request.auth.uid, requestId, previousValues: { startDate: previousData.startDate, endDate: previousData.endDate, days: previousData.days, vacationType: previousData.vacationType }, nextValues: { startDate, endDate, days, vacationType } })
    transaction.set(replacementRequestRef, { id: replacementRequestRef.id, userId: request.auth.uid, startDate, endDate, days, vacationType, status: 'pending', mainStatus: 'pending', type: 'vacation', note: '', requestComment, replacesRequestId: requestId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  })
  return { requestId: replacementRequestRef.id, status: 'pending' }
})

export const processVacationRequest = onCall({ region: 'europe-west3' }, async (request) => {
  const manager = await assertVacationManager(request)
  const { requestId, decision, managerComment } = request.data ?? {}
  if (typeof requestId !== 'string' || !['approved', 'rejected'].includes(decision)) throw new HttpsError('invalid-argument', 'Ungültige Bearbeitungsdaten.')
  if (managerComment !== undefined && typeof managerComment !== 'string') throw new HttpsError('invalid-argument', 'Ungültige Bearbeitungsdaten.')
  const { requestRef, vacationRequest } = await managedVacationRequest(manager, requestId)
  if (requestType(vacationRequest.data()) === 'request' ? vacationRequest.data().status !== 'pending' : vacationRequestStatus(vacationRequest.data()) !== 'pending') throw new HttpsError('failed-precondition', 'Der Urlaubsantrag wurde bereits bearbeitet.')
  await db.runTransaction(async (transaction) => {
    const currentRequest = await transaction.get(requestRef)
    const requestData = currentRequest.data()
    const kind = requestType(requestData)
    const pending = kind === 'request' ? requestData?.status === 'pending' : vacationRequestStatus(requestData) === 'pending'
    if (!currentRequest.exists || !pending) throw new HttpsError('failed-precondition', 'Der Urlaubsantrag wurde bereits bearbeitet.')
    const comment = (managerComment || '').trim()
    const processed = kind === 'request'
      ? { status: decision, mainStatus: decision, managerComment: comment, processedBy: request.auth.uid, processedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), ...(decision === 'approved' ? { approvedBy: request.auth.uid } : { rejectedBy: request.auth.uid }) }
      : { status: decision, requestStatus: decision, managerComment: comment, processedBy: request.auth.uid, processedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), ...(decision === 'approved' ? { approvedBy: request.auth.uid } : { rejectedBy: request.auth.uid }) }
    const rootId = vacationRootId(requestData, requestId)

    if (kind !== 'request' && typeof rootId !== 'string') throw new HttpsError('failed-precondition', 'Der zugehörige Urlaub ist ungültig.')
    const rootRef = kind === 'request' ? requestRef : db.collection('vacationRequests').doc(rootId)
    const rootVacation = kind === 'request' ? currentRequest : await transaction.get(rootRef)
    if (!rootVacation.exists || rootVacation.data().userId !== requestData.userId) throw new HttpsError('failed-precondition', 'Der zugehörige Urlaub ist nicht verfügbar.')

    if (decision === 'approved' && kind === 'cancellation') {
      if ((rootVacation.data().mainStatus || rootVacation.data().status) !== 'approved') throw new HttpsError('failed-precondition', 'Der zu stornierende Urlaub ist nicht mehr genehmigt.')
      transaction.update(rootRef, { status: 'cancelled', mainStatus: 'cancelled', cancelledBy: request.auth.uid, cancelledAt: FieldValue.serverTimestamp(), cancellationRequestId: requestId, updatedAt: FieldValue.serverTimestamp() })
    }
    if (decision === 'approved' && kind === 'change') {
      if ((rootVacation.data().mainStatus || rootVacation.data().status) !== 'approved') throw new HttpsError('failed-precondition', 'Der zu ändernde Urlaub ist nicht mehr genehmigt.')
      transaction.update(rootRef, { startDate: requestData.startDate, endDate: requestData.endDate, days: requestData.days, vacationType: requestData.vacationType, status: 'approved', mainStatus: 'approved', updatedAt: FieldValue.serverTimestamp() })
    }

    transaction.update(requestRef, processed)
    writeVacationHistory(transaction, { id: `decision-${requestId}`, vacationId: rootId, userId: requestData.userId, eventType: historyEventType(requestData, decision), status: decision, createdBy: request.auth.uid, comment, requestId, ...(kind === 'change' && decision === 'approved' ? { previousValues: { startDate: rootVacation.data().startDate, endDate: rootVacation.data().endDate, days: rootVacation.data().days, vacationType: rootVacation.data().vacationType }, nextValues: { startDate: requestData.startDate, endDate: requestData.endDate, days: requestData.days, vacationType: requestData.vacationType } } : {}) })
  })
  return { requestId, status: decision }
})

export { runAutomatedNewsResearch, scheduledNewsResearch, setNewsReaction } from './news.js'
export { submitBugReport } from './bugReports.js'
export { requireActiveProfileBeforeSignIn } from './authBlocking.js'
export {
  listSystemMailTemplates,
  notifyVacationRequestCreated,
  notifyVacationRequestDecision,
  sendSystemTestMail,
  updateSystemMailTemplate,
} from './systemMails.js'
