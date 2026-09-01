import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { signOutUser } from '../../auth/authService.js'
import { useAuth } from '../../auth/useAuth.js'
import { getPageTitle } from '../../lib/pageTitles.js'

export default function Header() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOutUser()
      navigate('/login', { replace: true })
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <header className="app-header">
      <h1>{getPageTitle(pathname)}</h1>
      <div className="user-placeholder" aria-label="Angemeldeter Benutzer">
        <span className="user-placeholder__dot" />
        <span>{user?.email || 'Benutzer'}</span>
        <button className="text-button" type="button" onClick={handleSignOut} disabled={isSigningOut}>{isSigningOut ? 'Wird abgemeldet …' : 'Abmelden'}</button>
      </div>
    </header>
  )
}
