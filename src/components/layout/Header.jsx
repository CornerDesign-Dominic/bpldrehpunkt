import { useLocation } from 'react-router-dom'
import { getPageTitle } from '../../lib/pageTitles.js'
import { usePageHeader } from '../../lib/pageHeader.js'
import { useLanguage } from '../../i18n/useLanguage.js'

const titleKeys = {
  'Dashboard': 'nav.dashboard', 'Team Brennpunkt': 'title.team', 'Personalverwaltung': 'title.personnel',
  'Unternehmer importieren': 'title.carrierImport', 'Stammdaten importieren': 'title.masterImport',
  'Kunden & Unternehmer': 'nav.partners', 'Transportaufträge importieren': 'title.orderImport',
  'Auftragsliste': 'nav.orders', 'Palettenmanagement': 'nav.pallets', 'News': 'nav.news',
  'Dokumente': 'nav.documents', 'Vorlagen': 'nav.templates', 'To-dos': 'nav.todos',
  'Notizen': 'nav.notes', 'Schäden': 'nav.damages', 'Insolvenzen': 'nav.insolvencies',
  'Gericht / Streit': 'nav.disputes', 'Inkasso': 'nav.collections', 'AGB-Prüfer': 'nav.termsChecker',
  'Mein Profil': 'nav.profile', 'Systemmails': 'nav.systemMails', 'Stammdaten': 'nav.masterData',
  'Diagnose': 'nav.diagnostics', 'Adminbereich': 'nav.admin', 'Urlaubsübersicht': 'title.vacationOverview',
  'Kalender': 'nav.calendar', 'Feiertagskalender': 'nav.holidays', 'Urlaubsmanagement': 'nav.vacationManagement',
}

export default function Header() {
  const { pathname } = useLocation()
  const { pageTitle } = usePageHeader()
  const { t } = useLanguage()
  const title = pageTitle || getPageTitle(pathname)

  return (
    <header className="app-header">
      <h1>{titleKeys[title] ? t(titleKeys[title]) : title}</h1>
    </header>
  )
}
