import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, authPersistenceReady, db, waitForAppCheckToken } from '../lib/firebase.js'
import { getSafeProfileDefaults } from '../lib/permissions.js'
import { AuthContext } from './authContext.js'

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({ user: null, profile: null, isLoading: true })
  const [accessDenied, setAccessDenied] = useState(false)

  useEffect(() => {
    let isMounted = true
    let stateVersion = 0

    let unsubscribe = () => {}
    let unsubscribeProfile = () => {}
    authPersistenceReady.finally(() => {
      if (!isMounted) return
      unsubscribe = onAuthStateChanged(auth, (user) => {
        const currentVersion = ++stateVersion
        unsubscribeProfile()
        if (!user) {
          if (isMounted) setAuthState({ user: null, profile: null, isLoading: false })
          return
        }
        setAccessDenied(false)
        // Protected callables are rendered as soon as the profile is ready.
        // Waiting here prevents every post-login page from racing the first
        // reCAPTCHA Enterprise attestation and sending unauthenticated calls.
        void waitForAppCheckToken().catch(() => null).finally(() => {
          if (!isMounted || currentVersion !== stateVersion) return
          unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
            const profile = snapshot.exists() ? getSafeProfileDefaults({ id: snapshot.id, ...snapshot.data() }) : null
            // A profile must be explicitly confirmed as active.  This mirrors
            // the server-side access checks and avoids treating a missing
            // `active` field as a usable account.
            const profileIsActive = Boolean(profile) && profile.active === true
            if (!profileIsActive) {
              if (isMounted && currentVersion === stateVersion) {
                setAccessDenied(true)
                setAuthState({ user: null, profile: null, isLoading: false })
              }
              unsubscribeProfile()
              signOut(auth).catch(() => undefined)
              return
            }
            if (isMounted && currentVersion === stateVersion) setAuthState({ user, profile, isLoading: false })
          }, () => {
            if (isMounted && currentVersion === stateVersion) {
              setAccessDenied(true)
              setAuthState({ user: null, profile: null, isLoading: false })
            }
            unsubscribeProfile()
            signOut(auth).catch(() => undefined)
          })
        })
      })
    })

    return () => {
      isMounted = false
      unsubscribe()
      unsubscribeProfile()
    }
  }, [])

  const value = useMemo(() => ({
    ...authState,
    isProfileActive: Boolean(authState.profile) && authState.profile.active === true,
    accessDenied,
  }), [accessDenied, authState])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
