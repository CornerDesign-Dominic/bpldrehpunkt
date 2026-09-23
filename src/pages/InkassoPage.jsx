import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InkassoCaseForm from '../components/inkasso/InkassoCaseForm.jsx'
import InkassoCasesTable from '../components/inkasso/InkassoCasesTable.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import { createInkassoCase, INKASSO_CASE_STATUSES, inkassoDeadlinePresentation, isClosedInkassoCase, listInkassoCases } from '../lib/inkasso.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { listBusinessPartners } from '../lib/businessPartners.js'
import { resolvePartnerInIndex } from '../lib/partnerCluster.js'

export default function InkassoPage() {
  const { canEdit, canView } = usePermissions()
  const { setTitle } = usePageHeader()
  const navigate = useNavigate()
  const editable = canEdit('inkasso')
  const [cases, setCases] = useState([])
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [criticalOnly, setCriticalOnly] = useState(false)
  const displayedCases = useMemo(() => {
    const byId = new Map(partners.map((partner) => [partner.id, partner]))
    return cases.map((inkassoCase) => {
      if (!inkassoCase.debtorPartnerId || !byId.has(inkassoCase.debtorPartnerId)) return inkassoCase
      try {
        const effective = resolvePartnerInIndex(byId, inkassoCase.debtorPartnerId)
        return effective ? { ...inkassoCase, debtorName: effective.companyName || inkassoCase.debtorName } : inkassoCase
      } catch { return inkassoCase }
    })
  }, [cases, partners])
  const filteredCases = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('de-DE')
    return displayedCases.filter((inkassoCase) => {
      const haystack = [inkassoCase.caseNumber, inkassoCase.debtorName].filter(Boolean).join(' ').toLocaleLowerCase('de-DE')
      const due = inkassoDeadlinePresentation(inkassoCase.nextDeadline)
      return (!needle || haystack.includes(needle))
        && (!status || inkassoCase.status === status)
        && (!criticalOnly || ['overdue', 'today', 'urgent', 'warning'].includes(due.kind))
    })
  }, [criticalOnly, displayedCases, search, status])
  const currentCases = useMemo(() => filteredCases.filter((inkassoCase) => !isClosedInkassoCase(inkassoCase)), [filteredCases])
  const closedCases = useMemo(() => filteredCases.filter(isClosedInkassoCase), [filteredCases])

  useEffect(() => {
    setTitle('')
    return () => setTitle('')
  }, [setTitle])

  useEffect(() => {
    let current = true
    Promise.all([listInkassoCases(), canView('masterData') ? listBusinessPartners() : Promise.resolve([])])
      .then(([entries, businessPartners]) => { if (current) { setCases(entries); setPartners(businessPartners) } })
      .catch(() => { if (current) setError('Die Inkassofälle konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [canView, editable])

  async function save(values) {
    const id = await createInkassoCase(values)
    setShowForm(false)
    navigate(`/inkasso/${id}`)
  }

  return <div className="damages-page inkasso-page">
    {editable && <div className="damage-actions"><button className="button" type="button" onClick={() => setShowForm(true)}>Inkasso hinzufügen</button></div>}
    <section className="damages-filter-area" aria-labelledby="inkasso-filter-heading"><h2 id="inkasso-filter-heading">Filter</h2><div className="damage-filters"><label className="search-field"><span className="sr-only">Inkassofälle durchsuchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Aktenzeichen oder Schuldner" /></label><label className="filter-field"><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Alle Status</option>{INKASSO_CASE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className={`damage-filter-toggle${criticalOnly ? ' damage-filter-toggle--active' : ''}`}><input type="checkbox" checked={criticalOnly} onChange={(event) => setCriticalOnly(event.target.checked)} />Frist kritisch</label></div></section>
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
    {showForm && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><section className="damage-form-modal" role="dialog" aria-modal="true" aria-label="Inkassofall hinzufügen"><InkassoCaseForm partners={partners.filter((partner) => !partner.mergedIntoPartnerId)} onCancel={() => setShowForm(false)} onSubmit={save} /></section></div>}
  </div>
}
