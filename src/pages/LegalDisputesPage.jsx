import { useEffect } from 'react'
import LegalDisputeCasesTable from '../components/legal-disputes/LegalDisputeCasesTable.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import { usePageHeader } from '../lib/pageHeader.js'

const preparedCases = []

export default function LegalDisputesPage() {
  const { canEdit } = usePermissions()
  const { setTitle } = usePageHeader()
  const editable = canEdit('legalDisputes')

  // Die Datenanbindung folgt mit der Fallverwaltung. Die Aufteilung ist bereits
  // vorbereitet, damit ein Fall später über sein abgeschlossen-Kennzeichen in
  // genau einer der beiden Listen erscheint.
  const currentCases = preparedCases.filter((legalDispute) => !legalDispute.isClosed)
  const closedCases = preparedCases.filter((legalDispute) => legalDispute.isClosed)

  useEffect(() => {
    setTitle('')
    return () => setTitle('')
  }, [setTitle])

  return <div className="damages-page legal-disputes-page">
    {editable && <div className="damage-actions"><button className="button" type="button" disabled title="Die Fallanlage wird vorbereitet.">Neuer Fall</button></div>}
    <div className="todo-sections">
      <section className="todo-section" aria-labelledby="current-legal-disputes-heading">
        <div className="todo-section__heading"><h2 id="current-legal-disputes-heading">Aktuelle Fälle</h2><span>{currentCases.length}</span></div>
        <LegalDisputeCasesTable cases={currentCases} emptyMessage="Keine aktuellen Fälle vorhanden." />
      </section>
      <section className="todo-section" aria-labelledby="closed-legal-disputes-heading">
        <div className="todo-section__heading"><h2 id="closed-legal-disputes-heading">Abgeschlossene Fälle</h2><span>{closedCases.length}</span></div>
        <LegalDisputeCasesTable cases={closedCases} emptyMessage="Keine abgeschlossenen Fälle vorhanden." />
      </section>
    </div>
  </div>
}
