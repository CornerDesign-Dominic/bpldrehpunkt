import { reportCaseFailure } from '../lib/caseDiagnostics.js'
import { presentCasePartnerReferences } from '../lib/partnerReferenceNames.js'
import PartnerReferenceWarning from '../components/business-partners/PartnerReferenceWarning.jsx'
import { createReturnState, resolveReturnNavigation, validReturnPath } from '../lib/recordNavigation.js'
import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  const savingRef = useRef(false)
  const [showForm, setShowForm] = useState(() => Boolean(location.state?.caseCreation?.caseType === 'damage'))
  const [toast, setToast] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [criticalOnly, setCriticalOnly] = useState(false)

  useEffect(() => { setTitle(''); return () => setTitle('') }, [setTitle])
  useEffect(() => {
    let current = true
    Promise.all([listDamageCases(), canViewMasterData ? listBusinessPartners() : Promise.resolve([])])
      .then(([entries, businessPartners]) => { if (current) { setCases(entries); setPartners(businessPartners) } })
      .catch((error) => { reportCaseFailure('damages', 'load', error); if (current) setError('Die Schäden konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [canViewMasterData, editable])

  const displayedCases = useMemo(() => presentCasePartnerReferences(cases, 'damage', partners, canViewMasterData), [cases, partners, canViewMasterData])
  const filteredCases = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('de-DE')
    return displayedCases.filter((damageCase) => {
      const haystack = [damageCase.caseNumber, damageCase.transportReference, damageCase.claimant, damageCase.contractor, damageCase.partnerSearchText].filter(Boolean).join(' ').toLocaleLowerCase('de-DE')
      const due = damageDeadlinePresentation(damageCase.nextDeadline)
      return (!needle || haystack.includes(needle))
        && (!status || damageCase.status === status)
        && (!criticalOnly || ['overdue', 'today', 'urgent', 'warning'].includes(due.kind))
    })
  }, [displayedCases, criticalOnly, search, status])
  const currentCases = useMemo(() => sortDamageCases(filteredCases.filter((damageCase) => !isClosedDamageCase(damageCase))), [filteredCases])
  const closedCases = useMemo(() => sortDamageCases(filteredCases.filter(isClosedDamageCase)), [filteredCases])

  useEffect(() => { if (pendingCaseCreation) navigate(location.pathname, { replace: true, state: null }) }, [location.pathname, navigate, pendingCaseCreation])

  function returnToOrigin() {
    if (!validReturnPath(pendingCaseCreation?.returnTo)) return false
    const target = resolveReturnNavigation(pendingCaseCreation, location.pathname)
    navigate(target.to, { replace: true, state: target.state })
    return true
  }

  function cancelCreation() {
    if (savingRef.current) return
    setShowForm(false)
    returnToOrigin()
  }

  async function save(values) {
    savingRef.current = true
    try {
      const id = await createDamageCase(values, { user, profile }, new Map(), { transportOrderIds: values.transportOrderLinks?.map((link) => link.id) })
      setShowForm(false)
      if (!returnToOrigin()) navigate(`/schaeden/${id}`)
    } finally {
      savingRef.current = false
    }
  }

  return <div className="damages-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    {editable && <div className="damage-actions"><button className="button" type="button" onClick={() => setShowForm(true)}><StaticText source={"Neuen Fall anlegen"} /></button></div>}
    <section className="damages-filter-area" aria-labelledby="damages-filter-heading"><h2 id="damages-filter-heading">Filter</h2><div className="damage-filters"><label className="search-field"><span className="sr-only"><StaticText source={"Schäden durchsuchen"} /></span><TranslatedProps sources={{"placeholder":"Fallnummer, Referenz, Kunde oder Unternehmer"}}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Fallnummer, Referenz, Kunde oder Unternehmer" /></TranslatedProps></label><label className="filter-field"><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value=""><StaticText source={"Alle Status"} /></option>{DAMAGE_CASE_STATUSES.map((item) => <option key={item.value} value={item.value}>{<StaticText source={item.label} />}</option>)}</select></label><label className={`damage-filter-toggle${criticalOnly ? ' damage-filter-toggle--active' : ''}`}><input type="checkbox" checked={criticalOnly} onChange={(event) => setCriticalOnly(event.target.checked)} /><StaticText source={"Frist kritisch"} /></label></div></section>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    <PartnerReferenceWarning records={displayedCases} />
    {loading ? <p className="page-state"><StaticText source={"Schäden werden geladen …"} /></p> : <div className="damages-lists"><section className="damage-case-list"><div className="damage-case-list__heading"><h2><StaticText source={"Aktuelle Fälle"} /></h2></div><DamageCasesTable cases={currentCases} onOpen={(damageCase) => navigate(`/schaeden/${damageCase.id}`, { state: createReturnState(location) })} /></section><section className="damage-case-list"><div className="damage-case-list__heading"><h2><StaticText source={"Abgeschlossene Fälle"} /></h2></div><DamageCasesTable cases={closedCases} onOpen={(damageCase) => navigate(`/schaeden/${damageCase.id}`, { state: createReturnState(location) })} /></section></div>}
    {showForm && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelCreation() }}><TranslatedProps sources={{"aria-label":"Neuen Schaden anlegen"}}><section className="damage-form-modal" role="dialog" aria-modal="true" aria-label="Neuen Schaden anlegen"><DamageCaseForm canViewTransportOrders={canView('transportOrders')} initialValues={caseCreationDefaults('damage', pendingCaseCreation?.prefill)} partners={partners} onCancel={cancelCreation} onSubmit={save} /></section></TranslatedProps></div>}
  </div>
}
