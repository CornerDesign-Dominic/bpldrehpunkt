import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { signOutUser } from '../../auth/authService.js'
import { useAuth } from '../../auth/useAuth.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { canManageUsers, canManageVacations, canView, canViewSystemCalendars } from '../../lib/permissions.js'
import { CalendarIcon, ChevronDownIcon, ChevronIcon, CrmIcon, DamageIcon, DashboardIcon, DocumentSearchIcon, DocumentsIcon, DrehpunktLogoIcon, InkassoIcon, InsolvenciesIcon, LegalDisputesIcon, NewsIcon, PalletsIcon, SettingsIcon, ShieldIcon, ShieldOutlineIcon, SignOutIcon, StarIcon, TemplatesIcon, TodoIcon, TruckTrailerIcon, UserPlusIcon, UsersIcon, VacationIcon } from '../icons.jsx'
import { getUserDisplayName } from '../../lib/userProfiles.js'
import { readSidebarExpandedGroups, readSidebarFavorites, readSidebarFavoritesExpanded, saveSidebarExpandedGroups, saveSidebarFavorites, saveSidebarFavoritesExpanded } from '../../lib/sidebarPreferences.js'

const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: DashboardIcon, module: 'dashboard', group: 'general' },
  { label: 'To-dos', to: '/todos', icon: TodoIcon, module: 'todos', group: 'general' },
  { label: 'Notizen', to: '/notizen', icon: DocumentsIcon, group: 'general' },
  { label: 'Kalender', to: '/kalender', icon: CalendarIcon, module: 'calendar', group: 'general' },
  { label: 'Feiertagskalender', to: '/feiertagskalender', icon: CalendarIcon, module: 'feiertagskalender', group: 'documents' },
  { label: 'News', to: '/news', icon: NewsIcon, module: 'news', group: 'more' },
  { label: 'Das Team', to: '/team', icon: UsersIcon, module: 'team', group: 'people' },
  { label: 'Mein Urlaub', to: '/urlaub', icon: VacationIcon, module: 'vacation', group: 'people' },
  { label: 'Personal', to: '/personal', icon: UsersIcon, module: 'personnel', group: 'humanResources' },
  { label: 'Urlaubsmanagement', to: '/urlaubsmanagement', icon: VacationIcon, vacationManagement: true, group: 'people' },
  { label: 'Auftragsliste', to: '/transportauftraege', icon: TruckTrailerIcon, module: 'transportOrders', group: 'operations' },
  { label: 'Palettenmanagement', to: '/paletten', icon: PalletsIcon, module: 'pallets', group: 'operations' },
  { label: 'Kunden & Unternehmer', to: '/kunden-unternehmer', icon: UsersIcon, module: 'masterData', group: 'partnerSales' },
  { label: 'CRM', to: '/crm', icon: CrmIcon, module: 'crm', group: 'partnerSales' },
  { label: 'Schäden', to: '/schaeden', icon: DamageIcon, module: 'damages', group: 'cases' },
  { label: 'Inkasso', to: '/inkasso', icon: InkassoIcon, module: 'inkasso', group: 'cases' },
  { label: 'Gericht / Streit', to: '/legal-disputes', icon: LegalDisputesIcon, module: 'legalDisputes', group: 'cases' },
  { label: 'Insolvenzen', to: '/insolvenzen', icon: InsolvenciesIcon, module: 'insolvencies', group: 'cases' },
  { label: 'Dokumente', to: '/dokumente', icon: DocumentsIcon, module: 'documents', group: 'documents' },
  { label: 'Vorlagen', to: '/vorlagen', icon: TemplatesIcon, module: 'templates', group: 'documents' },
  { label: 'AGB-Prüfer', to: '/agb-pruefer', icon: DocumentSearchIcon, module: 'agbChecker', group: 'documents' },
  { label: 'Adminbereich', to: '/admin', icon: ShieldIcon, administration: true, group: 'administration' },
  { label: 'Sendungsverfolgung', to: '/admin/sendungsverfolgung', icon: TruckTrailerIcon, administration: true, group: 'administration' },
  { label: 'Systemmails', to: '/admin/systemmails', icon: DocumentsIcon, superadminOnly: true, group: 'administration' },
  { label: 'KI', to: '/admin/ki-prompts', icon: DocumentSearchIcon, superadminOnly: true, group: 'administration' },
  { label: 'Stammdaten', to: '/admin/stammdaten', icon: DocumentsIcon, administration: true, group: 'administration' },
  { label: 'Diagnose', to: '/admin/diagnose', icon: DocumentSearchIcon, administration: true, group: 'administration' },
]

