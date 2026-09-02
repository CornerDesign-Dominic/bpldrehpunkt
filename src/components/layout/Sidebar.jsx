import { NavLink } from 'react-router-dom'
import { ChevronIcon, CrmIcon, DashboardIcon, DocumentsIcon, DrehpunktLogoIcon, MoonIcon, NewsIcon, PalletsIcon, ShieldIcon, SunIcon, TodoIcon, UsersIcon, VacationIcon } from '../icons.jsx'

const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: DashboardIcon },
  { label: 'Team Brennpunkt', to: '/team', icon: UsersIcon },
  { label: 'Kunden & Unternehmer', to: '/kunden-unternehmer', icon: UsersIcon },
  { label: 'CRM', to: '/crm', icon: CrmIcon },
  { label: 'Palettenmanagement', to: '/paletten', icon: PalletsIcon },
  { label: 'News', to: '/news', icon: NewsIcon },
  { label: 'Dokumente', to: '/dokumente', icon: DocumentsIcon },
  { label: 'To-dos', to: '/todos', icon: TodoIcon },
  { label: 'Urlaub', to: '/urlaub', icon: VacationIcon },
  { label: 'Adminbereich', to: '/admin', icon: ShieldIcon },
]

export default function Sidebar({ collapsed, onToggle, theme, onThemeToggle }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="brand-mark" aria-hidden="true"><DrehpunktLogoIcon /></span>
        {!collapsed && <span className="brand-name">Drehpunkt</span>}
      </div>

      <nav className="sidebar__nav" aria-label="Hauptnavigation">
        {navigationItems.map(({ label, to, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`} title={collapsed ? label : undefined}>
            <Icon />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <button className="sidebar__theme-toggle" type="button" onClick={onThemeToggle} aria-label={theme === 'light' ? 'Dunkles Design aktivieren' : 'Helles Design aktivieren'} title={theme === 'light' ? 'Dunkles Design aktivieren' : 'Helles Design aktivieren'}>{theme === 'light' ? <MoonIcon /> : <SunIcon />}</button>
        <button className="sidebar__toggle" type="button" onClick={onToggle} aria-label={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'} title={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'}>
          <span className={collapsed ? 'toggle-icon toggle-icon--collapsed' : 'toggle-icon'}><ChevronIcon size={20} /></span>
        </button>
      </div>
    </aside>
  )
}
