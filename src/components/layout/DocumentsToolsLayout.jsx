import ModuleSectionsLayout from './ModuleSectionsLayout.jsx'
import { documentsToolsTabs } from '../../lib/documentsToolsNavigation.js'

export default function DocumentsToolsLayout() {
  return <ModuleSectionsLayout tabs={documentsToolsTabs} labelDe="Dokumente und Werkzeuge" labelEn="Documents and tools" className="documents-tools-workspace" />
}
