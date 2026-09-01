import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from './firebase.js'

export const USER_PROFILES_COLLECTION = 'users'
export const USER_ROLES = ['admin', 'user']
export const USER_PROFILE_FIELDS = ['firstName', 'lastName', 'birthDate', 'phone', 'email', 'jobTitle', 'department', 'role', 'active', 'employmentStart', 'personnelNumber', 'createdAt', 'updatedAt']
export const ADMIN_MANAGED_USER_PROFILE_FIELDS = ['firstName', 'lastName', 'birthDate', 'phone', 'email', 'jobTitle', 'department', 'role', 'active', 'employmentStart', 'personnelNumber']
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
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export async function listUserProfiles() {
  const snapshot = await getDocs(collection(db, USER_PROFILES_COLLECTION))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export function getUserDisplayName(profile, user) {
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()
  return name || profile?.name || user?.email || 'Benutzer'
}

export function canManageUserProfiles(profile) {
  return profile?.role === 'admin'
}

export function getUserAvailabilityStatus(profile) {
  return USER_AVAILABILITY_STATUSES.find((status) => status.value === profile?.availabilityStatus) ?? null
}