const navigationGroups = [
  { key: 'general', label: 'Allgemein', icon: DashboardIcon },
  { key: 'people', label: 'Team', icon: UsersIcon },
  { key: 'humanResources', label: 'Personalwesen', icon: VacationIcon },
  { key: 'operations', label: 'Disposition', icon: TruckTrailerIcon },
  { key: 'partnerSales', label: 'Partner & Vertrieb', icon: UserPlusIcon },
  { key: 'cases', label: 'Fallmanagement', icon: ShieldOutlineIcon },
  { key: 'documents', label: 'Dokumente & Werkzeuge', icon: DocumentsIcon },
  { key: 'more', label: 'Weiteres', icon: NewsIcon },
  { key: 'administration', label: 'System', icon: SettingsIcon },
]

const navigationLabelKeys = {
  '/dashboard': 'nav.dashboard', '/todos': 'nav.todos', '/notizen': 'nav.notes', '/kalender': 'nav.calendar',
  '/feiertagskalender': 'nav.holidays', '/news': 'nav.news', '/team': 'nav.team', '/urlaub': 'nav.vacation',
  '/personal': 'nav.personnel', '/urlaubsmanagement': 'nav.vacationManagement', '/transportauftraege': 'nav.orders',
  '/paletten': 'nav.pallets', '/kunden-unternehmer': 'nav.partners', '/crm': 'nav.crm', '/schaeden': 'nav.damages',
  '/inkasso': 'nav.collections', '/legal-disputes': 'nav.disputes', '/insolvenzen': 'nav.insolvencies',
  '/dokumente': 'nav.documents', '/vorlagen': 'nav.templates', '/agb-pruefer': 'nav.termsChecker',
  '/admin': 'nav.admin', '/admin/sendungsverfolgung': 'nav.shipmentTracking', '/admin/systemmails': 'nav.systemMails',
  '/admin/ki-prompts': 'nav.ai', '/admin/stammdaten': 'nav.masterData', '/admin/diagnose': 'nav.diagnostics',
}

function itemIsActive(item, pathname) {
  if (item.to === '/admin') return pathname === '/admin'
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function NavigationItem({ item, collapsed, favorite, onToggleFavorite, showFavoriteControl = false, suppressActive = false, onSelect }) {
  const { t } = useLanguage()
  const { label, to, icon: Icon } = item

  return <div className="nav-item-row">
    <NavLink to={to} end={to === '/admin'} className={({ isActive }) => `nav-item ${isActive && !suppressActive ? 'nav-item--active' : ''}`} title={collapsed ? label : undefined} onClick={() => onSelect?.(item)}>
      {collapsed && <Icon />}
      {!collapsed && <span className="nav-item__label">{label}</span>}
    </NavLink>
    {showFavoriteControl && !collapsed && <button className={`nav-item-favorite${favorite ? ' nav-item-favorite--active' : ''}`} type="button" aria-label={t(favorite ? 'nav.removeFavorite' : 'nav.addFavorite', { label })} aria-pressed={favorite} title={t(favorite ? 'nav.removeFavoriteTitle' : 'nav.addFavoriteTitle')} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleFavorite(item.id) }}><StarIcon filled={favorite} /></button>}
  </div>
}

