import { reportCaseFailure } from '../lib/caseDiagnostics.js'
import { listBusinessPartners } from '../lib/businessPartners.js'
import { partnerReferenceName, presentCasePartnerReferences } from '../lib/partnerReferenceNames.js'
import PartnerReferenceWarning from '../components/business-partners/PartnerReferenceWarning.jsx'
import { caseCreationDefaults, linkTransportOrderToCase, listTransportOrderLinksForCase } from '../lib/caseTransportLinks.js'
import { createReturnState, resolveReturnNavigation, validReturnPath } from '../lib/recordNavigation.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import ContextLink from '../components/ui/ContextLink.jsx'
import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import InsolvencyCaseForm from '../components/insolvencies/InsolvencyCaseForm.jsx'
import InsolvenciesTable from '../components/insolvencies/InsolvenciesTable.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { createInsolvency, listInsolvenciesWithLossNet, listInsolvencyPartners } from '../lib/insolvencies.js'
import { insolvencyCasePath } from '../lib/businessPartnerLinks.js'

export default function InsolvenciesPage() {
  const { user, profile } = useAuth()
  const { canEdit, canView } = usePermissions()
  const navigate = useNavigate()
  const location = useLocation()
  const [pendingCaseCreation] = useState(() => location.state?.caseCreation?.caseType === 'insolvency' ? location.state.caseCreation : null)
  const savingRef = useRef(false)
  const [linkSaving, setLinkSaving] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [chooseExisting, setChooseExisting] = useState(() => Boolean(location.state?.caseCreation?.caseType === 'insolvency'))
  const editable = canEdit('insolvencies')
  const [insolvencies, setInsolvencies] = useState([])
  const [referencePartners, setReferencePartners] = useState([])
  const canViewMasterData = canView('masterData')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(() => Boolean(location.state?.caseCreation?.caseType === 'insolvency'))
  const [partners, setPartners] = useState([])
  const [loadingPartners, setLoadingPartners] = useState(false)
  const [partnerError, setPartnerError] = useState('')
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')

  useEffect(() => {
    let current = true
    Promise.all([listInsolvenciesWithLossNet(), canViewMasterData ? listBusinessPartners() : Promise.resolve([])]).then(([entries, directory]) => { if (current) { setInsolvencies(entries); setReferencePartners(directory) } }).catch((error) => { reportCaseFailure('insolvencies', 'load', error); if (current) setError('Die Insolvenzfälle konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [canViewMasterData])

  const years = useMemo(() => [...new Set(insolvencies.map((insolvency) => String(insolvency.insolvencyDate || '').match(/^\d{4}/)?.[0]).filter(Boolean))].sort((first, second) => Number(second) - Number(first)), [insolvencies])
  const displayedInsolvencies = useMemo(() => presentCasePartnerReferences(insolvencies, 'insolvency', referencePartners, canViewMasterData), [insolvencies, referencePartners, canViewMasterData])
  const visibleInsolvencies = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('de-DE')
    return displayedInsolvencies.filter((insolvency) => {
      const haystack = [insolvency.partnerName, insolvency.courtReference, insolvency.courtVenue, insolvency.partnerSearchText].filter(Boolean).join(' ').toLocaleLowerCase('de-DE')
      return (!needle || haystack.includes(needle)) && (!year || String(insolvency.insolvencyDate || '').startsWith(year))
    })
  }, [displayedInsolvencies, search, year])

  async function openForm() {
    setChooseExisting(false)
    setShowForm(true)
    setLoadingPartners(true)
    setPartnerError('')
    try { setPartners(await listInsolvencyPartners()) } catch { setPartnerError('Die Unternehmensauswahl konnte nicht geladen werden.') } finally { setLoadingPartners(false) }
  }

  useEffect(() => { if (pendingCaseCreation) navigate(location.pathname, { replace: true, state: null }) }, [location.pathname, navigate, pendingCaseCreation])

  function finish(id) {
    setShowForm(false)
    if (validReturnPath(pendingCaseCreation?.returnTo)) {
      const target = resolveReturnNavigation(pendingCaseCreation, location.pathname)
      navigate(target.to, { replace: true, state: target.state })
    } else if (id) navigate(insolvencyCasePath(id), { state: createReturnState(location) })
  }

  function cancelCreation() {
    if (!savingRef.current) finish()
  }

  async function save(values, partner) {
    savingRef.current = true
    const transportOrderIds = values.transportOrderLinks?.map((link) => link.id) || []
    try {
      const id = await createInsolvency(values, partner, { user, profile }, { transportOrderIds })
      finish(id)
    } catch (error) {
      void reportTechnicalFailure({ module: 'case-links', stage: 'save', error, recordId: partner?.id, orderId: transportOrderIds[0] })
      throw error
    } finally { savingRef.current = false }
  }

  async function linkExisting(event) {
    event.preventDefault()
    if (savingRef.current) return
    if (!selectedCaseId) { setLinkError('Bitte eine bestehende Insolvenzakte auswählen.'); return }
    const transportOrderId = pendingCaseCreation?.prefill?.transportOrderId
    if (!transportOrderId || !canView('transportOrders') || !editable) { setLinkError('Dieser Transportauftrag kann hier nicht verknüpft werden.'); return }
    savingRef.current = true
    setLinkSaving(true)
    setLinkError('')
    try {
      const links = await listTransportOrderLinksForCase('insolvency', selectedCaseId)
      if (!links.some((link) => link.transportOrderId === transportOrderId)) await linkTransportOrderToCase({ caseType: 'insolvency', caseId: selectedCaseId, transportOrderId, actor: { user, profile } })
      finish(selectedCaseId)
    } catch (error) {
      setLinkError(error.message || 'Der Transportauftrag konnte nicht mit der Insolvenzakte verknüpft werden.')
      void reportTechnicalFailure({ module: 'case-links', stage: 'save', error, recordId: selectedCaseId, orderId: transportOrderId })
    } finally { savingRef.current = false; setLinkSaving(false) }
  }

  return <div className="damages-page insolvencies-page">
    {editable && <div className="damage-actions"><button className="button" type="button" onClick={() => { void openForm() }}><StaticText source={"Insolvenz hinzufügen"} /></button></div>}
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    <PartnerReferenceWarning records={displayedInsolvencies} />
    {loading ? <p className="page-state"><StaticText source={"Insolvenzfälle werden geladen …"} /></p> : <div className="insolvencies-layout"><section className="insolvencies-filter-area" aria-labelledby="insolvencies-filter-heading"><h2 id="insolvencies-filter-heading">Filter</h2><div className="damage-filters insolvencies-filters"><label className="search-field"><span className="sr-only"><StaticText source={"Insolvenzfälle durchsuchen"} /></span><TranslatedProps sources={{"placeholder":"Unternehmen, Aktenzeichen oder Gerichtsstand"}}><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Unternehmen, Aktenzeichen oder Gerichtsstand" /></TranslatedProps></label><label className="filter-field"><span className="sr-only"><StaticText source={"Eröffnungsjahr"} /></span><select value={year} onChange={(event) => setYear(event.target.value)}><option value=""><StaticText source={"Alle Eröffnungsjahre"} /></option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div></section><section className="insolvencies-list" aria-labelledby="insolvencies-heading"><div className="insolvencies-list__heading"><h2 id="insolvencies-heading"><StaticText source={"Insolvenzfälle"} /></h2></div><InsolvenciesTable insolvencies={visibleInsolvencies} emptyMessage={insolvencies.length ? 'Keine Insolvenzfälle für diese Filter gefunden.' : undefined} onOpen={(insolvency) => navigate(insolvencyCasePath(insolvency.id), { state: createReturnState(location) })} /></section></div>}
    {showForm && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelCreation() }}><TranslatedProps sources={{"aria-label":"Insolvenz hinzufügen"}}><section className="damage-form-modal" role="dialog" aria-modal="true" aria-label="Insolvenz hinzufügen">{chooseExisting && <form className="damage-form" onSubmit={linkExisting}><div className="damage-form__heading"><h2><StaticText source="Insolvenzakte verknüpfen" /></h2></div><p><StaticText source="Wähle eine bestehende Insolvenzakte für diesen Transportauftrag. Pro Unternehmen gibt es eine Insolvenzakte." /></p><label className="form-field"><span><StaticText source="Bestehende Insolvenzakte" /></span><select autoFocus value={selectedCaseId} disabled={loading || linkSaving} onChange={(event) => { setSelectedCaseId(event.target.value); setLinkError('') }}><option value=""><StaticText source={loading ? 'Insolvenzfälle werden geladen …' : 'Bitte auswählen'} /></option>{displayedInsolvencies.map((entry) => <option key={entry.id} value={entry.id}>{[partnerReferenceName(entry, 'partnerName'), entry.courtReference].filter(Boolean).join(' · ')}</option>)}</select></label>{selectedCaseId && <ContextLink className="button button--secondary" to={insolvencyCasePath(selectedCaseId)} target="_blank" rel="noopener noreferrer"><StaticText source="Insolvenzakte öffnen" /></ContextLink>}{!loading && !insolvencies.length && !error && <p><StaticText source="Noch keine Insolvenzfälle vorhanden." /></p>}{error && <p className="form-error"><StaticText source={error} /></p>}{linkError && <p className="form-error"><StaticText source={linkError} /></p>}<div className="form-actions"><button className="button button--secondary" type="button" disabled={linkSaving} onClick={cancelCreation}><StaticText source="Abbrechen" /></button><button className="button button--secondary" type="button" disabled={linkSaving} onClick={() => { void openForm() }}><StaticText source="Neue Insolvenzakte anlegen" /></button><button className="button" type="submit" disabled={loading || linkSaving || !selectedCaseId || !canView('transportOrders')}><StaticText source={linkSaving ? 'Wird verknüpft …' : 'Transportauftrag verknüpfen'} /></button></div></form>}<div hidden={chooseExisting}>{pendingCaseCreation && <button className="button button--secondary" type="button" onClick={() => { if (!savingRef.current) setChooseExisting(true) }}><StaticText source="Bestehende Insolvenzakte auswählen" /></button>}<InsolvencyCaseForm initialValues={caseCreationDefaults('insolvency', pendingCaseCreation?.prefill)} canViewTransportOrders={canView('transportOrders')} onCancel={cancelCreation} onSubmit={save} partners={partners} loadingPartners={loadingPartners} partnerError={partnerError} /></div></section></TranslatedProps></div>}
  </div>
}
