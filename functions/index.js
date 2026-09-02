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
  await db.doc(`users/${user.uid}`).set({ ...profileFields(data), email: data.email, active: data.active !== false, role, permissions: actor.role === 'superadmin' ? permissions(data.permissions) : permissions(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
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
  if (actor.role === 'superadmin') { update.role = role; update.permissions = permissions(data.permissions) }
  await ref.update(update)
  await getAuth().updateUser(uid, { email: data.email ?? old.email, disabled: data.active === false, ...(data.password ? { password: data.password } : {}) })
  if (actor.role === 'superadmin') await getAuth().setCustomUserClaims(uid, { role })
  return { uid }
})
