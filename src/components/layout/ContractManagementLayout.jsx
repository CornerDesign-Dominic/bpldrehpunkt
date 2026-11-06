import ModuleSectionsLayout from './ModuleSectionsLayout.jsx'

const tabs = [
  { id: 'overview', path: '/vertragsmanagement', de: 'Übersicht', en: 'Overview' },
  { id: 'contracts', path: '/vertragsmanagement/vertraege', module: 'contracts', de: 'Verträge', en: 'Contracts' },
]

export default function ContractManagementLayout() {
  return <ModuleSectionsLayout tabs={tabs} labelDe="Vertragsmanagement-Bereiche" labelEn="Contract management sections" className="contract-management" />
}
