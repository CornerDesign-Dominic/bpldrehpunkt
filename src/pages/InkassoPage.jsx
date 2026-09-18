import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InkassoCaseForm from '../components/inkasso/InkassoCaseForm.jsx'
import InkassoCasesTable from '../components/inkasso/InkassoCasesTable.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { createInkassoCase, isClosedInkassoCase, listInkassoCases } from '../lib/inkasso.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { listBusinessPartners } from '../lib/businessPartners.js'

export default function InkassoPage() {
  const { user, profile } = useAuth()
  const { canEdit, canView } = usePermissions()
  const { setTitle } = usePageHeader()
  const navigate = useNavigate()
  const editable = canEdit('inkasso')
  const [cases, setCases] = useState([])
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const currentCases = useMemo(() => cases.filter((inkassoCase) => !isClosedInkassoCase(inkassoCase)), [cases])
  const closedCases = useMemo(() => cases.filter(isClosedInkassoCase), [cases])

  useEffect(() => {
    setTitle('')
    return () => setTitle('')
  }, [setTitle])

  useEffect(() => {
    let current = true
    Promise.all([listInkassoCases(), editable && canView('masterData') ? listBusinessPartners() : Promise.resolve([])])
      .then(([entries, businessPartners]) => { if (current) { setCases(entries); setPartners(businessPartners) } })
      .catch(() => { if (current) setError('Die Inkassofälle konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [canView, editable])

  async function save(values) {
    const id = await createInkassoCase(values, { user, profile }, new Map())
    setShowForm(false)
    navigate(`/inkasso/${id}`)
  }

  return <div className="damages-page inkasso-page">
    {editable && <div className="damage-actions"><button className="button" type="button" onClick={() => setShowForm(true)}>Inkasso hinzufügen</button></div>}
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="page-state">Inkassofälle werden geladen …</p> :
    <div className="inkasso-lists">
      <section className="inkasso-list" aria-labelledby="current-inkasso-cases-heading">
        <div className="inkasso-list__heading"><h2 id="current-inkasso-cases-heading">Aktuelle Inkassofälle</h2><span>{currentCases.length}</span></div>
        <InkassoCasesTable cases={currentCases} emptyMessage="Keine aktuellen Inkassofälle vorhanden." onOpen={(inkassoCase) => navigate(`/inkasso/${inkassoCase.id}`)} />
      </section>
      <section className="inkasso-list" aria-labelledby="closed-inkasso-cases-heading">
        <div className="inkasso-list__heading"><h2 id="closed-inkasso-cases-heading">Abgeschlossene Inkassofälle</h2><span>{closedCases.length}</span></div>
        <InkassoCasesTable cases={closedCases} emptyMessage="Keine abgeschlossenen Inkassofälle vorhanden." onOpen={(inkassoCase) => navigate(`/inkasso/${inkassoCase.id}`)} />
      </section>
    </div>
    }
    {showForm && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><section className="damage-form-modal" role="dialog" aria-modal="true" aria-label="Inkassofall hinzufügen"><InkassoCaseForm partners={partners} onCancel={() => setShowForm(false)} onSubmit={save} /></section></div>}
  </div>
}
