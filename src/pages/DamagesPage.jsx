import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import DamageCaseForm from '../components/damages/DamageCaseForm.jsx'
import DamageCasesTable from '../components/damages/DamageCasesTable.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { listBusinessPartners } from '../lib/businessPartners.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { createDamageCase, DAMAGE_CASE_STATUSES, damageDeadlinePresentation, isClosedDamageCase, listDamageCases, sortDamageCases } from '../lib/damages.js'
import { caseCreationDefaults } from '../lib/caseTransportLinks.js'

export default function DamagesPage() {
  const { user, profile } = useAuth()
  const { canEdit, canView } = usePermissions()
  const { setTitle } = usePageHeader()
  const navigate = useNavigate()
  const location = useLocation()
  const editable = canEdit('damages')
  const canViewMasterData = canView('masterData')
  const [cases, setCases] = useState([])
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingCaseCreation] = useState(() => location.state?.caseCreation?.caseType === 'damage' ? location.state.caseCreation : null)
  const [showForm, setShowForm] = useState(() => Boolean(location.state?.caseCreation?.caseType === 'damage'))
  const [toast, setToast] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [criticalOnly, setCriticalOnly] = useState(false)

  useEffect(() => { setTitle(''); return () => setTitle('') }, [setTitle])
  useEffect(() => {
    let current = true
    Promise.all([listDamageCases(), editable && canViewMasterData ? listBusinessPartners() : Promise.resolve([])])
      .then(([entries, businessPartners]) => { if (current) { setCases(entries); setPartners(businessPartners) } })
      .catch(() => { if (current) setError('Die Schäden konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [canViewMasterData, editable])

  const filteredCases = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('de-DE')
    return cases.filter((damageCase) => {
      const haystack = [damageCase.caseNumber, damageCase.transportReference, damageCase.claimant, damageCase.contractor].filter(Boolean).join(' ').toLocaleLowerCase('de-DE')
      const due = damageDeadlinePresentation(damageCase.nextDeadline)
      return (!needle || haystack.includes(needle))
        && (!status || damageCase.status === status)
        && (!criticalOnly || ['overdue', 'today', 'urgent', 'warning'].includes(due.kind))
    })
  }, [cases, criticalOnly, search, status])
  const currentCases = useMemo(() => sortDamageCases(filteredCases.filter((damageCase) => !isClosedDamageCase(damageCase))), [filteredCases])
  const closedCases = useMemo(() => sortDamageCases(filteredCases.filter(isClosedDamageCase)), [filteredCases])

  useEffect(() => { if (pendingCaseCreation) navigate(location.pathname, { replace: true, state: null }) }, [location.pathname, navigate, pendingCaseCreation])

  async function save(values) {
    const id = await createDamageCase(values, { user, profile }, new Map(), { transportOrderId: pendingCaseCreation?.prefill?.transportOrderId, transportOrderIds: values.transportOrderLinks?.map((link) => link.id) })
    setShowForm(false)
    if (pendingCaseCreation?.returnTo) navigate(pendingCaseCreation.returnTo, { replace: true })
    else navigate(`/schaeden/${id}`)
  }

  return <div className="damages-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    {editable && <div className="damage-actions"><button className="button" type="button" onClick={() => setShowForm(true)}><StaticText source={"Neuen Fall anlegen"} /></button></div>}
    <section className="damages-filter-area" aria-labelledby="damages-filter-heading"><h2 id="damages-filter-heading">Filter</h2><div className="damage-filters"><label className="search-field"><span className="sr-only"><StaticText source={"Schäden durchsuchen"} /></span><TranslatedProps sources={{"placeholder":"Fallnummer, Referenz, Kunde oder Unternehmer"}}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Fallnummer, Referenz, Kunde oder Unternehmer" /></TranslatedProps></label><label className="filter-field"><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value=""><StaticText source={"Alle Status"} /></option>{DAMAGE_CASE_STATUSES.map((item) => <option key={item.value} value={item.value}>{<StaticText source={item.label} />}</option>)}</select></label><label className={`damage-filter-toggle${criticalOnly ? ' damage-filter-toggle--active' : ''}`}><input type="checkbox" checked={criticalOnly} onChange={(event) => setCriticalOnly(event.target.checked)} /><StaticText source={"Frist kritisch"} /></label></div></section>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    {loading ? <p className="page-state"><StaticText source={"Schäden werden geladen …"} /></p> : <div className="damages-lists"><section className="damage-case-list"><div className="damage-case-list__heading"><h2><StaticText source={"Aktuelle Fälle"} /></h2></div><DamageCasesTable cases={currentCases} onOpen={(damageCase) => navigate(`/schaeden/${damageCase.id}`)} /></section><section className="damage-case-list"><div className="damage-case-list__heading"><h2><StaticText source={"Abgeschlossene Fälle"} /></h2></div><DamageCasesTable cases={closedCases} onOpen={(damageCase) => navigate(`/schaeden/${damageCase.id}`)} /></section></div>}
    {showForm && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><TranslatedProps sources={{"aria-label":"Neuen Schaden anlegen"}}><section className="damage-form-modal" role="dialog" aria-modal="true" aria-label="Neuen Schaden anlegen"><DamageCaseForm canViewTransportOrders={canView('transportOrders')} initialValues={caseCreationDefaults('damage', pendingCaseCreation?.prefill)} partners={partners} onCancel={() => setShowForm(false)} onSubmit={save} /></section></TranslatedProps></div>}
  </div>
}
