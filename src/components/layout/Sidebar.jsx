import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { signOutUser } from '../../auth/authService.js'
import { useAuth } from '../../auth/useAuth.js'
import { canManageUsers, canManageVacations, canView, canViewSystemCalendars } from '../../lib/permissions.js'
import { CalendarIcon, ChevronDownIcon, ChevronIcon, CrmIcon, DamageIcon, DashboardIcon, DocumentSearchIcon, DocumentsIcon, DrehpunktLogoIcon, InkassoIcon, InsolvenciesIcon, LegalDisputesIcon, NewsIcon, PalletsIcon, ShieldIcon, SignOutIcon, StarIcon, TemplatesIcon, TodoIcon, TruckTrailerIcon, UsersIcon, VacationIcon } from '../icons.jsx'
import { getUserDisplayName } from '../../lib/userProfiles.js'
import { SIDEBAR_BADGE_DEFINITIONS } from '../../lib/sidebarBadges.js'
import { readSidebarExpandedGroups, readSidebarFavorites, saveSidebarExpandedGroups, saveSidebarFavorites } from '../../lib/sidebarPreferences.js'

const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: DashboardIcon, module: 'dashboard', group: 'general' },
  { label: 'To-dos', to: '/todos', icon: TodoIcon, module: 'todos', group: 'general', badge: 'todos' },
  { label: 'Notizen', to: '/notizen', icon: DocumentsIcon, group: 'general' },
  { label: 'Kalender', to: '/kalender', icon: CalendarIcon, module: 'calendar', group: 'general' },
  { label: 'Feiertagskalender', to: '/feiertagskalender', icon: CalendarIcon, module: 'feiertagskalender', group: 'documents' },
  { label: 'News', to: '/news', icon: NewsIcon, module: 'news', group: 'more', badge: 'news' },
  { label: 'Das Team', to: '/team', icon: UsersIcon, module: 'team', group: 'people' },
  { label: 'Urlaub', to: '/urlaub', icon: VacationIcon, module: 'vacation', group: 'people' },
  { label: 'Personal', to: '/personal', icon: UsersIcon, module: 'personnel', group: 'humanResources' },
  { label: 'Urlaubsmanagement', to: '/urlaubsmanagement', icon: VacationIcon, vacationManagement: true, group: 'people', badge: 'vacationManagement' },
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
  { key: 'general', label: 'Allgemein' },
  { key: 'people', label: 'Team' },
  { key: 'humanResources', label: 'Personalwesen' },
  { key: 'operations', label: 'Disposition' },
  { key: 'partnerSales', label: 'Partner & Vertrieb' },
  { key: 'cases', label: 'Fallmanagement' },
  { key: 'documents', label: 'Dokumente & Werkzeuge' },
  { key: 'more', label: 'Weiteres' },
  { key: 'administration', label: 'Administration' },
]

function itemIsActive(item, pathname) {
  if (item.to === '/admin') return pathname === '/admin'
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function NavigationItem({ item, badgeCounts, collapsed, favorite, onToggleFavorite, showFavoriteControl = false, suppressActive = false, onSelect }) {
  const { badge, label, to, icon: Icon } = item
  const count = badge ? badgeCounts[badge] || 0 : 0
  const variant = badge ? SIDEBAR_BADGE_DEFINITIONS[badge]?.variant : ''

  return <div className="nav-item-row">
    <NavLink to={to} end={to === '/admin'} className={({ isActive }) => `nav-item ${isActive && !suppressActive ? 'nav-item--active' : ''}`} title={collapsed ? label : undefined} onClick={() => onSelect?.(item)}>
      <Icon />
      {!collapsed && <><span className="nav-item__label">{label}</span>{count > 0 && <span className={`nav-item__badge nav-item__badge--${variant}`}>{count > 9 ? '9+' : count}</span>}</>}
    </NavLink>
    {showFavoriteControl && !collapsed && <button className={`nav-item-favorite${favorite ? ' nav-item-favorite--active' : ''}`} type="button" aria-label={favorite ? `${label} aus Favoriten entfernen` : `${label} zu Favoriten hinzufügen`} aria-pressed={favorite} title={favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleFavorite(item.id) }}><StarIcon filled={favorite} /></button>}
  </div>
}

