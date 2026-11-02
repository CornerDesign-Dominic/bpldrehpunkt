import ModuleSectionsLayout from './ModuleSectionsLayout.jsx'
import { personnelTabs } from '../../lib/personnelNavigation.js'

export default function PersonnelLayout() {
  return <ModuleSectionsLayout tabs={personnelTabs} labelDe="Personalbereiche" labelEn="Human resources sections" className="personnel-workspace" />
}