export default function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, user } = useAuth()
  const { t } = useLanguage()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const visibleItems = navigationItems.map((item) => ({ ...item, id: item.to, label: t(navigationLabelKeys[item.to]) })).filter((item) => item.superadminOnly ? profile?.active === true && profile?.role === 'superadmin' : item.administration ? canManageUsers(profile) : item.vacationManagement ? canManageVacations(profile) : item.module === 'calendar' ? canView(profile, 'calendar') || canViewSystemCalendars(profile) : !item.module || canView(profile, item.module))
  const visibleItemIds = visibleItems.map((item) => item.id)
  const groupIds = navigationGroups.map((group) => group.key)
  const activeGroupIds = [...new Set(visibleItems.filter((item) => itemIsActive(item, location.pathname)).map((item) => item.group))]
  const activeGroupId = activeGroupIds[0] || null
  const [favoriteIds, setFavoriteIds] = useState(() => readSidebarFavorites(user?.uid, visibleItemIds))
  const [expandedSection, setExpandedSection] = useState(() => {
    const saved = readSidebarExpandedGroups(user?.uid, groupIds).slice(-1)
    if (readSidebarFavoritesExpanded(user?.uid)) return 'favorites'
    return saved[0] || activeGroupId || null
  })
  const [activeFavoriteItemId, setActiveFavoriteItemId] = useState(null)
  const activeFavoriteItem = visibleItems.find((item) => item.id === activeFavoriteItemId)
  const isFavoriteSelectionActive = activeFavoriteItem && itemIsActive(activeFavoriteItem, location.pathname)
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || profile?.name || getUserDisplayName(profile, user)
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

  function toggleFavorite(itemId) {
    setFavoriteIds((current) => {
      const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
      saveSidebarFavorites(user?.uid, next)
      return next
    })
  }

  function selectSection(sectionId) {
    setExpandedSection(sectionId)
    saveSidebarFavoritesExpanded(user?.uid, sectionId === 'favorites')
    saveSidebarExpandedGroups(user?.uid, sectionId && sectionId !== 'favorites' ? [sectionId] : [])
  }

  function toggleGroup(groupId) {
    selectSection(expandedSection === groupId ? null : groupId)
  }

  function openGroup(groupId) {
    selectSection(groupId)
  }

  function toggleFavorites() {
    selectSection(expandedSection === 'favorites' ? null : 'favorites')
  }

  const favoriteItems = favoriteIds.map((id) => visibleItems.find((item) => item.id === id)).filter(Boolean)

  function selectFavorite(item) {
    setActiveFavoriteItemId(item.id)
    selectSection('favorites')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="brand-mark" aria-hidden="true"><DrehpunktLogoIcon /></span>
        {!collapsed && <span className="brand-name"><StaticText source={"Drehpunkt"} /></span>}
      </div>

      <NavLink className={({ isActive }) => `sidebar__profile${isActive ? ' active' : ''}`} to="/profil" title={collapsed ? t('nav.profile') : undefined}>
        <span className="sidebar__profile-avatar" aria-hidden="true">{initials}</span>
        {!collapsed && <span className="sidebar__profile-identity"><strong>{profileName}</strong></span>}
      </NavLink>

      <nav className="sidebar__nav" aria-label={t('nav.main')}>
        {!collapsed && favoriteItems.length > 0 && <section className={`sidebar__nav-group sidebar__favorites${expandedSection === 'favorites' ? ' sidebar__nav-group--expanded' : ''}`}>
          <button className="sidebar__nav-group-toggle" type="button" aria-expanded={expandedSection === 'favorites'} aria-controls="sidebar-group-favorites" onClick={toggleFavorites}><span className="sidebar__nav-group-title"><StarIcon size={18} /><span>{t('nav.favorites')}</span></span><ChevronDownIcon /></button>
          <div className={`sidebar__nav-group-items${expandedSection === 'favorites' ? '' : ' sidebar__nav-group-items--collapsed'}`} id="sidebar-group-favorites"><div className="sidebar__nav-group-items-inner">
            {favoriteItems.map((item) => <NavigationItem key={`favorite-${item.id}`} item={item} collapsed={collapsed} onSelect={selectFavorite} />)}
          </div></div>
        </section>}
        {navigationGroups.map((group) => {
          const groupItems = visibleItems.filter((item) => item.group === group.key)
          if (!groupItems.length) return null
          const isActiveGroup = activeGroupId === group.key
          const isExpanded = collapsed || expandedSection === group.key
          const GroupIcon = group.icon
          return <section className={`sidebar__nav-group${isExpanded ? ' sidebar__nav-group--expanded' : ''}${isActiveGroup ? ' sidebar__nav-group--current' : ''}`} key={group.key}>
            {!collapsed && <button className="sidebar__nav-group-toggle" type="button" aria-expanded={isExpanded} aria-controls={`sidebar-group-${group.key}`} onClick={() => toggleGroup(group.key)}><span className="sidebar__nav-group-title"><GroupIcon size={18} /><span>{t(`group.${group.key}`)}</span></span><ChevronDownIcon /></button>}
            <div className={`sidebar__nav-group-items${isExpanded ? '' : ' sidebar__nav-group-items--collapsed'}`} id={`sidebar-group-${group.key}`}><div className="sidebar__nav-group-items-inner">
              {groupItems.map((item) => <NavigationItem key={item.id} item={item} favorite={favoriteIds.includes(item.id)} collapsed={collapsed} onToggleFavorite={toggleFavorite} showFavoriteControl suppressActive={isFavoriteSelectionActive && item.id === activeFavoriteItemId} onSelect={() => { setActiveFavoriteItemId(null); openGroup(group.key) }} />)}
            </div></div>
          </section>
        })}
      </nav>

      <div className="sidebar__footer">
        {!collapsed && <button className="sidebar__signout" type="button" onClick={handleSignOut} disabled={isSigningOut}><SignOutIcon />{t(isSigningOut ? 'nav.signingOut' : 'nav.signOut')}</button>}
        <button className="sidebar__toggle" type="button" onClick={onToggle} aria-label={t(collapsed ? 'nav.expand' : 'nav.collapse')} title={t(collapsed ? 'nav.expand' : 'nav.collapse')}>
          <span className={collapsed ? 'toggle-icon toggle-icon--collapsed' : 'toggle-icon'}><ChevronIcon size={20} /></span>
        </button>
      </div>
    </aside>
  )
}
