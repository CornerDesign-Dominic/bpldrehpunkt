import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase.js'

export const USER_PROFILES_COLLECTION = 'users'
export const USER_ROLES = ['admin', 'user']
export const USER_PROFILE_FIELDS = ['firstName', 'lastName', 'birthDate', 'phone', 'mobile', 'email', 'department', 'role', 'active', 'employmentStart', 'personnelNumber', 'createdAt', 'updatedAt']

const trimValue = (value) => (value ?? '').trim()

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, USER_PROFILES_COLLECTION, uid))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export function getUserDisplayName(profile, user) {
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()
  return name || profile?.name || user?.email || 'Benutzer'
}

export async function updateOwnUserProfile(user, values) {
  const profileRef = doc(db, USER_PROFILES_COLLECTION, user.uid)
  const editableValues = {
    firstName: trimValue(values.firstName),
    lastName: trimValue(values.lastName),
    birthDate: values.birthDate || '',
    phone: trimValue(values.phone),
    mobile: trimValue(values.mobile),
    updatedAt: serverTimestamp(),
  }
  const existingProfile = await getDoc(profileRef)

  if (existingProfile.exists()) {
    await updateDoc(profileRef, editableValues)
    return
  }

  await setDoc(profileRef, {
    ...editableValues,
    email: user.email ?? '',
    department: '',
    role: 'user',
    active: true,
    employmentStart: '',
    personnelNumber: '',
    createdAt: serverTimestamp(),
  })
}
