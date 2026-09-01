import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase.js'

export const USER_PROFILES_COLLECTION = 'users'
export const USER_ROLES = ['admin', 'user']
export const USER_PROFILE_FIELDS = ['name', 'email', 'active', 'role', 'department', 'createdAt', 'updatedAt']

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, USER_PROFILES_COLLECTION, uid))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}
