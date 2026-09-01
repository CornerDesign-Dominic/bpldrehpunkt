import { NavLink } from 'react-router-dom'
import { ChevronIcon, CrmIcon, DashboardIcon, PalletsIcon, UsersIcon } from '../icons.jsx'

const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: DashboardIcon },
  { label: 'Kunden & Unternehmer', to: '/kunden-unternehmer', icon: UsersIcon },
  { label: 'CRM', to: '/crm', icon: CrmIcon },
  { label: 'Palettenmanagement', to: '/paletten', icon: PalletsIcon },
]

export default function Sidebar({ collapsed, onToggle }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="brand-mark" aria-hidden="true">D</span>
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

      <button className="sidebar__toggle" type="button" onClick={onToggle} aria-label={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'} title={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'}>
        <span className={collapsed ? 'toggle-icon toggle-icon--collapsed' : 'toggle-icon'}><ChevronIcon /></span>
      </button>
    </aside>
  )
}
