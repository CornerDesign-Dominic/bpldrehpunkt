import { NavLink, Outlet } from 'react-router-dom'
import { usePermissions } from '../../auth/usePermissions.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { caseManagementTabs } from '../../lib/caseManagementNavigation.js'

export default function CaseManagementLayout() {
  const { canView } = usePermissions()
  const { language } = useLanguage()
  return <div className="case-management">
    <nav className="case-management__tabs" aria-label={language === 'en' ? 'Case management sections' : 'Fallmanagement-Bereiche'}>
      {caseManagementTabs.filter(tab => !tab.module || canView(tab.module)).map(tab => <NavLink key={tab.id} to={tab.path} end={!tab.module} className={({ isActive }) => `case-management__tab${isActive ? ' case-management__tab--active' : ''}`}>{language === 'en' ? tab.en : tab.de}</NavLink>)}
    </nav>
    <div className="case-management__content"><Outlet /></div>
  </div>
}
