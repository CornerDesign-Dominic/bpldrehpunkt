import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'
import { USER_ROLES, getSafeProfileDefaults } from './permissions.js'

export const USER_PROFILES_COLLECTION = 'users'
export { USER_ROLES }
export const USER_PROFILE_FIELDS = ['firstName', 'lastName', 'birthDate', 'phone', 'email', 'jobTitle', 'departmentId', 'departmentName', 'department', 'role', 'permissions', 'vacationManager', 'vacationManagerAllDepartments', 'vacationManagerDepartments', 'active', 'employmentStart', 'personnelNumber', 'createdAt', 'updatedAt']
export const ADMIN_MANAGED_USER_PROFILE_FIELDS = ['firstName', 'lastName', 'birthDate', 'phone', 'email', 'jobTitle', 'departmentId', 'departmentName', 'department', 'active', 'employmentStart', 'personnelNumber']
export const USER_AVAILABILITY_STATUSES = [
  { value: 'working', label: 'Arbeitend' },
  { value: 'vacation', label: 'Urlaub' },
  { value: 'away', label: 'Abwesend' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'break', label: 'Pause' },
  { value: 'sick', label: 'Krank' },
  { value: 'unavailable', label: 'Nicht verfügbar' },
]

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, USER_PROFILES_COLLECTION, uid))
  return snapshot.exists() ? getSafeProfileDefaults({ id: snapshot.id, ...snapshot.data() }) : null
}

export async function listUserProfiles() {
  const snapshot = await getDocs(collection(db, USER_PROFILES_COLLECTION))
  return snapshot.docs.map((item) => getSafeProfileDefaults({ id: item.id, ...item.data() }))
}

// This is intentionally not a Firestore profile query. The callable returns
// only the fields required by the team, vacation and to-do directories.
export async function listVisibleUserDirectory() {
  const result = await httpsCallable(functions, 'listVisibleUserDirectory')()
  return Array.isArray(result.data?.profiles) ? result.data.profiles : []
}

export function getUserDisplayName(profile, user) {
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()
  return name || profile?.name || user?.email || 'Benutzer'
}

export function canManageUserProfiles(profile) {
  return ['admin', 'superadmin'].includes(profile?.role)
}

export function getUserAvailabilityStatus(profile) {
  return USER_AVAILABILITY_STATUSES.find((status) => status.value === profile?.availabilityStatus) ?? null
}
