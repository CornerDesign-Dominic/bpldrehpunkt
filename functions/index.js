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
const modules = ['vacation', 'calendar', 'team', 'masterData', 'crm', 'pallets', 'news', 'documents', 'templates', 'todos', 'damages', 'personnel', 'knowledgeProcesses']
const normalFields = ['firstName', 'lastName', 'phone', 'email', 'jobTitle', 'active', 'employmentStart', 'personnelNumber']
const hrProfileFields = ['birthDate', 'streetAddress', 'postalCode', 'city', 'country', 'taxClass', 'childrenCount']
const sharedHrProfileFields = ['firstName', 'lastName', 'jobTitle', 'phone', 'personnelNumber', 'employmentStart']

function permissions(value) { return Object.fromEntries(modules.map((module) => [module, levels.has(value?.[module]) ? value[module] : 'none'])) }
function profileFields(value) { return Object.fromEntries(normalFields.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])) }
function sharedProfileFields(value) { return Object.fromEntries(sharedHrProfileFields.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])) }
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

function hasPersonnelPermission(profile, minimum = 'view') {
  if (profile?.role === 'superadmin') return true
  const values = { none: 0, view: 1, edit: 2 }
  return values[profile?.permissions?.personnel] >= values[minimum]
}

async function assertPersonnelAccess(request, minimum = 'view') {
  const profile = await requireActiveProfile(request)
  if (!hasPersonnelPermission(profile, minimum)) throw new HttpsError('permission-denied', 'Keine Berechtigung für die Personalverwaltung.')
  return profile
}

function optionalText(value, field, limit) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `Ungültiger Wert für ${field}.`)
  const clean = value.trim()
  if (clean.length > limit) throw new HttpsError('invalid-argument', `${field} ist zu lang.`)
  return clean
}

