import { NavLink, Outlet } from 'react-router-dom'
import { usePermissions } from '../../auth/usePermissions.js'
import { useLanguage } from '../../i18n/useLanguage.js'

export default function ModuleSectionsLayout({ tabs, labelDe, labelEn, className = '' }) {
  const { canView } = usePermissions()
  const { language } = useLanguage()
  return <div className={`module-sections ${className}`}>
    <nav className="module-sections__tabs" aria-label={language === 'en' ? labelEn : labelDe}>
      {tabs.filter(tab => !tab.module || canView(tab.module)).map(tab => <NavLink key={tab.id} to={tab.path} end={!tab.module} className={({ isActive }) => `module-sections__tab${isActive ? ' module-sections__tab--active' : ''}`}>{language === 'en' ? tab.en : tab.de}</NavLink>)}
    </nav>
    <div className="module-sections__content"><Outlet /></div>
  </div>
}
