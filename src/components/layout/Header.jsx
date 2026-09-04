import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signOutUser } from '../../auth/authService.js'
import { useAuth } from '../../auth/useAuth.js'
import { ProfileIcon } from '../icons.jsx'
import { getPageTitle } from '../../lib/pageTitles.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'

export default function Header() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { profile, user } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || profile?.name || ''
  const profileEmail = user?.email || profile?.email || ''
  const displayName = profileName || getUserDisplayName(profile, user)

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
      <details className="profile-menu">
        <summary className="profile-menu__trigger" aria-label="Profilmenü öffnen"><span className="profile-menu__identity"><strong>{displayName}</strong>{profileEmail && <small>{profileEmail}</small>}</span><span className="profile-menu__icon"><ProfileIcon size={21} /></span></summary>
        <div className="profile-menu__content"><Link to="/profil" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>Mein Profil</Link><button type="button" onClick={handleSignOut} disabled={isSigningOut}>{isSigningOut ? 'Wird abgemeldet …' : 'Abmelden'}</button></div>
      </details>
    </header>
  )
}
