import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, authPersistenceReady } from '../lib/firebase.js'
import { getUserProfile } from '../lib/userProfiles.js'
import { AuthContext } from './authContext.js'

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({ user: null, profile: null, isLoading: true })

  useEffect(() => {
    let isMounted = true
    let stateVersion = 0

    let unsubscribe = () => {}
    authPersistenceReady.finally(() => {
      if (!isMounted) return
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        const currentVersion = ++stateVersion
        if (!user) {
          if (isMounted) setAuthState({ user: null, profile: null, isLoading: false })
          return
        }

        const profile = await getUserProfile(user.uid).catch(() => null)

        if (isMounted && currentVersion === stateVersion) setAuthState({ user, profile, isLoading: false })
      })
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({
    ...authState,
    isProfileActive: authState.profile?.active !== false,
  }), [authState])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
