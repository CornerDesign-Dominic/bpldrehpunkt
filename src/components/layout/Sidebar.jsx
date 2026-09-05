import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { signOutUser } from '../../auth/authService.js'
import { useAuth } from '../../auth/useAuth.js'
import { canManageUsers, canManageVacations, canView } from '../../lib/permissions.js'
import { CalendarIcon, ChevronIcon, CrmIcon, DashboardIcon, DocumentsIcon, DrehpunktLogoIcon, NewsIcon, PalletsIcon, ShieldIcon, SignOutIcon, TemplatesIcon, TodoIcon, UsersIcon, VacationIcon } from '../icons.jsx'
import { getUserDisplayName } from '../../lib/userProfiles.js'
import { SIDEBAR_BADGE_DEFINITIONS } from '../../lib/sidebarBadges.js'

const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: DashboardIcon, group: 'overview' },
  { label: 'Kalender', to: '/kalender', icon: CalendarIcon, module: 'calendar', group: 'overview' },
  { label: 'News', to: '/news', icon: NewsIcon, module: 'news', group: 'overview', badge: 'news' },
  { label: 'Urlaub', to: '/urlaub', icon: VacationIcon, module: 'vacation', group: 'people' },
  { label: 'Urlaubsmanagement', to: '/urlaubsmanagement', icon: VacationIcon, vacationManagement: true, group: 'people', badge: 'vacationManagement' },
  { label: 'Team Brennpunkt', to: '/team', icon: UsersIcon, module: 'team', group: 'people' },
  { label: 'To-dos', to: '/todos', icon: TodoIcon, module: 'todos', group: 'people', badge: 'todos' },
  { label: 'Kunden & Unternehmer', to: '/kunden-unternehmer', icon: UsersIcon, module: 'masterData', group: 'customers' },
  { label: 'CRM', to: '/crm', icon: CrmIcon, module: 'crm', group: 'customers' },
  { label: 'Palettenmanagement', to: '/paletten', icon: PalletsIcon, module: 'pallets', group: 'customers' },
  { label: 'Dokumente', to: '/dokumente', icon: DocumentsIcon, module: 'documents', group: 'documents' },
  { label: 'Vorlagen', to: '/vorlagen', icon: TemplatesIcon, module: 'templates', group: 'documents' },
  { label: 'Adminbereich', to: '/admin', icon: ShieldIcon, administration: true, group: 'administration' },
]

const navigationGroups = [
  { key: 'overview', label: 'Übersicht' },
  { key: 'people', label: 'Personal & Team' },
  { key: 'customers', label: 'Kunden & Disposition' },
  { key: 'documents', label: 'Dokumente' },
  { key: 'administration', label: 'Verwaltung' },
]

export default function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate()
  const { profile, user } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [badgeCounts, setBadgeCounts] = useState({})
  const visibleItems = navigationItems.filter((item) => item.administration ? canManageUsers(profile) : item.vacationManagement ? canManageVacations(profile) : !item.module || canView(profile, item.module))
  const visibleBadgeKeys = [...new Set(visibleItems.map((item) => item.badge).filter(Boolean))].sort().join(',')
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || profile?.name || getUserDisplayName(profile, user)
  const profileEmail = user?.email || profile?.email || ''
  const initials = profileName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'

  useEffect(() => {
    let isCurrent = true
    const badgeKeys = visibleBadgeKeys ? visibleBadgeKeys.split(',') : []

    async function loadBadges() {
      const entries = await Promise.all(badgeKeys.map(async (key) => {
        try {
          return [key, await SIDEBAR_BADGE_DEFINITIONS[key].getCount({ user, profile })]
        } catch {
          return [key, 0]
        }
      }))
      if (isCurrent) setBadgeCounts(Object.fromEntries(entries))
    }

    void loadBadges()
    const refreshTimer = window.setInterval(loadBadges, 60000)
    window.addEventListener('focus', loadBadges)
    return () => {
      isCurrent = false
      window.clearInterval(refreshTimer)
      window.removeEventListener('focus', loadBadges)
    }
  }, [profile, user, visibleBadgeKeys])

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
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="brand-mark" aria-hidden="true"><DrehpunktLogoIcon /></span>
        {!collapsed && <span className="brand-name">Drehpunkt</span>}
      </div>

      <NavLink className={({ isActive }) => `sidebar__profile${isActive ? ' active' : ''}`} to="/profil" title={collapsed ? 'Mein Profil' : undefined}>
        <span className="sidebar__profile-avatar" aria-hidden="true">{initials}</span>
        {!collapsed && <span className="sidebar__profile-identity"><strong>{profileName}</strong>{profileEmail && <small>{profileEmail}</small>}</span>}
      </NavLink>

      <nav className="sidebar__nav" aria-label="Hauptnavigation">
        {navigationGroups.map((group) => {
          const groupItems = visibleItems.filter((item) => item.group === group.key)
          if (!groupItems.length) return null
          return <div className="sidebar__nav-group" key={group.key}>
            {!collapsed && <span className="sidebar__nav-group-label">{group.label}</span>}
            {groupItems.map(({ badge, label, to, icon: Icon }) => {
              const count = badge ? badgeCounts[badge] || 0 : 0
              const variant = badge ? SIDEBAR_BADGE_DEFINITIONS[badge]?.variant : ''
              return <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`} title={collapsed ? label : undefined}>
              <Icon />
              {!collapsed && <><span className="nav-item__label">{label}</span>{count > 0 && <span className={`nav-item__badge nav-item__badge--${variant}`}>{count > 9 ? '9+' : count}</span>}</>}
            </NavLink>
            })}
          </div>
        })}
      </nav>

      <div className="sidebar__footer">
        {!collapsed && <button className="sidebar__signout" type="button" onClick={handleSignOut} disabled={isSigningOut}><SignOutIcon />{isSigningOut ? 'Wird abgemeldet …' : 'Abmelden'}</button>}
        <button className="sidebar__toggle" type="button" onClick={onToggle} aria-label={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'} title={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'}>
          <span className={collapsed ? 'toggle-icon toggle-icon--collapsed' : 'toggle-icon'}><ChevronIcon size={20} /></span>
        </button>
      </div>
    </aside>
  )
}
