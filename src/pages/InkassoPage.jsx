import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InkassoCasesTable from '../components/inkasso/InkassoCasesTable.jsx'
import { isClosedInkassoCase, listInkassoCases } from '../lib/inkasso.js'
import { usePageHeader } from '../lib/pageHeader.js'

export default function InkassoPage() {
  const { setTitle } = usePageHeader()
  const navigate = useNavigate()
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const currentCases = useMemo(() => cases.filter((inkassoCase) => !isClosedInkassoCase(inkassoCase)), [cases])
  const closedCases = useMemo(() => cases.filter(isClosedInkassoCase), [cases])

  useEffect(() => {
    setTitle('')
    return () => setTitle('')
  }, [setTitle])

  useEffect(() => {
    let current = true
    listInkassoCases()
      .then((entries) => { if (current) setCases(entries) })
      .catch(() => { if (current) setError('Die Inkassofälle konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  return <div className="damages-page inkasso-page">
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
  </div>
}
