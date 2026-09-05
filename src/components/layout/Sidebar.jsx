import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { signOutUser } from '../../auth/authService.js'
import { useAuth } from '../../auth/useAuth.js'
import { canManageUsers, canManageVacations, canView } from '../../lib/permissions.js'
import { CalendarIcon, ChevronIcon, CrmIcon, DashboardIcon, DocumentsIcon, DrehpunktLogoIcon, MoonIcon, NewsIcon, PalletsIcon, ShieldIcon, SignOutIcon, SunIcon, TemplatesIcon, TodoIcon, UsersIcon, VacationIcon } from '../icons.jsx'
import { getUserDisplayName } from '../../lib/userProfiles.js'

const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: DashboardIcon, group: 'overview' },
  { label: 'Kalender', to: '/kalender', icon: CalendarIcon, module: 'calendar', group: 'overview' },
  { label: 'News', to: '/news', icon: NewsIcon, module: 'news', group: 'overview' },
  { label: 'Urlaub', to: '/urlaub', icon: VacationIcon, module: 'vacation', group: 'people' },
  { label: 'Urlaubsmanagement', to: '/urlaubsmanagement', icon: VacationIcon, vacationManagement: true, group: 'people' },
  { label: 'Team Brennpunkt', to: '/team', icon: UsersIcon, module: 'team', group: 'people' },
  { label: 'To-dos', to: '/todos', icon: TodoIcon, module: 'todos', group: 'people' },
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

export default function Sidebar({ collapsed, onToggle, theme, onThemeToggle }) {
  const navigate = useNavigate()
  const { profile, user } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const visibleItems = navigationItems.filter((item) => item.administration ? canManageUsers(profile) : item.vacationManagement ? canManageVacations(profile) : !item.module || canView(profile, item.module))
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || profile?.name || getUserDisplayName(profile, user)
  const profileEmail = user?.email || profile?.email || ''
  const initials = profileName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'

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
            {groupItems.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`} title={collapsed ? label : undefined}>
              <Icon />
              {!collapsed && <span>{label}</span>}
            </NavLink>)}
          </div>
        })}
      </nav>

      <div className="sidebar__footer">
        {!collapsed && <button className="sidebar__signout" type="button" onClick={handleSignOut} disabled={isSigningOut}><SignOutIcon />{isSigningOut ? 'Wird abgemeldet …' : 'Abmelden'}</button>}
        <div className="sidebar__footer-controls">
          <button className="sidebar__theme-toggle" type="button" onClick={onThemeToggle} aria-label={theme === 'light' ? 'Dunkles Design aktivieren' : 'Helles Design aktivieren'} title={theme === 'light' ? 'Dunkles Design aktivieren' : 'Helles Design aktivieren'}>{theme === 'light' ? <MoonIcon /> : <SunIcon />}</button>
          <button className="sidebar__toggle" type="button" onClick={onToggle} aria-label={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'} title={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'}>
            <span className={collapsed ? 'toggle-icon toggle-icon--collapsed' : 'toggle-icon'}><ChevronIcon size={20} /></span>
          </button>
        </div>
      </div>
    </aside>
  )
}
