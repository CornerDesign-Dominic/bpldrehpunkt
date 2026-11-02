import ModuleSectionsLayout from './ModuleSectionsLayout.jsx'
import { caseManagementTabs } from '../../lib/caseManagementNavigation.js'

export default function CaseManagementLayout() {
  return <ModuleSectionsLayout tabs={caseManagementTabs} labelDe="Fallmanagement-Bereiche" labelEn="Case management sections" className="case-management" />
}
