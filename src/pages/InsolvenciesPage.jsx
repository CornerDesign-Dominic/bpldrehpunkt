import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InsolvencyCaseForm from '../components/insolvencies/InsolvencyCaseForm.jsx'
import InsolvenciesTable from '../components/insolvencies/InsolvenciesTable.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { createInsolvency, listInsolvencies, listInsolvencyPartners } from '../lib/insolvencies.js'

export default function InsolvenciesPage() {
  const { user, profile } = useAuth()
  const { canEdit } = usePermissions()
  const navigate = useNavigate()
  const editable = canEdit('insolvencies')
  const [insolvencies, setInsolvencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [partners, setPartners] = useState([])
  const [loadingPartners, setLoadingPartners] = useState(false)
  const [partnerError, setPartnerError] = useState('')
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')

  useEffect(() => {
    let current = true
    listInsolvencies().then((entries) => { if (current) setInsolvencies(entries) }).catch(() => { if (current) setError('Die Insolvenzfälle konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  const years = useMemo(() => [...new Set(insolvencies.map((insolvency) => String(insolvency.insolvencyDate || '').match(/^\d{4}/)?.[0]).filter(Boolean))].sort((first, second) => Number(second) - Number(first)), [insolvencies])
  const visibleInsolvencies = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('de-DE')
    return insolvencies.filter((insolvency) => {
      const haystack = [insolvency.partnerName, insolvency.courtReference, insolvency.courtVenue].filter(Boolean).join(' ').toLocaleLowerCase('de-DE')
      return (!needle || haystack.includes(needle)) && (!year || String(insolvency.insolvencyDate || '').startsWith(year))
    })
  }, [insolvencies, search, year])

  async function openForm() {
    setShowForm(true)
    setLoadingPartners(true)
    setPartnerError('')
    try { setPartners(await listInsolvencyPartners()) } catch { setPartnerError('Die Unternehmensauswahl konnte nicht geladen werden.') } finally { setLoadingPartners(false) }
  }

  async function save(values, partner) {
    const id = await createInsolvency(values, partner, { user, profile })
    setShowForm(false)
    navigate(`/insolvenzen/${id}`)
  }

  return <div className="damages-page insolvencies-page">
    {editable && <div className="damage-actions"><button className="button" type="button" onClick={() => { void openForm() }}>Insolvenz hinzufügen</button></div>}
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="page-state">Insolvenzfälle werden geladen …</p> : <section className="todo-section" aria-labelledby="insolvencies-heading"><div className="todo-section__heading"><h2 id="insolvencies-heading">Insolvenzfälle</h2><span>{visibleInsolvencies.length}</span></div><section className="damage-filters insolvencies-filters" aria-label="Insolvenzfälle filtern"><label className="search-field"><span className="sr-only">Insolvenzfälle durchsuchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Unternehmen, Aktenzeichen oder Gerichtsstand" /></label><label className="filter-field"><span className="sr-only">Eröffnungsjahr</span><select value={year} onChange={(event) => setYear(event.target.value)}><option value="">Alle Eröffnungsjahre</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></section><InsolvenciesTable insolvencies={visibleInsolvencies} emptyMessage={insolvencies.length ? 'Keine Insolvenzfälle für diese Filter gefunden.' : undefined} onOpen={(insolvency) => navigate(`/insolvenzen/${insolvency.id}`)} /></section>}
    {showForm && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><section className="damage-form-modal" role="dialog" aria-modal="true" aria-label="Insolvenz hinzufügen"><InsolvencyCaseForm onCancel={() => setShowForm(false)} onSubmit={save} partners={partners} loadingPartners={loadingPartners} partnerError={partnerError} /></section></div>}
  </div>
}
