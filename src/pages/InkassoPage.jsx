import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InkassoCaseForm from '../components/inkasso/InkassoCaseForm.jsx'
import InkassoCasesTable from '../components/inkasso/InkassoCasesTable.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { createInkassoCase, isClosedInkassoCase, listInkassoCases } from '../lib/inkasso.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { listVisibleUserDirectory } from '../lib/userProfiles.js'

export default function InkassoPage() {
  const { user, profile } = useAuth()
  const { canEdit } = usePermissions()
  const { setTitle } = usePageHeader()
  const navigate = useNavigate()
  const editable = canEdit('inkasso')
  const [cases, setCases] = useState([])
  const [users, setUsers] = useState([])
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
    Promise.all([listInkassoCases(), editable ? listVisibleUserDirectory() : Promise.resolve([])])
      .then(([entries, directory]) => { if (current) { setCases(entries); setUsers(directory) } })
      .catch(() => { if (current) setError('Die Inkassofälle konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [editable])

  const usersById = useMemo(() => new Map(users.map((entry) => [entry.id, entry])), [users])

  async function save(values) {
    const id = await createInkassoCase(values, { user, profile }, usersById)
    setShowForm(false)
    navigate(`/inkasso/${id}`)
  }

  return <div className="damages-page inkasso-page">
    {editable && <div className="damage-actions"><button className="button" type="button" onClick={() => setShowForm(true)}>Inkasso hinzufügen</button></div>}
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="page-state">Inkassofälle werden geladen …</p> :
    <div className="todo-sections">
      <section className="todo-section" aria-labelledby="current-inkasso-cases-heading">
        <div className="todo-section__heading"><h2 id="current-inkasso-cases-heading">Aktuelle Inkassofälle</h2><span>{currentCases.length}</span></div>
        <InkassoCasesTable cases={currentCases} emptyMessage="Keine aktuellen Inkassofälle vorhanden." onOpen={(inkassoCase) => navigate(`/inkasso/${inkassoCase.id}`)} />
      </section>
      <section className="todo-section" aria-labelledby="closed-inkasso-cases-heading">
        <div className="todo-section__heading"><h2 id="closed-inkasso-cases-heading">Abgeschlossene Inkassofälle</h2><span>{closedCases.length}</span></div>
        <InkassoCasesTable cases={closedCases} emptyMessage="Keine abgeschlossenen Inkassofälle vorhanden." onOpen={(inkassoCase) => navigate(`/inkasso/${inkassoCase.id}`)} />
      </section>
    </div>
    }
    {showForm && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><section className="damage-form-modal" role="dialog" aria-modal="true" aria-label="Inkassofall hinzufügen"><InkassoCaseForm users={users} onCancel={() => setShowForm(false)} onSubmit={save} /></section></div>}
  </div>
}
