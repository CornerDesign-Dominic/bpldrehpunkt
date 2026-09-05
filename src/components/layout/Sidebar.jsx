import { NavLink } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth.js'
import { canManageUsers, canManageVacations, canView } from '../../lib/permissions.js'
import { CalendarIcon, ChevronIcon, CrmIcon, DashboardIcon, DocumentsIcon, DrehpunktLogoIcon, MoonIcon, NewsIcon, PalletsIcon, ShieldIcon, SunIcon, TemplatesIcon, TodoIcon, UsersIcon, VacationIcon } from '../icons.jsx'

const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: DashboardIcon },
  { label: 'Urlaub', to: '/urlaub', icon: VacationIcon, module: 'vacation' },
  { label: 'Kalender', to: '/kalender', icon: CalendarIcon, module: 'calendar' },
  { label: 'Urlaubsmanagement', to: '/urlaubsmanagement', icon: VacationIcon, vacationManagement: true },
  { label: 'Team Brennpunkt', to: '/team', icon: UsersIcon, module: 'team' },
  { label: 'Kunden & Unternehmer', to: '/kunden-unternehmer', icon: UsersIcon, module: 'masterData' },
  { label: 'CRM', to: '/crm', icon: CrmIcon, module: 'crm' },
  { label: 'Palettenmanagement', to: '/paletten', icon: PalletsIcon, module: 'pallets' },
  { label: 'News', to: '/news', icon: NewsIcon, module: 'news' },
  { label: 'Dokumente', to: '/dokumente', icon: DocumentsIcon, module: 'documents' },
  { label: 'Vorlagen', to: '/vorlagen', icon: TemplatesIcon, module: 'templates' },
  { label: 'To-dos', to: '/todos', icon: TodoIcon, module: 'todos' },
  { label: 'Adminbereich', to: '/admin', icon: ShieldIcon, administration: true },
]

export default function Sidebar({ collapsed, onToggle, theme, onThemeToggle }) {
  const { profile } = useAuth()
  const visibleItems = navigationItems.filter((item) => item.administration ? canManageUsers(profile) : item.vacationManagement ? canManageVacations(profile) : !item.module || canView(profile, item.module))
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="brand-mark" aria-hidden="true"><DrehpunktLogoIcon /></span>
        {!collapsed && <span className="brand-name">Drehpunkt</span>}
      </div>

      <nav className="sidebar__nav" aria-label="Hauptnavigation">
        {visibleItems.map(({ label, to, icon: Icon }) => (
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
