import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DamageCaseForm from '../components/damages/DamageCaseForm.jsx'
import DamageCasesTable from '../components/damages/DamageCasesTable.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { createDamageCase, DAMAGE_CASE_STATUSES, damageDuePresentation, isClosedDamageCase, listDamageCases, sortDamageCases } from '../lib/damages.js'
import { listVisibleUserDirectory } from '../lib/userProfiles.js'

export default function DamagesPage() {
  const { user, profile } = useAuth()
  const { canEdit } = usePermissions()
  const { setTitle } = usePageHeader()
  const navigate = useNavigate()
  const editable = canEdit('damages')
  const [cases, setCases] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [criticalOnly, setCriticalOnly] = useState(false)
  const [documentsMissingOnly, setDocumentsMissingOnly] = useState(false)
  const [closedOpen, setClosedOpen] = useState(false)

  useEffect(() => { setTitle(''); return () => setTitle('') }, [setTitle])
  useEffect(() => {
    let current = true
    Promise.all([listDamageCases(), editable ? listVisibleUserDirectory() : Promise.resolve([])])
      .then(([entries, directory]) => { if (current) { setCases(entries); setUsers(directory) } })
      .catch(() => { if (current) setError('Die Schäden konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [editable])

  const usersById = useMemo(() => new Map(users.map((entry) => [entry.id, entry])), [users])
  const filteredCases = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('de-DE')
    return cases.filter((damageCase) => {
      const haystack = [damageCase.caseNumber, damageCase.transportReference, damageCase.claimant, damageCase.contractor].filter(Boolean).join(' ').toLocaleLowerCase('de-DE')
      const due = damageDuePresentation(damageCase)
      return (!needle || haystack.includes(needle))
        && (!status || damageCase.status === status)
        && (!criticalOnly || ['overdue', 'today', 'soon'].includes(due.kind))
        && (!documentsMissingOnly || damageCase.status === 'documents_missing')
    })
  }, [cases, criticalOnly, documentsMissingOnly, search, status])
  const currentCases = useMemo(() => sortDamageCases(filteredCases.filter((damageCase) => !isClosedDamageCase(damageCase))), [filteredCases])
  const closedCases = useMemo(() => sortDamageCases(filteredCases.filter(isClosedDamageCase)), [filteredCases])

  async function save(values) {
    const id = await createDamageCase(values, { user, profile }, usersById)
    setShowForm(false)
    navigate(`/schaeden/${id}`)
  }

  return <div className="damages-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <section className="damage-intro"><div><h2>Schäden</h2><p>Schaden- und Versicherungsfälle im Überblick</p></div>{editable && <button className="button" type="button" onClick={() => setShowForm(true)}>Neuen Fall anlegen</button>}</section>
    <section className="damage-filters" aria-label="Schäden filtern"><label className="search-field"><span className="sr-only">Schäden durchsuchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Fallnummer, Referenz, Kunde oder Unternehmer" /></label><label className="filter-field"><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Alle Status</option>{DAMAGE_CASE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className={`damage-filter-toggle${criticalOnly ? ' damage-filter-toggle--active' : ''}`}><input type="checkbox" checked={criticalOnly} onChange={(event) => setCriticalOnly(event.target.checked)} />Frist kritisch</label><label className={`damage-filter-toggle${documentsMissingOnly ? ' damage-filter-toggle--active' : ''}`}><input type="checkbox" checked={documentsMissingOnly} onChange={(event) => setDocumentsMissingOnly(event.target.checked)} />Unterlagen fehlen</label></section>
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="page-state">Schäden werden geladen …</p> : <div className="damage-sections"><section className="damage-section"><div className="damage-section__heading"><div><h2>Aktuelle Fälle</h2><p>Fälle, die noch nicht wirtschaftlich erledigt sind.</p></div><span>{currentCases.length}</span></div><DamageCasesTable cases={currentCases} onOpen={(damageCase) => navigate(`/schaeden/${damageCase.id}`)} /></section><section className={`damage-section damage-section--closed${closedOpen ? ' damage-section--open' : ''}`}><button className="damage-section__toggle" type="button" aria-expanded={closedOpen} onClick={() => setClosedOpen((value) => !value)}><span><strong>Abgeschlossene Fälle</strong><small>Wirtschaftlich erledigte Fälle bleiben jederzeit auffindbar.</small></span><span>{closedCases.length} <b aria-hidden="true">⌄</b></span></button>{closedOpen && <DamageCasesTable cases={closedCases} onOpen={(damageCase) => navigate(`/schaeden/${damageCase.id}`)} />}</section></div>}
    {showForm && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><section className="damage-form-modal" role="dialog" aria-modal="true" aria-label="Neuen Schaden anlegen"><DamageCaseForm users={users} onCancel={() => setShowForm(false)} onSubmit={save} /></section></div>}
  </div>
}
