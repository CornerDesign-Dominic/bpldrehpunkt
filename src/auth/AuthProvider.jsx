import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, authPersistenceReady, db } from '../lib/firebase.js'
import { getSafeProfileDefaults } from '../lib/permissions.js'
import { AuthContext } from './authContext.js'

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({ user: null, profile: null, isLoading: true })

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
        unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
          const profile = snapshot.exists() ? getSafeProfileDefaults({ id: snapshot.id, ...snapshot.data() }) : null
          if (isMounted && currentVersion === stateVersion) setAuthState({ user, profile, isLoading: false })
        }, () => {
          if (isMounted && currentVersion === stateVersion) setAuthState({ user, profile: null, isLoading: false })
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
    // A missing legacy profile gets no module access via the permission helpers.
    isProfileActive: authState.profile?.active !== false,
  }), [authState])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
