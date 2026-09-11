import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LegalDisputeCaseForm from '../components/legal-disputes/LegalDisputeCaseForm.jsx'
import LegalDisputeCasesTable from '../components/legal-disputes/LegalDisputeCasesTable.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { createLegalDispute, listLegalDisputes } from '../lib/legalDisputes.js'

export default function LegalDisputesPage() {
  const { user, profile } = useAuth()
  const { canEdit } = usePermissions()
  const { setTitle } = usePageHeader()
  const navigate = useNavigate()
  const editable = canEdit('legalDisputes')
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const currentCases = cases.filter((legalDispute) => !legalDispute.isClosed)
  const closedCases = cases.filter((legalDispute) => legalDispute.isClosed)

  useEffect(() => {
    setTitle('')
    return () => setTitle('')
  }, [setTitle])

  useEffect(() => {
    let current = true
    listLegalDisputes()
      .then((entries) => { if (current) setCases(entries) })
      .catch(() => { if (current) setError('Die Fälle konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  async function save(values) {
    const id = await createLegalDispute(values, { user, profile })
    setShowForm(false)
    navigate(`/legal-disputes/${id}`)
  }

  return <div className="damages-page legal-disputes-page">
    {editable && <div className="damage-actions"><button className="button" type="button" onClick={() => setShowForm(true)}>Neuer Fall</button></div>}
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="page-state">Fälle werden geladen …</p> : <div className="todo-sections">
      <section className="todo-section" aria-labelledby="current-legal-disputes-heading">
        <div className="todo-section__heading"><h2 id="current-legal-disputes-heading">Aktuelle Fälle</h2><span>{currentCases.length}</span></div>
        <LegalDisputeCasesTable cases={currentCases} emptyMessage="Keine aktuellen Fälle vorhanden." onOpen={(legalDispute) => navigate(`/legal-disputes/${legalDispute.id}`)} />
      </section>
      <section className="todo-section" aria-labelledby="closed-legal-disputes-heading">
        <div className="todo-section__heading"><h2 id="closed-legal-disputes-heading">Abgeschlossene Fälle</h2><span>{closedCases.length}</span></div>
        <LegalDisputeCasesTable cases={closedCases} emptyMessage="Keine abgeschlossenen Fälle vorhanden." onOpen={(legalDispute) => navigate(`/legal-disputes/${legalDispute.id}`)} />
      </section>
    </div>}
    {showForm && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><section className="damage-form-modal" role="dialog" aria-modal="true" aria-label="Neuen Fall anlegen"><LegalDisputeCaseForm onCancel={() => setShowForm(false)} onSubmit={save} /></section></div>}
  </div>
}
