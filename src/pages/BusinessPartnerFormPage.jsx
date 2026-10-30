import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import BusinessPartnerForm from '../components/business-partners/BusinessPartnerForm.jsx'
import BusinessPartnerHeader from '../components/business-partners/BusinessPartnerHeader.jsx'
import BusinessPartnerHistoryModal from '../components/business-partners/BusinessPartnerHistoryModal.jsx'
import DycosPartnerDataNotice from '../components/business-partners/DycosPartnerDataNotice.jsx'
import DycosPartnerRefreshDialog from '../components/business-partners/DycosPartnerRefreshDialog.jsx'
import ManualPartnerMergeFlow from '../components/business-partners/ManualPartnerMergeFlow.jsx'
import Toast from '../components/ui/Toast.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import { createBusinessPartner, createEmptyBusinessPartner, getBusinessPartner, updateBusinessPartner } from '../lib/businessPartners.js'
import { businessPartnerDetailPath } from '../lib/businessPartnerLinks.js'
import { listCrmTransportRatingSummaries } from '../lib/transportOrderRatings.js'
import { getHistoryActor } from '../lib/partnerHistory.js'
import { loadPalletAccount } from '../lib/palletAccounts.js'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getMissingCreditorNumberNotice } from '../lib/importedPartnerStatus.js'
import { watchShipmentTrackingRuleCatalog } from '../lib/shipmentTrackingRuleCatalog.js'
import { fallbackShipmentTrackingRuleCatalog } from '../../shared/shipmentTrackingRuleCatalog.js'
import { dycosPartnerRefreshAccounts } from '../../shared/dycosPartnerRefresh.js'
import { fetchDycosMasterData, dycosMasterDataError } from '../lib/dycosMasterData.js'

function formatImportDate(value) {
  if (value?.toDate) return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(value.toDate())
  if (typeof value === 'string' && value) return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  return '—'
}

function MissingCreditorNumberNotice({ notice }) {
  if (!notice) return null
  return <aside className="partner-import-warning" aria-labelledby="partner-import-warning-title">
    <strong id="partner-import-warning-title"><StaticText source={"Kreditorennummer fehlt"} /></strong>
    <p><StaticText source={"Dieser Unternehmer wurde aus einem Transportauftrag angelegt. Bitte Stammdaten ergänzen oder später mit einem bestehenden Unternehmer zusammenführen."} /></p>
    <small><StaticText source={"TA-Nummer:"} /> {notice.transportOrderNumber || '—'} <StaticText source={"· Importlauf:"} /> {notice.importRunId || '—'} <StaticText source={"· Importdatum:"} /> {formatImportDate(notice.importedAt)}</small>
  </aside>
}

