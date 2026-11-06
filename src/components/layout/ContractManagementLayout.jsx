import ModuleSectionsLayout from './ModuleSectionsLayout.jsx'

const tabs = [
  { id: 'overview', path: '/vertragsmanagement', de: 'Übersicht', en: 'Overview' },
  { id: 'contracts', path: '/vertragsmanagement/vertraege', module: 'contracts', de: 'Verträge', en: 'Contracts' },
  { id: 'settings', path: '/vertragsmanagement/einstellungen', module: 'contracts', de: 'Einstellungen', en: 'Settings' },
]

export default function ContractManagementLayout() {
  return <ModuleSectionsLayout tabs={tabs} labelDe="Vertragsmanagement-Bereiche" labelEn="Contract management sections" className="contract-management" />
}
