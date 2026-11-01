import ModuleSectionsLayout from './ModuleSectionsLayout.jsx'
import { qualityTabs } from '../../lib/qualityNavigation.js'

export default function QualityLayout() {
  return <ModuleSectionsLayout tabs={qualityTabs} labelDe="Qualitätsbereiche" labelEn="Quality sections" className="quality-workspace" />
}