export default function BusinessPartnerFormPage({ mode }) {
  const authState = useAuth()
  const { canEdit, canView } = usePermissions()
  const { partnerId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [partner, setPartner] = useState(mode === 'create' ? createEmptyBusinessPartner() : null)
  const [currentValues, setCurrentValues] = useState(mode === 'create' ? createEmptyBusinessPartner() : null)
  const [loading, setLoading] = useState(mode === 'existing')
  const [error, setError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshChoiceOpen, setRefreshChoiceOpen] = useState(false)
  const [refreshResult, setRefreshResult] = useState(null)
  const [toast, setToast] = useState(location.state?.toast ?? '')
  const [crmRatings, setCrmRatings] = useState({})
  const [palletAccount, setPalletAccount] = useState(null)
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false)
  const [mergeDirection, setMergeDirection] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [partnerFormVersion, setPartnerFormVersion] = useState(0)
  const [ruleCatalog, setRuleCatalog] = useState(fallbackShipmentTrackingRuleCatalog)
  const mergeMenuRef = useRef(null)
  const refreshAttempt = useRef(null), refreshSubmitting = useRef(false), refreshPartner = useRef(partnerId)

  useEffect(() => { refreshPartner.current = partnerId; return () => { refreshPartner.current = null } }, [partnerId])

  useEffect(() => {
    if (!mergeMenuOpen) return undefined
    const closeOutside = (event) => { if (!mergeMenuRef.current?.contains(event.target)) setMergeMenuOpen(false) }
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMergeMenuOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [mergeMenuOpen])

  useEffect(() => {
    if (mode !== 'existing') return undefined
    let active = true
    getBusinessPartner(partnerId)
      .then((result) => { if (active) { setPartner(result); setCurrentValues(result); setError(result ? '' : 'Der Geschäftspartner wurde nicht gefunden.') } })
      .catch(() => { if (active) setError('Die Stammdaten konnten nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [mode, partnerId])

  async function refreshPalletAccount() {
    const result = await loadPalletAccount(partnerId)
    setPalletAccount(result?.account || null)
  }

  useEffect(() => {
    if (mode !== 'existing') return
    let isCurrent = true
    loadPalletAccount(partnerId)
      .then((result) => { if (isCurrent) setPalletAccount(result?.account || null) })
      .catch(() => { if (isCurrent) setPalletAccount(null) })
    return () => { isCurrent = false }
  }, [mode, partnerId])

  useEffect(() => {
    if (!canView('masterData')) return undefined
    return watchShipmentTrackingRuleCatalog(setRuleCatalog, () => setRuleCatalog(fallbackShipmentTrackingRuleCatalog()))
  }, [canView])

  useEffect(() => {
    if (mode !== 'existing' || !canView('crm')) return
    listCrmTransportRatingSummaries()
      .then((ratings) => setCrmRatings(ratings[partnerId] ?? {}))
      .catch(() => setCrmRatings({}))
  }, [canView, mode, partnerId])

  async function handleSubmit(values) {
    setSubmitting(true)
    setError('')
    try {
      const savedId = mode === 'create' ? await createBusinessPartner(values, ruleCatalog, getHistoryActor(authState)) : (await updateBusinessPartner(partnerId, values, getHistoryActor(authState)), partnerId)
      if (mode === 'create') {
        navigate(businessPartnerDetailPath(savedId), { state: { toast: 'Geschäftspartner erfolgreich angelegt.' } })
      } else {
        setPartner(values)
        setCurrentValues(values)
        setToast('Änderungen gespeichert.')
      }
      return true
    } catch {
      setError('Speichern nicht möglich. Bitte Firestore-Zugriff und Verbindung prüfen.')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function handleManualMerge(result) {
    setMergeDirection('')
    setMergeMenuOpen(false)
    setToast('Partner wurden zusammengeführt.')
    if (result.targetPartnerId !== partnerId) {
      setLoading(true)
      navigate(businessPartnerDetailPath(result.targetPartnerId), { state: { toast: 'Partner wurden zusammengeführt.' } })
      return
    }
    try {
      const refreshed = await getBusinessPartner(partnerId)
      setPartner(refreshed)
      setCurrentValues(refreshed)
      await refreshPalletAccount()
      setPartnerFormVersion((value) => value + 1)
    } catch { setError('Die Zusammenführung war erfolgreich. Bitte die Stammdatenseite neu laden.') }
  }

  async function handleMergeSeparated(result) {
    try {
      const refreshed = await getBusinessPartner(partnerId)
      setPartner(refreshed)
      setCurrentValues(refreshed)
      await refreshPalletAccount()
      setPartnerFormVersion((value) => value + 1)
      setToast(result.warnings?.length ? 'Zusammenführung getrennt. Einige später geänderte Werte benötigen manuelle Prüfung.' : 'Zusammenführung sicher getrennt.')
    } catch { setToast('Zusammenführung getrennt. Bitte das Stammdatenblatt neu laden.') }
  }

  async function handleDycosReview(decision) {
    const refreshed = await getBusinessPartner(partnerId)
    setPartner(refreshed); setCurrentValues(refreshed); setFormDirty(false)
    setPartnerFormVersion(value => value + 1)
    setToast(decision === 'accept' ? 'DyCoS-Wert wurde übernommen.' : 'Abweichung wurde verworfen. Drehpunkt-Wert bleibt erhalten.')
  }

  async function refreshFromDycos(account) {
    if (refreshSubmitting.current || formDirty || isSubmitting || reviewBusy || !canEdit('masterData') || partner?.mergedIntoPartnerId) return
    const targetId = partnerId
    refreshSubmitting.current = true; setRefreshing(true); setRefreshChoiceOpen(false); setMergeMenuOpen(false); setRefreshResult(null); setError('')
    mergeMenuRef.current?.querySelector('button')?.focus()
    if (refreshAttempt.current?.expectedPartnerId !== targetId || refreshAttempt.current?.typ !== account.typ || refreshAttempt.current?.nummer !== account.nummer) refreshAttempt.current = { ...account, expectedPartnerId: targetId, requestId: crypto.randomUUID() }
    let saved = false
    try {
      const result = await fetchDycosMasterData(refreshAttempt.current)
      saved = true
      if (result.partnerId !== targetId || !['updated', 'unchanged'].includes(result.status)) throw new Error('Unexpected refresh target')
      const refreshed = await getBusinessPartner(targetId)
      if (refreshPartner.current !== targetId) return
      setPartner(refreshed); setCurrentValues(refreshed); setFormDirty(false); setPartnerFormVersion(value => value + 1)
      setRefreshResult(result); refreshAttempt.current = null
      setToast(result.status === 'updated' ? 'Stammdaten wurden aus DyCoS ergänzt.' : 'Stammdaten sind aktuell.')
    } catch (caught) {
      if (refreshPartner.current === targetId) setError(saved ? 'Die Aktualisierung wurde gespeichert. Bitte das Stammdatenblatt neu laden.' : dycosMasterDataError(caught))
    } finally { refreshSubmitting.current = false; if (refreshPartner.current) setRefreshing(false) }
  }

  function startDycosRefresh() {
    const accounts = dycosPartnerRefreshAccounts(partner)
    if (formDirty || isSubmitting || reviewBusy || refreshing || !accounts.length) return
    if (accounts.length === 1) void refreshFromDycos(accounts[0])
    else { setMergeMenuOpen(false); mergeMenuRef.current?.querySelector('button')?.focus(); setRefreshChoiceOpen(true) }
  }

  if (loading) return <p className="page-state"><StaticText source={"Stammdaten werden geladen …"} /></p>
  if (error && !partner) return <section className="page-state page-state--error"><p>{<StaticText source={error} />}</p><BackLink to="/kunden-unternehmer" /></section>

  const shownPartner = currentValues ?? partner
  const isNew = mode === 'create'
  const archived = !isNew && Boolean(shownPartner?.mergedIntoPartnerId)
  const missingCreditorNumberNotice = getMissingCreditorNumberNotice(shownPartner)
  const editable = canEdit('masterData') && !archived
  const refreshAccounts = dycosPartnerRefreshAccounts(partner || {})

  return (
    <div className="masterdata-page">
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
      <div className="masterdata-action-row"><div><BackLink to="/kunden-unternehmer" /></div>{isNew && editable && <button aria-busy={isSubmitting} className="button masterdata-record-actions__save" form="business-partner-form" type="submit" disabled={isSubmitting}>{<StaticText source={isSubmitting ? 'Wird angelegt …' : 'Anlegen'} />}</button>}{!isNew && canView('masterData') && <div className="partner-merge-menu" ref={mergeMenuRef}><TranslatedProps sources={{"aria-label":"Partner-Aktionen öffnen"}}><button className="partner-merge-menu__trigger" type="button" aria-label="Partner-Aktionen öffnen" aria-haspopup="menu" aria-expanded={mergeMenuOpen} onClick={() => setMergeMenuOpen((open) => !open)}>…</button></TranslatedProps>{mergeMenuOpen && <div className="partner-merge-menu__dropdown" role="menu">{editable && <TranslatedProps sources={{ title: !refreshAccounts.length ? 'Keine gültige Debitoren- oder Kreditornummer hinterlegt.' : formDirty ? 'Bitte zuerst die offenen Änderungen speichern oder verwerfen.' : 'Stammdaten aus DyCoS ergänzen' }}><button type="button" role="menuitem" disabled={refreshing || reviewBusy || isSubmitting || formDirty || !refreshAccounts.length} onClick={startDycosRefresh}><StaticText source={refreshing ? 'Wird aktualisiert …' : 'Aktualisieren'} /></button></TranslatedProps>}<button type="button" role="menuitem" onClick={() => { mergeMenuRef.current?.querySelector('button')?.focus(); setHistoryOpen(true); setMergeMenuOpen(false) }}><StaticText source="Historie" /></button>{!archived && canEdit('partnerMerges') && <><button type="button" role="menuitem" onClick={() => { if (refreshing || reviewBusy || isSubmitting) return; setMergeDirection('current-source'); setMergeMenuOpen(false) }}><StaticText source={"Diesen Partner in anderen zusammenführen …"} /></button><button type="button" role="menuitem" onClick={() => { if (refreshing || reviewBusy || isSubmitting) return; setMergeDirection('current-target'); setMergeMenuOpen(false) }}><StaticText source={"Anderen Partner hierher zusammenführen …"} /></button></>}</div>}</div>}</div>
      {archived && <aside className="partner-archive-notice"><strong><StaticText source={"Archiviertes Stammdatenblatt"} /></strong><p><StaticText source={"Dieses Blatt wurde zusammengeführt und ist nur noch lesbar. Seine früheren Daten bleiben erhalten."} /></p><Link to={businessPartnerDetailPath(shownPartner.mergedIntoPartnerId)}><StaticText source={"Aktiven Zielpartner öffnen"} /></Link></aside>}
      {!archived && <MissingCreditorNumberNotice notice={missingCreditorNumberNotice} />}
      {!isNew && <BusinessPartnerHeader account={palletAccount} canViewCrm={!archived && canView('crm')} canViewPallets={!archived && canView('pallets')} partner={shownPartner} partnerId={partnerId} ratings={crmRatings} />}
      {!isNew && canView('masterData') && <DycosPartnerDataNotice key={partnerId} partner={shownPartner} partnerId={partnerId} dirty={formDirty || isSubmitting || refreshing} onResolved={handleDycosReview} onBusyChange={setReviewBusy} />}
      {refreshing && <p role="status"><StaticText source="Stammdaten werden aus DyCoS aktualisiert …" /></p>}
      {refreshResult && <div role="status">{refreshResult.conflicts > 0 && <p><StaticText source="Abweichende Werte wurden beibehalten. Die Unterschiede sind im Stammdatenblatt sichtbar." /></p>}{refreshResult.warningCodes?.length > 0 && <p><StaticText source="Einzelne Quelldaten oder Zuordnungen benötigen eine Prüfung. Bitte die Importhinweise beachten." /></p>}</div>}
      {refreshChoiceOpen && <DycosPartnerRefreshDialog accounts={refreshAccounts} onChoose={account => void refreshFromDycos(account)} onClose={() => setRefreshChoiceOpen(false)} />}
      {error && <p className="form-error">{<StaticText source={error} />}</p>}
      <BusinessPartnerForm key={`${partnerId || 'new'}-${partnerFormVersion}`} formId="business-partner-form" initialValue={partner} isNew={isNew} onSubmit={handleSubmit} onFormChange={setCurrentValues} onDirtyChange={setFormDirty} readOnly={!editable || reviewBusy || refreshing} saving={isSubmitting} canViewArchivedPartner={canView('masterData')} canMerge={canEdit('partnerMerges')} onMergeSeparated={handleMergeSeparated} ruleCatalog={ruleCatalog} />
      {historyOpen && <BusinessPartnerHistoryModal key={partnerId} partner={partner} partnerId={partnerId} onClose={() => setHistoryOpen(false)} />}
      {mergeDirection && <ManualPartnerMergeFlow currentPartnerId={partnerId} direction={mergeDirection} onClose={() => setMergeDirection('')} onMerged={handleManualMerge} />}
    </div>
  )
}
