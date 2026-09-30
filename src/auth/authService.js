import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase.js'

export function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function requestPasswordReset(email) {
  auth.languageCode = 'de'
  return sendPasswordResetEmail(auth, email)
}

export function signOutUser() {
  return signOut(auth)
}