function optionalDate(value, field) {
  const clean = optionalText(value, field, 10)
  if (!clean) return ''
  const date = new Date(`${clean}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== clean) throw new HttpsError('invalid-argument', `${field} ist kein gültiges Datum.`)
  return clean
}

function validatedHrFields(value = {}) {
  const childrenCount = value.childrenCount === '' || value.childrenCount === null || value.childrenCount === undefined ? null : Number(value.childrenCount)
  if (childrenCount !== null && (!Number.isInteger(childrenCount) || childrenCount < 0 || childrenCount > 50)) throw new HttpsError('invalid-argument', 'Anzahl Kinder muss eine ganze Zahl zwischen 0 und 50 sein.')
  const taxClass = optionalText(value.taxClass, 'Steuerklasse', 1)
  if (taxClass && !['1', '2', '3', '4', '5', '6'].includes(taxClass)) throw new HttpsError('invalid-argument', 'Steuerklasse ist ungültig.')
  return {
    birthDate: optionalDate(value.birthDate, 'Geburtsdatum'),
    streetAddress: optionalText(value.streetAddress, 'Straße / Hausnummer', 180),
    postalCode: optionalText(value.postalCode, 'PLZ', 20),
    city: optionalText(value.city, 'Ort', 120),
    country: optionalText(value.country, 'Land', 120),
    taxClass,
    childrenCount,
  }
}

function managedUserEntry(snapshot) {
  const profile = snapshot.data()
  return {
    id: snapshot.id,
    firstName: typeof profile.firstName === 'string' ? profile.firstName : '',
    lastName: typeof profile.lastName === 'string' ? profile.lastName : '',
    email: typeof profile.email === 'string' ? profile.email : '',
    phone: typeof profile.phone === 'string' ? profile.phone : '',
    jobTitle: typeof profile.jobTitle === 'string' ? profile.jobTitle : '',
    departmentId: typeof profile.departmentId === 'string' ? profile.departmentId : '',
    department: typeof profile.department === 'string' ? profile.department : '',
    departmentName: typeof profile.departmentName === 'string' ? profile.departmentName : '',
    personnelNumber: typeof profile.personnelNumber === 'string' ? profile.personnelNumber : '',
    employmentStart: typeof profile.employmentStart === 'string' ? profile.employmentStart : '',
    active: profile.active === true,
    role: roles.has(profile.role) ? profile.role : 'user',
    permissions: permissions(profile.permissions),
    vacationManager: profile.vacationManager === true,
    vacationManagerAllDepartments: profile.vacationManagerAllDepartments === true,
    vacationManagerDepartments: Array.isArray(profile.vacationManagerDepartments) ? profile.vacationManagerDepartments : [],
  }
}

function userDirectoryAccess(profile) {
  if (profile?.role === 'admin' || profile?.role === 'superadmin') return { allowed: true, includeContactDetails: true }
  const permissions = profile?.permissions ?? {}
  const includeContactDetails = ['view', 'edit'].includes(permissions.team)
  return {
    allowed: includeContactDetails || ['view', 'edit'].includes(permissions.vacation) || permissions.todos === 'edit' || permissions.damages === 'edit',
    includeContactDetails,
  }
}

function userDirectoryEntry(snapshot, includeContactDetails) {
  const profile = snapshot.data()
  return {
    id: snapshot.id,
    firstName: typeof profile.firstName === 'string' ? profile.firstName : '',
    lastName: typeof profile.lastName === 'string' ? profile.lastName : '',
    jobTitle: typeof profile.jobTitle === 'string' ? profile.jobTitle : '',
    department: typeof profile.department === 'string' ? profile.department : '',
    departmentName: typeof profile.departmentName === 'string' ? profile.departmentName : '',
    departmentId: typeof profile.departmentId === 'string' ? profile.departmentId : null,
    ...(typeof profile.availabilityStatus === 'string' ? { availabilityStatus: profile.availabilityStatus } : {}),
    ...(includeContactDetails ? {
      email: typeof profile.email === 'string' ? profile.email : '',
      phone: typeof profile.phone === 'string' ? profile.phone : '',
    } : {}),
  }
}

// The client must not list complete users documents. This intentionally
// exposes a small directory only to modules that need employee selection.
export const listVisibleUserDirectory = onCall({ region: 'europe-west3' }, async (request) => {
  const actor = await requireActiveProfile(request)
  const access = userDirectoryAccess(actor)
  if (!access.allowed) throw new HttpsError('permission-denied', 'Keine Berechtigung für das Mitarbeiterverzeichnis.')
  const users = await db.collection('users').where('active', '==', true).get()
  return { profiles: users.docs.map((snapshot) => userDirectoryEntry(snapshot, access.includeContactDetails)) }
})

// The administration needs central account and employment fields, but never
// HR-only data. Returning this explicit projection also permits us to deny
// direct client reads of arbitrary user documents.
export const listManagedUsers = onCall({ region: 'europe-west3' }, async (request) => {
  await assertManager(request)
  const users = await db.collection('users').get()
  return { profiles: users.docs.map(managedUserEntry) }
})

function personnelListEntry(snapshot) {
  const profile = snapshot.data()
  return {
    id: snapshot.id,
    firstName: typeof profile.firstName === 'string' ? profile.firstName : '',
    lastName: typeof profile.lastName === 'string' ? profile.lastName : '',
    jobTitle: typeof profile.jobTitle === 'string' ? profile.jobTitle : '',
    department: typeof profile.departmentName === 'string' ? profile.departmentName : (typeof profile.department === 'string' ? profile.department : ''),
    personnelNumber: typeof profile.personnelNumber === 'string' ? profile.personnelNumber : '',
    employmentStart: typeof profile.employmentStart === 'string' ? profile.employmentStart : '',
  }
}

function personnelDetailEntry(userSnapshot, hrSnapshot) {
  const profile = userSnapshot.data()
  const hr = hrSnapshot.exists ? hrSnapshot.data() : {}
  return {
    ...personnelListEntry(userSnapshot),
    phone: typeof profile.phone === 'string' ? profile.phone : '',
    departmentId: typeof profile.departmentId === 'string' ? profile.departmentId : '',
    ...Object.fromEntries(hrProfileFields.map((field) => [field, hr[field] ?? (field === 'childrenCount' ? null : '')])),
  }
}

export const listPersonnelEmployees = onCall({ region: 'europe-west3' }, async (request) => {
  await assertPersonnelAccess(request)
  const users = await db.collection('users').get()
  return { employees: users.docs.map(personnelListEntry) }
})

export const getPersonnelEmployee = onCall({ region: 'europe-west3' }, async (request) => {
  await assertPersonnelAccess(request)
  const userId = request.data?.userId
  if (typeof userId !== 'string' || !userId || userId.includes('/')) throw new HttpsError('invalid-argument', 'Ungültige Mitarbeiter-ID.')
  const [user, hr] = await Promise.all([db.doc(`users/${userId}`).get(), db.doc(`employeeHrProfiles/${userId}`).get()])
  if (!user.exists) throw new HttpsError('not-found', 'Mitarbeiter nicht gefunden.')
  return { employee: personnelDetailEntry(user, hr) }
})

// Central employment data and HR-only data are written in one transaction.
// There is one source of truth for shared fields: users/{uid}.
export const updatePersonnelEmployee = onCall({ region: 'europe-west3' }, async (request) => {
  await assertPersonnelAccess(request, 'edit')
  const { userId, ...data } = request.data ?? {}
  if (typeof userId !== 'string' || !userId || userId.includes('/')) throw new HttpsError('invalid-argument', 'Ungültige Mitarbeiter-ID.')
  const userRef = db.doc(`users/${userId}`)
  const hrRef = db.doc(`employeeHrProfiles/${userId}`)
  const user = await userRef.get()
  if (!user.exists) throw new HttpsError('not-found', 'Mitarbeiter nicht gefunden.')
  const centralUpdate = { ...sharedProfileFields(data), ...(await departmentFields(data, user.data())), updatedAt: FieldValue.serverTimestamp() }
  const hrUpdate = validatedHrFields(data)
  await db.runTransaction(async (transaction) => {
    const hr = await transaction.get(hrRef)
    transaction.update(userRef, centralUpdate)
    transaction.set(hrRef, {
      ...hrUpdate,
      updatedAt: FieldValue.serverTimestamp(),
      ...(hr.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true })
  })
  return { userId }
})

// One-time, intentionally explicit migration for the pre-HR birthDate field.
// It preserves an already-maintained HR value and removes the legacy copy.
export const migrateLegacyBirthDatesToPersonnel = onCall({ region: 'europe-west3' }, async (request) => {
  await requireRole(await requireActiveProfile(request), ['superadmin'], 'Diese Aktion ist nur für Superadmins erlaubt.')
  const users = await db.collection('users').get()
  let migrated = 0
  for (const user of users.docs) {
    const legacyBirthDate = user.data().birthDate
    if (typeof legacyBirthDate !== 'string' || !legacyBirthDate) continue
    const hrRef = db.doc(`employeeHrProfiles/${user.id}`)
    await db.runTransaction(async (transaction) => {
      const hr = await transaction.get(hrRef)
      const currentHr = hr.exists ? hr.data() : {}
      transaction.update(user.ref, { birthDate: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
      if (!currentHr.birthDate) {
        transaction.set(hrRef, { birthDate: optionalDate(legacyBirthDate, 'Geburtsdatum'), updatedAt: FieldValue.serverTimestamp(), ...(hr.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true })
      }
    })
    migrated += 1
  }
  return { migrated }
})

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
  const batch = db.batch()
  batch.set(db.doc(`users/${user.uid}`), { ...profileFields(data), ...selectedDepartment, email: data.email, active: data.active !== false, role, permissions: actor.role === 'superadmin' ? permissions(data.permissions) : permissions(), ...selectedVacationManagerFields, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  batch.set(db.doc(`employeeHrProfiles/${user.uid}`), { ...validatedHrFields(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  await batch.commit()
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

const knowledgeProcessCategories = new Set(['damages', 'transport_dispatch', 'customers_carriers', 'accounting_billing', 'personnel_administration', 'general'])
const knowledgeProcessNodeTypes = new Set(['start', 'action', 'decision', 'checklist', 'end'])
const knowledgeProcessStatuses = new Set(['draft', 'active', 'archived'])
const processText = (value, field, limit, required = false) => {
  const clean = typeof value === 'string' ? value.trim() : ''
  if ((required && !clean) || clean.length > limit) throw new HttpsError('invalid-argument', `${field} ist ungültig.`)
  return clean
}

function hasKnowledgeProcessesPermission(profile, minimum = 'view') {
  if (profile?.role === 'superadmin') return true
  const values = { none: 0, view: 1, edit: 2 }
  return values[profile?.permissions?.knowledgeProcesses] >= values[minimum]
}

async function assertKnowledgeProcessesAccess(request, minimum = 'view') {
  const profile = await requireActiveProfile(request)
  if (!hasKnowledgeProcessesPermission(profile, minimum)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Wissen & Prozesse.')
  return profile
}

function knowledgeProcessActorName(profile) {
  return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || profile?.name || 'Unbekannt'
}

function processReferenceId(value, field) {
  if (!value) return ''
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) throw new HttpsError('invalid-argument', `${field} ist ungültig.`)
  return value
}

function existingProcessReferenceIds(existing, field) {
  return new Set((existing?.nodes || []).map((node) => node?.[field]).filter(Boolean))
}

async function applyProcessResponsibilities(nodes, existing) {
  const existingDepartmentIds = existingProcessReferenceIds(existing, 'departmentId')
  const existingFunctionalRoleIds = existingProcessReferenceIds(existing, 'functionalRoleId')
  return Promise.all(nodes.map(async (node) => {
    if (!['action', 'checklist'].includes(node.type)) return node
    const departmentId = processReferenceId(node.departmentId, 'Die ausgewählte Abteilung')
    const functionalRoleId = processReferenceId(node.functionalRoleId, 'Die ausgewählte Fachrolle')
    const responsible = { ...node }
    if (departmentId) {
      const department = await db.doc(`departments/${departmentId}`).get()
      if (!department.exists || (department.data().active === false && !existingDepartmentIds.has(departmentId))) throw new HttpsError('invalid-argument', 'Die ausgewählte Abteilung ist nicht verfügbar.')
      responsible.departmentId = department.id
      responsible.departmentName = department.data().name
    }
    if (functionalRoleId) {
      const functionalRole = await db.doc(`functionalRoles/${functionalRoleId}`).get()
      if (!functionalRole.exists || (functionalRole.data().active === false && !existingFunctionalRoleIds.has(functionalRoleId))) throw new HttpsError('invalid-argument', 'Die ausgewählte Fachrolle ist nicht verfügbar.')
      responsible.functionalRoleId = functionalRole.id
      responsible.functionalRoleName = functionalRole.data().name
    }
    return responsible
  }))
}

async function sanitizeKnowledgeProcess(process, existing) {
  if (!process || typeof process !== 'object' || Array.isArray(process)) throw new HttpsError('invalid-argument', 'Die Prozessdaten fehlen.')
  const title = processText(process.title, 'Titel', 160)
  const category = typeof process.category === 'string' && knowledgeProcessCategories.has(process.category) ? process.category : ''
  const shortDescription = processText(process.shortDescription, 'Kurzbeschreibung', 1000)
  if (!Array.isArray(process.nodes) || process.nodes.length === 0 || process.nodes.length > 100) throw new HttpsError('invalid-argument', 'Die Prozessblöcke sind ungültig.')
  if (!Array.isArray(process.edges) || process.edges.length > 160) throw new HttpsError('invalid-argument', 'Die Prozessverbindungen sind ungültig.')

  const nodeIds = new Set()
  const nodes = process.nodes.map((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || typeof node.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(node.id) || nodeIds.has(node.id) || !knowledgeProcessNodeTypes.has(node.type)) throw new HttpsError('invalid-argument', 'Ein Prozessblock ist ungültig.')
    nodeIds.add(node.id)
    const clean = { id: node.id, type: node.type, title: processText(node.title, 'Blocktitel', 160), description: processText(node.description, 'Blockbeschreibung', 2000) }
    if (node.type === 'checklist') {
      if (!Array.isArray(node.checklistItems) || node.checklistItems.length > 30) throw new HttpsError('invalid-argument', 'Die Checkliste ist ungültig.')
      clean.checklistItems = node.checklistItems.map((item) => processText(item, 'Checklistenpunkt', 300)).filter(Boolean)
    }
    if (node.type === 'decision') {
      if (!Array.isArray(node.outputs)) throw new HttpsError('invalid-argument', 'Die Antwortwege der Frage sind ungültig.')
      const outputIds = new Set()
      clean.outputs = node.outputs.map((output) => {
        if (!output || typeof output !== 'object' || typeof output.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(output.id) || outputIds.has(output.id)) throw new HttpsError('invalid-argument', 'Ein Antwortweg ist ungültig.')
        outputIds.add(output.id)
        return { id: output.id, label: processText(output.label, 'Bezeichnung des Antwortwegs', 80) }
      })
    }
    if (['action', 'checklist'].includes(node.type)) {
      clean.departmentId = processReferenceId(node.departmentId, 'Die ausgewählte Abteilung')
      clean.functionalRoleId = processReferenceId(node.functionalRoleId, 'Die ausgewählte Fachrolle')
    }
    return clean
  })
  if (nodes.filter((node) => node.type === 'start').length !== 1) throw new HttpsError('invalid-argument', 'Ein Prozess benötigt genau einen Startblock.')

  const edgeIds = new Set()
  const edges = process.edges.map((edge) => {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge) || typeof edge.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(edge.id) || edgeIds.has(edge.id) || !nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId) || edge.sourceId === edge.targetId) throw new HttpsError('invalid-argument', 'Eine Prozessverbindung ist ungültig.')
    edgeIds.add(edge.id)
    const source = nodes.find((node) => node.id === edge.sourceId)
    const sourceOutputId = typeof edge.sourceOutputId === 'string' ? edge.sourceOutputId : ''
    if (source.type === 'decision') {
      if (!source.outputs.some((output) => output.id === sourceOutputId)) throw new HttpsError('invalid-argument', 'Der Antwortweg einer Verbindung ist ungültig.')
    } else if (sourceOutputId) throw new HttpsError('invalid-argument', 'Nur Fragen dürfen benannte Antwortwege haben.')
    return { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, sourceOutputId }
  })
  return { title, category, shortDescription, nodes: await applyProcessResponsibilities(nodes, existing), edges }
}

function validateActiveKnowledgeProcess(process) {
  if (!process.title || !process.category) throw new HttpsError('failed-precondition', 'Titel und Kategorie sind für die Freigabe erforderlich.')
  const nodesById = new Map(process.nodes.map((node) => [node.id, node]))
  const start = process.nodes.find((node) => node.type === 'start')
  const outgoing = new Map(process.nodes.map((node) => [node.id, []]))
  for (const edge of process.edges) outgoing.get(edge.sourceId).push(edge)
  if (outgoing.get(start.id).length === 0) throw new HttpsError('failed-precondition', 'Nach dem Startblock fehlt ein Schritt.')
  for (const node of process.nodes) {
    const nodeEdges = outgoing.get(node.id)
    if (!node.title) throw new HttpsError('failed-precondition', 'Jeder Prozessblock benötigt einen Titel.')
    if (node.type === 'end' && nodeEdges.length) throw new HttpsError('failed-precondition', 'Endblöcke dürfen keinen nachfolgenden Schritt haben.')
    if (node.type === 'decision') {
      if (node.outputs.length < 2) throw new HttpsError('failed-precondition', 'Eine Frage benötigt mindestens zwei Antwortwege.')
      const labels = new Set()
      if (node.outputs.some((output) => !output.label || labels.has(output.label.toLocaleLowerCase('de-DE')) || !labels.add(output.label.toLocaleLowerCase('de-DE')))) throw new HttpsError('failed-precondition', 'Antwortwege einer Frage benötigen eindeutige Bezeichnungen.')
      if (node.outputs.some((output) => nodeEdges.filter((edge) => edge.sourceOutputId === output.id).length !== 1)) throw new HttpsError('failed-precondition', 'Jeder Antwortweg benötigt genau einen nächsten Schritt.')
    } else if (node.type !== 'end' && nodeEdges.length !== 1) throw new HttpsError('failed-precondition', 'Jeder Schritt benötigt genau eine Verbindung.')
  }
  const visited = new Set()
  const visiting = new Set()
  function walk(nodeId) {
    if (visiting.has(nodeId)) throw new HttpsError('failed-precondition', 'Zirkuläre Prozesswege sind in Phase 1 nicht zulässig.')
    if (visited.has(nodeId)) return
    visiting.add(nodeId)
    for (const edge of outgoing.get(nodeId)) walk(edge.targetId)
    visiting.delete(nodeId)
    visited.add(nodeId)
  }
  walk(start.id)
  if (visited.size !== process.nodes.length) throw new HttpsError('failed-precondition', 'Alle Prozessblöcke müssen mit dem Start verbunden sein.')
  if (!process.nodes.some((node) => node.type === 'end')) throw new HttpsError('failed-precondition', 'Der Prozess benötigt mindestens einen Endblock.')
  if ([...visited].some((id) => nodesById.get(id).type !== 'end' && outgoing.get(id).length === 0)) throw new HttpsError('failed-precondition', 'Jeder erreichbare Weg muss in einem Endblock enden.')
}

export const saveKnowledgeProcess = onCall({ region: 'europe-west3' }, async (request) => {
  const actor = await assertKnowledgeProcessesAccess(request, 'edit')
  const data = request.data ?? {}
  const status = knowledgeProcessStatuses.has(data.status) ? data.status : 'draft'
  const id = typeof data.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(data.id) ? data.id : ''
  const ref = id ? db.collection('knowledgeProcesses').doc(id) : db.collection('knowledgeProcesses').doc()
  const existing = await ref.get()
  if (id && !existing.exists) throw new HttpsError('not-found', 'Der Prozess wurde nicht gefunden.')
  const process = await sanitizeKnowledgeProcess(data.process, existing.exists ? existing.data() : null)
  if (status === 'active') validateActiveKnowledgeProcess(process)
  if (existing.exists && existing.data().status === 'archived' && status !== 'archived') throw new HttpsError('failed-precondition', 'Archivierte Prozesse können in Phase 1 nicht erneut freigegeben werden.')
  const now = FieldValue.serverTimestamp()
  const actorName = knowledgeProcessActorName(actor)
  await ref.set({ id: ref.id, ...process, status, createdAt: existing.exists ? existing.data().createdAt : now, createdBy: existing.exists ? existing.data().createdBy : request.auth.uid, createdByName: existing.exists ? existing.data().createdByName : actorName, updatedAt: now, updatedBy: request.auth.uid, updatedByName: actorName }, { merge: false })
  return { id: ref.id, status }
})

async function assertSuperadmin(request) {
  const actor = await assertManager(request)
  if (actor.role !== 'superadmin') throw new HttpsError('permission-denied', 'Diese Aktion ist nur für Superadmins erlaubt.')
  return actor
}

function isLegacyProfile(profile) { return profile && !Object.hasOwn(profile, 'active') }
function legacyProfileSummary(snapshot) {
  const profile = snapshot.data()
  return {
    uid: snapshot.id,
    name: [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || '—',
    email: typeof profile.email === 'string' ? profile.email : '—',
    role: typeof profile.role === 'string' ? profile.role : 'user',
    department: profile.departmentName || profile.department || '—',
  }
}
function profileDisplayName(profile) { return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || '—' }

export const listLegacyAccountProfiles = onCall({ region: 'europe-west3' }, async (request) => {
  await assertSuperadmin(request)
  const users = await db.collection('users').get()
  return { profiles: users.docs.filter((snapshot) => isLegacyProfile(snapshot.data())).map(legacyProfileSummary) }
})

export const confirmLegacyAccountProfile = onCall({ region: 'europe-west3' }, async (request) => {
  await assertSuperadmin(request)
  const uid = request.data?.uid
  if (typeof uid !== 'string' || !uid || uid.includes('/')) throw new HttpsError('invalid-argument', 'Ungültiges Benutzerkonto.')

  const profileRef = db.doc(`users/${uid}`)
  const auditRef = db.doc(`legacyAccountMigrations/${uid}`)
  await db.runTransaction(async (transaction) => {
    const profileSnapshot = await transaction.get(profileRef)
    if (!profileSnapshot.exists || !isLegacyProfile(profileSnapshot.data())) throw new HttpsError('failed-precondition', 'Dieses Benutzerkonto kann nicht bestätigt werden.')
    transaction.update(profileRef, { active: true, activeConfirmedAt: FieldValue.serverTimestamp() })
    transaction.set(auditRef, { uid, confirmedBy: request.auth.uid, confirmedAt: FieldValue.serverTimestamp() })
  })
  return { uid }
})

export const listLegacyAccountMigrationHistory = onCall({ region: 'europe-west3' }, async (request) => {
  await assertSuperadmin(request)
  const migrations = await db.collection('legacyAccountMigrations').orderBy('confirmedAt', 'desc').limit(12).get()
  const userIds = [...new Set(migrations.docs.flatMap((snapshot) => {
    const data = snapshot.data()
    return [data.uid, data.confirmedBy].filter((id) => typeof id === 'string' && id)
  }))]
  const profiles = new Map((await Promise.all(userIds.map(async (uid) => [uid, (await db.doc(`users/${uid}`).get()).data()]))).map(([uid, profile]) => [uid, profile]))
  return {
    entries: migrations.docs.map((snapshot) => {
      const data = snapshot.data()
      return {
        uid: data.uid,
        userName: profileDisplayName(profiles.get(data.uid)),
        confirmedByName: profileDisplayName(profiles.get(data.confirmedBy)),
        confirmedAt: data.confirmedAt || null,
      }
    }),
  }
})

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

export const createFunctionalRole = onCall({ region: 'europe-west3' }, async (request) => {
  await assertSuperadmin(request)
  const name = departmentName(request.data?.name)
  if (!name) throw new HttpsError('invalid-argument', 'Der Name der Fachrolle ist erforderlich.')
  const normalizedName = normalizedDepartmentName(name)
  const existing = await db.collection('functionalRoles').where('normalizedName', '==', normalizedName).limit(1).get()
  if (!existing.empty) throw new HttpsError('already-exists', 'Diese Fachrolle existiert bereits.')
  const reference = db.collection('functionalRoles').doc()
  await reference.set({ id: reference.id, name, normalizedName, active: true, createdAt: FieldValue.serverTimestamp(), createdBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid })
  return { id: reference.id }
})

export const updateFunctionalRole = onCall({ region: 'europe-west3' }, async (request) => {
  await assertSuperadmin(request)
  const { id, name, active } = request.data ?? {}
  if (typeof id !== 'string' || id.includes('/')) throw new HttpsError('invalid-argument', 'Fachrollen-ID fehlt.')
  const reference = db.doc(`functionalRoles/${id}`)
  const current = await reference.get()
  if (!current.exists) throw new HttpsError('not-found', 'Fachrolle nicht gefunden.')
  const update = { updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }
  if (name !== undefined) {
    const cleanName = departmentName(name)
    if (!cleanName) throw new HttpsError('invalid-argument', 'Der Name der Fachrolle ist erforderlich.')
    const normalizedName = normalizedDepartmentName(cleanName)
    const duplicate = await db.collection('functionalRoles').where('normalizedName', '==', normalizedName).limit(1).get()
    if (!duplicate.empty && duplicate.docs[0].id !== id) throw new HttpsError('already-exists', 'Diese Fachrolle existiert bereits.')
    update.name = cleanName
    update.normalizedName = normalizedName
  }
  if (typeof active === 'boolean') update.active = active
  await reference.update(update)
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

function personnelVacationStatus(data) {
  return ['pending', 'approved', 'rejected', 'cancelled', 'withdrawn'].includes(data?.mainStatus)
    ? data.mainStatus
    : (['pending', 'approved', 'rejected', 'cancelled', 'withdrawn'].includes(data?.status) ? data.status : 'pending')
}

function personnelVacationEntry(snapshot, employee, meta) {
  const vacation = snapshot.data()
  return {
    vacationId: snapshot.id,
    userId: vacation.userId,
    employeeName: [employee?.firstName, employee?.lastName].filter(Boolean).join(' ').trim() || employee?.email || '—',
    department: employee?.departmentName || employee?.department || '—',
    departmentId: employee?.departmentId || '',
    startDate: typeof vacation.startDate === 'string' ? vacation.startDate : '',
    endDate: typeof vacation.endDate === 'string' ? vacation.endDate : '',
    days: Number.isFinite(vacation.days) ? vacation.days : 0,
    vacationType: ['normal', 'overtime', 'special'].includes(vacation.vacationType) ? vacation.vacationType : 'normal',
    status: personnelVacationStatus(vacation),
    payrollProcessed: meta?.payrollProcessed === true,
    hrNote: typeof meta?.hrNote === 'string' ? meta.hrNote : '',
  }
}

// This is an HR-specific read model. It only joins the existing vacation
// source with private HR metadata; it does not persist vacation data again.
export const listPersonnelVacations = onCall({ region: 'europe-west3' }, async (request) => {
  await assertPersonnelAccess(request)
  const userId = request.data?.userId
  if (userId !== undefined && (typeof userId !== 'string' || !userId || userId.includes('/'))) throw new HttpsError('invalid-argument', 'Ungültige Mitarbeiter-ID.')
  const [vacations, employees, metadata] = await Promise.all([
    db.collection('vacationRequests').get(),
    db.collection('users').get(),
    db.collection('hrVacationMeta').get(),
  ])
  const employeeById = new Map(employees.docs.map((item) => [item.id, item.data()]))
  const metaByVacationId = new Map(metadata.docs.map((item) => [item.id, item.data()]))
  return {
    vacations: vacations.docs
      .filter((item) => {
        const data = item.data()
        return (data.type === 'vacation' || !data.type) && requestType(data) === 'request' && (!userId || data.userId === userId)
      })
      .map((item) => personnelVacationEntry(item, employeeById.get(item.data().userId), metaByVacationId.get(item.id))),
  }
})

// Deliberately writes only the separate HR metadata document. Vacation
// requests, their status and their workflow are never changed here.
export const updatePersonnelVacationMeta = onCall({ region: 'europe-west3' }, async (request) => {
  await assertPersonnelAccess(request, 'edit')
  const { vacationId, payrollProcessed, hrNote } = request.data ?? {}
  if (typeof vacationId !== 'string' || !vacationId || vacationId.includes('/')) throw new HttpsError('invalid-argument', 'Ungültige Urlaubs-ID.')
  if (typeof payrollProcessed !== 'boolean') throw new HttpsError('invalid-argument', 'Lohnbuchhaltungsstatus ist ungültig.')
  const note = optionalText(hrNote, 'HR-Bemerkung', 3000)
  const vacationRef = db.doc(`vacationRequests/${vacationId}`)
  const metaRef = db.doc(`hrVacationMeta/${vacationId}`)
  await db.runTransaction(async (transaction) => {
    const [vacation, currentMeta] = await Promise.all([transaction.get(vacationRef), transaction.get(metaRef)])
    if (!vacation.exists || requestType(vacation.data()) !== 'request') throw new HttpsError('not-found', 'Urlaub nicht gefunden.')
    transaction.set(metaRef, {
      payrollProcessed,
      hrNote: note,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
      ...(currentMeta.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true })
  })
  return { vacationId }
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
    if (kind === 'cancellation') {
      const rootVacation = await transaction.get(db.collection('vacationRequests').doc(rootId))
      if (!rootVacation.exists || (rootVacation.data().mainStatus || rootVacation.data().status) !== 'approved') throw new HttpsError('failed-precondition', 'Der zugehörige Urlaub ist nicht mehr genehmigt.')
    }
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
export { analyzeLiabilityTransportOrder } from './liabilityLetters.js'
export { listAiPromptConfigs, publishAiPromptDraft, resetAiPromptDraft, saveAiPromptDraft } from './aiPrompts.js'
export { generateKnowledgeProcessDraft } from './knowledgeProcessAi.js'
export { requireActiveProfileBeforeSignIn } from './authBlocking.js'
export {
  listSystemMailTemplates,
  notifyVacationRequestCreated,
  notifyVacationRequestDecision,
  sendSystemTestMail,
  updateSystemMailTemplate,
} from './systemMails.js'
