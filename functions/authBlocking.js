import { getFirestore } from 'firebase-admin/firestore'
import { beforeUserSignedIn } from 'firebase-functions/v2/identity'
import { HttpsError } from 'firebase-functions/v2/https'
import { accessDeniedMessage, hasActiveProfile } from './access.js'

// This is deliberately only a sign-in hook: createManagedUser creates the
// Auth record before the Firestore profile and must remain functional.
export const requireActiveProfileBeforeSignIn = beforeUserSignedIn({ region: 'europe-west3' }, async (event) => {
  const uid = event.data?.uid
  const profileSnapshot = uid ? await getFirestore().doc(`users/${uid}`).get() : null
  if (!profileSnapshot?.exists || !hasActiveProfile(profileSnapshot.data())) {
    throw new HttpsError('permission-denied', accessDeniedMessage)
  }
})
