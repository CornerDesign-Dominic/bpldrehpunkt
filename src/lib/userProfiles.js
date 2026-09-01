import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase.js'

export const USER_PROFILES_COLLECTION = 'users'
export const USER_ROLES = ['admin', 'user']
export const USER_PROFILE_FIELDS = ['firstName', 'lastName', 'birthDate', 'phone', 'email', 'jobTitle', 'department', 'role', 'active', 'employmentStart', 'personnelNumber', 'createdAt', 'updatedAt']
export const ADMIN_MANAGED_USER_PROFILE_FIELDS = ['firstName', 'lastName', 'birthDate', 'phone', 'email', 'jobTitle', 'department', 'role', 'active', 'employmentStart', 'personnelNumber']

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, USER_PROFILES_COLLECTION, uid))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export function getUserDisplayName(profile, user) {
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()
  return name || profile?.name || user?.email || 'Benutzer'
}

export function canManageUserProfiles(profile) {
  return profile?.role === 'admin'
}