export default function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, user } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [badgeCounts, setBadgeCounts] = useState({})
  const visibleItems = navigationItems.map((item) => ({ ...item, id: item.to })).filter((item) => item.superadminOnly ? profile?.active === true && profile?.role === 'superadmin' : item.administration ? canManageUsers(profile) : item.vacationManagement ? canManageVacations(profile) : item.module === 'calendar' ? canView(profile, 'calendar') || canViewSystemCalendars(profile) : !item.module || canView(profile, item.module))
  const visibleItemIds = visibleItems.map((item) => item.id)
  const groupIds = navigationGroups.map((group) => group.key)
  const [favoriteIds, setFavoriteIds] = useState(() => readSidebarFavorites(user?.uid, visibleItemIds))
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => readSidebarExpandedGroups(user?.uid, groupIds))
  const [activeFavoriteItemId, setActiveFavoriteItemId] = useState(null)
  const activeGroupIds = [...new Set(visibleItems.filter((item) => itemIsActive(item, location.pathname)).map((item) => item.group))]
  const activeFavoriteItem = visibleItems.find((item) => item.id === activeFavoriteItemId)
  const isFavoriteSelectionActive = activeFavoriteItem && itemIsActive(activeFavoriteItem, location.pathname)
  const activeGroupIdsWithoutFavorite = isFavoriteSelectionActive
    ? activeGroupIds.filter((groupId) => groupId !== activeFavoriteItem.group)
    : activeGroupIds
  const additionalExpandedGroupId = [...expandedGroupIds].reverse().find((groupId) => !activeGroupIdsWithoutFavorite.includes(groupId)) || null
  const visibleBadgeKeys = [...new Set(visibleItems.map((item) => item.badge).filter(Boolean))].sort().join(',')
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || profile?.name || getUserDisplayName(profile, user)
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

  function toggleFavorite(itemId) {
    setFavoriteIds((current) => {
      const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
      saveSidebarFavorites(user?.uid, next)
      return next
    })
  }

  function toggleGroup(groupId) {
    if (activeGroupIdsWithoutFavorite.includes(groupId)) return
    setExpandedGroupIds((current) => {
      const currentAdditionalGroupId = [...current].reverse().find((id) => !activeGroupIdsWithoutFavorite.includes(id)) || null
      // Besides the active module's group, exactly one group can be opened
      // for choosing the next destination.
      const next = currentAdditionalGroupId === groupId ? [] : [groupId]
      saveSidebarExpandedGroups(user?.uid, next)
      return next
    })
  }

  const favoriteItems = favoriteIds.map((id) => visibleItems.find((item) => item.id === id)).filter(Boolean)

  function selectFavorite(item) {
    setActiveFavoriteItemId(item.id)
    setExpandedGroupIds((current) => {
      const next = current.filter((groupId) => groupId !== item.group)
      saveSidebarExpandedGroups(user?.uid, next)
      return next
    })
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="brand-mark" aria-hidden="true"><DrehpunktLogoIcon /></span>
        {!collapsed && <span className="brand-name">Drehpunkt</span>}
      </div>

      <NavLink className={({ isActive }) => `sidebar__profile${isActive ? ' active' : ''}`} to="/profil" title={collapsed ? 'Mein Profil' : undefined}>
        <span className="sidebar__profile-avatar" aria-hidden="true">{initials}</span>
        {!collapsed && <span className="sidebar__profile-identity"><strong>{profileName}</strong></span>}
      </NavLink>

      <nav className="sidebar__nav" aria-label="Hauptnavigation">
        {!collapsed && favoriteItems.length > 0 && <section className="sidebar__nav-group sidebar__favorites" aria-labelledby="sidebar-favorites-heading">
          <span className="sidebar__nav-group-label" id="sidebar-favorites-heading"><StarIcon size={12} /> Favoriten</span>
          <div className="sidebar__nav-group-items"><div className="sidebar__nav-group-items-inner">
            {favoriteItems.map((item) => <NavigationItem key={`favorite-${item.id}`} item={item} badgeCounts={badgeCounts} collapsed={collapsed} onSelect={selectFavorite} />)}
          </div></div>
        </section>}
        {navigationGroups.map((group) => {
          const groupItems = visibleItems.filter((item) => item.group === group.key)
          if (!groupItems.length) return null
          const isActiveGroup = activeGroupIdsWithoutFavorite.includes(group.key)
          const isExpanded = collapsed || isActiveGroup || additionalExpandedGroupId === group.key
          return <section className="sidebar__nav-group" key={group.key}>
            {!collapsed && <button className="sidebar__nav-group-toggle" type="button" aria-expanded={isExpanded} aria-controls={`sidebar-group-${group.key}`} onClick={() => toggleGroup(group.key)} disabled={isActiveGroup} title={isActiveGroup ? 'Der Bereich bleibt geöffnet, damit der aktive Menüpunkt sichtbar ist.' : undefined}><span>{group.label}</span><ChevronDownIcon /></button>}
            <div className={`sidebar__nav-group-items${isExpanded ? '' : ' sidebar__nav-group-items--collapsed'}`} id={`sidebar-group-${group.key}`}><div className="sidebar__nav-group-items-inner">
              {groupItems.map((item) => <NavigationItem key={item.id} item={item} badgeCounts={badgeCounts} favorite={favoriteIds.includes(item.id)} collapsed={collapsed} onToggleFavorite={toggleFavorite} showFavoriteControl suppressActive={isFavoriteSelectionActive && item.id === activeFavoriteItemId} onSelect={() => setActiveFavoriteItemId(null)} />)}
            </div></div>
          </section>
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
