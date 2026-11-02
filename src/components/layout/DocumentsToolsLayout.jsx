import ModuleSectionsLayout from './ModuleSectionsLayout.jsx'
import { documentsToolsTabs } from '../../lib/documentsToolsNavigation.js'
import { useLocation } from 'react-router-dom'

export default function DocumentsToolsLayout() {
  const { pathname } = useLocation()
  return <ModuleSectionsLayout tabs={documentsToolsTabs} labelDe="Dokumente und Werkzeuge" labelEn="Documents and tools" className={`documents-tools-workspace${pathname === '/feiertagskalender' ? ' documents-tools-workspace--calendar' : ''}`} />
}
