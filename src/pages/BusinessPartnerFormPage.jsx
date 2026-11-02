import PartnerRelatedRecords from '../components/business-partners/PartnerRelatedRecords.jsx'
import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Link from '../components/ui/ContextLink.jsx'
import BusinessPartnerForm from '../components/business-partners/BusinessPartnerForm.jsx'
import BusinessPartnerHeader from '../components/business-partners/BusinessPartnerHeader.jsx'
import BusinessPartnerHistoryModal from '../components/business-partners/BusinessPartnerHistoryModal.jsx'
import DycosPartnerDataNotice from '../components/business-partners/DycosPartnerDataNotice.jsx'
import ManualPartnerMergeFlow from '../components/business-partners/ManualPartnerMergeFlow.jsx'
import Toast from '../components/ui/Toast.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import { createBusinessPartner, createEmptyBusinessPartner, getBusinessPartner, getEffectiveBusinessPartner, updateBusinessPartner } from '../lib/businessPartners.js'
import { businessPartnerArchivePath, businessPartnerDetailPath, isBusinessPartnerArchive } from '../lib/businessPartnerLinks.js'
import { partnerReferenceVersion } from '../lib/partnerReference.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { listCrmTransportRatingSummaries } from '../lib/transportOrderRatings.js'
import { getHistoryActor } from '../lib/partnerHistory.js'
import { loadPalletAccount } from '../lib/palletAccounts.js'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getMissingCreditorNumberNotice } from '../lib/importedPartnerStatus.js'
import { watchShipmentTrackingRuleCatalog } from '../lib/shipmentTrackingRuleCatalog.js'
import { fallbackShipmentTrackingRuleCatalog } from '../../shared/shipmentTrackingRuleCatalog.js'
import { dycosPartnerRefreshTargets } from '../../shared/dycosPartnerRefresh.js'
import { refreshDycosMasterData, dycosMasterDataError } from '../lib/dycosMasterData.js'

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
  const archiveMode = isBusinessPartnerArchive(location.search)
  const referenceKey = `${partnerId || ''}:${archiveMode}:${location.key}`
  const [loadedReference, setLoadedReference] = useState('')
  const [referenceStale, setReferenceStale] = useState(false)
  const [partner, setPartner] = useState(mode === 'create' ? createEmptyBusinessPartner() : null)
  const [currentValues, setCurrentValues] = useState(mode === 'create' ? createEmptyBusinessPartner() : null)
  const [loading, setLoading] = useState(mode === 'existing')
  const [error, setError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
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
  const activePartnerId = partner?.id || partnerId
  const refreshAttempt = useRef(null), refreshSubmitting = useRef(false), refreshPartner = useRef(activePartnerId)

  useEffect(() => { refreshPartner.current = activePartnerId; return () => { refreshPartner.current = null } }, [activePartnerId])

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
    const request = archiveMode ? getBusinessPartner(partnerId) : getEffectiveBusinessPartner(partnerId)
    request.then((result) => { if (active) { setPartner(result); setCurrentValues(result); setReferenceStale(false); setPartnerFormVersion((version) => version + 1); setError(result ? '' : 'Der Geschäftspartner wurde nicht gefunden.') } })
      .catch((error) => {
        if (active) { setPartner(null); setCurrentValues(null); setError('Die Stammdaten oder die Partner-Weiterleitung konnten nicht geladen werden.') }
        void reportTechnicalFailure({ module: 'partner-links', stage: 'resolve', recordId: partnerId, error })
      })
      .finally(() => { if (active) { setLoadedReference(referenceKey); setLoading(false) } })
    return () => { active = false }
  }, [archiveMode, location.key, mode, partnerId, referenceKey])

  useEffect(() => {
    if (mode !== 'existing' || archiveMode || !partner?.id) return undefined
    let active = true
    const version = partnerReferenceVersion(partner)
    const check = () => {
      if (document.visibilityState === 'hidden') return
      getEffectiveBusinessPartner(partnerId).then((current) => {
        if (active && partnerReferenceVersion(current) !== version) setReferenceStale(true)
      }).catch((error) => {
        if (active) setReferenceStale(true)
        void reportTechnicalFailure({ module: 'partner-links', stage: 'revalidate', recordId: partnerId, error })
      })
    }
    window.addEventListener('focus', check)
    return () => { active = false; window.removeEventListener('focus', check) }
  }, [archiveMode, mode, partner, partnerId])

  async function refreshPalletAccount(id) {
    if (!canView('pallets')) return
    const result = await loadPalletAccount(id)
    setPalletAccount(result?.account || null)
  }

  useEffect(() => {
    if (mode !== 'existing' || !canView('pallets')) return
    let isCurrent = true
    loadPalletAccount(activePartnerId)
      .then((result) => { if (isCurrent) setPalletAccount(result?.account || null) })
      .catch(() => { if (isCurrent) setPalletAccount(null) })
    return () => { isCurrent = false }
  }, [activePartnerId, canView, mode])

  useEffect(() => {
    if (!canView('masterData')) return undefined
    return watchShipmentTrackingRuleCatalog(setRuleCatalog, () => setRuleCatalog(fallbackShipmentTrackingRuleCatalog()))
  }, [canView])

  useEffect(() => {
    if (mode !== 'existing' || !canView('crm')) return
    listCrmTransportRatingSummaries()
      .then((ratings) => setCrmRatings(ratings[activePartnerId] ?? {}))
      .catch(() => setCrmRatings({}))
  }, [activePartnerId, canView, mode])

  async function handleSubmit(values) {
    setSubmitting(true)
    setError('')
    try {
      if (mode !== 'create') {
        if (archiveMode || referenceStale) {
          setReferenceStale(true)
          setError('Die Partnerzuordnung oder die Stammdaten wurden inzwischen geändert. Deine Eingaben bleiben erhalten. Bitte die Seite vor dem Speichern neu laden.')
          return false
        }
      }
      const savedId = mode === 'create' ? await createBusinessPartner(values, ruleCatalog, getHistoryActor(authState)) : (await updateBusinessPartner(activePartnerId, values, getHistoryActor(authState), { referencePartnerId: partnerId, expectedReferenceVersion: partnerReferenceVersion(partner) }), activePartnerId)
      if (mode === 'create') {
        navigate(businessPartnerDetailPath(savedId), { state: { toast: 'Geschäftspartner erfolgreich angelegt.' } })
      } else {
        try {
          const refreshed = await getBusinessPartner(savedId)
          setPartner(refreshed)
          setCurrentValues(refreshed)
          setToast('Änderungen gespeichert.')
        } catch (error) {
          setReferenceStale(true)
          setToast('Änderungen gespeichert. Der aktuelle Stand konnte nicht neu geladen werden. Bitte die Seite neu laden.')
          void reportTechnicalFailure({ module: 'partner-links', stage: 'reload-after-save', recordId: savedId, error })
        }
      }
      return true
    } catch (error) {
      if (error.code === 'failed-precondition') {
        setReferenceStale(true)
        setError('Die Partnerzuordnung oder die Stammdaten wurden inzwischen geändert. Deine Eingaben bleiben erhalten. Bitte die Seite vor dem Speichern neu laden.')
      } else {
        setError('Speichern nicht möglich. Bitte Firestore-Zugriff und Verbindung prüfen.')
        void reportTechnicalFailure({ module: 'partner-links', stage: 'save', recordId: activePartnerId, error })
      }
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function handleManualMerge(result) {
    setMergeDirection('')
    setMergeMenuOpen(false)
    setToast('Partner wurden zusammengeführt.')
    if (result.targetPartnerId !== activePartnerId) {
      setLoading(true)
      navigate(businessPartnerDetailPath(result.targetPartnerId), { state: { toast: 'Partner wurden zusammengeführt.' } })
      return
    }
    try {
      const refreshed = await getEffectiveBusinessPartner(partnerId)
      setPartner(refreshed)
      setCurrentValues(refreshed)
      await refreshPalletAccount(refreshed?.id || activePartnerId)
      setPartnerFormVersion((value) => value + 1)
    } catch { setError('Die Zusammenführung war erfolgreich. Bitte die Stammdatenseite neu laden.') }
  }

  async function handleMergeSeparated(result) {
    try {
      const refreshed = await getEffectiveBusinessPartner(partnerId)
      setPartner(refreshed)
      setCurrentValues(refreshed)
      await refreshPalletAccount(refreshed?.id || activePartnerId)
      setPartnerFormVersion((value) => value + 1)
      setToast(result.warnings?.length ? 'Zusammenführung getrennt. Einige später geänderte Werte benötigen manuelle Prüfung.' : 'Zusammenführung sicher getrennt.')
    } catch { setToast('Zusammenführung getrennt. Bitte das Stammdatenblatt neu laden.') }
  }

  async function handleDycosReview(decision) {
    const refreshed = await getEffectiveBusinessPartner(partnerId)
    setPartner(refreshed); setCurrentValues(refreshed); setFormDirty(false)
    setPartnerFormVersion(value => value + 1)
    setToast(decision === 'accept' ? 'DyCoS-Wert wurde übernommen.' : 'Abweichung wurde verworfen. Drehpunkt-Wert bleibt erhalten.')
  }

  async function refreshFromDycos() {
    if (refreshSubmitting.current || archiveMode || referenceStale || formDirty || isSubmitting || reviewBusy || !canEdit('masterData') || partner?.mergedIntoPartnerId) return
    const targetId = activePartnerId
    refreshSubmitting.current = true; setRefreshing(true); setMergeMenuOpen(false); setRefreshResult(null); setError('')
    mergeMenuRef.current?.querySelector('button')?.focus()
    if (refreshAttempt.current?.partnerId !== targetId) refreshAttempt.current = { partnerId: targetId, requestId: crypto.randomUUID() }
    let saved = false
    try {
      const result = await refreshDycosMasterData(refreshAttempt.current)
      saved = true
      if (result.partnerId !== targetId || !['updated', 'unchanged'].includes(result.status)) throw new Error('Unexpected refresh target')
      const refreshed = await getBusinessPartner(targetId)
      if (!refreshed) throw new Error('Refreshed record is missing')
      if (refreshPartner.current !== targetId) return
      setPartner(refreshed); setCurrentValues(refreshed); setFormDirty(false); setPartnerFormVersion(value => value + 1)
      setRefreshResult(result); refreshAttempt.current = null
      setToast(result.status === 'updated' ? 'Stammdaten wurden aus DyCoS ergänzt.' : 'Stammdaten sind aktuell.')
    } catch (caught) {
      if (refreshPartner.current === targetId) setError(saved ? 'Die Aktualisierung wurde gespeichert. Bitte das Stammdatenblatt neu laden.' : dycosMasterDataError(caught))
    } finally { refreshSubmitting.current = false; if (refreshPartner.current) setRefreshing(false) }
  }

  function startDycosRefresh() {
    if (archiveMode || referenceStale || formDirty || isSubmitting || reviewBusy || refreshing || !dycosPartnerRefreshTargets(partner)?.length) return
    void refreshFromDycos()
  }

  if (loading || (mode === 'existing' && loadedReference !== referenceKey)) return <p className="page-state"><StaticText source={"Stammdaten werden geladen …"} /></p>
  if (error && !partner) return <section className="page-state page-state--error"><p>{<StaticText source={error} />}</p><BackLink to="/kunden-unternehmer" /></section>

  const shownPartner = currentValues ?? partner
  const isNew = mode === 'create'
  const archived = !isNew && Boolean(shownPartner?.mergedIntoPartnerId)
  const missingCreditorNumberNotice = getMissingCreditorNumberNotice(shownPartner)
  const editable = canEdit('masterData') && !archiveMode && !archived && !referenceStale
  const refreshAccounts = dycosPartnerRefreshTargets(partner || {}) || []

  return (
    <div className="masterdata-page">
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
      <div className="masterdata-action-row"><div><BackLink to="/kunden-unternehmer" /></div>{isNew && editable && <button aria-busy={isSubmitting} className="button masterdata-record-actions__save" form="business-partner-form" type="submit" disabled={isSubmitting}>{<StaticText source={isSubmitting ? 'Wird angelegt …' : 'Anlegen'} />}</button>}{!isNew && canView('masterData') && <div className="partner-merge-menu" ref={mergeMenuRef}><TranslatedProps sources={{"aria-label":"Partner-Aktionen öffnen"}}><button className="partner-merge-menu__trigger" type="button" aria-label="Partner-Aktionen öffnen" aria-haspopup="menu" aria-expanded={mergeMenuOpen} onClick={() => setMergeMenuOpen((open) => !open)}>…</button></TranslatedProps>{mergeMenuOpen && <div className="partner-merge-menu__dropdown" role="menu">{editable && <TranslatedProps sources={{ title: !refreshAccounts.length ? 'Keine gültige Debitoren- oder Kreditornummer hinterlegt.' : formDirty ? 'Bitte zuerst die offenen Änderungen speichern oder verwerfen.' : 'Stammdaten aus DyCoS ergänzen' }}><button type="button" role="menuitem" disabled={refreshing || reviewBusy || isSubmitting || formDirty || !refreshAccounts.length} onClick={startDycosRefresh}><StaticText source={refreshing ? 'Wird aktualisiert …' : 'Aktualisieren'} /></button></TranslatedProps>}<button type="button" role="menuitem" onClick={() => { mergeMenuRef.current?.querySelector('button')?.focus(); setHistoryOpen(true); setMergeMenuOpen(false) }}><StaticText source="Historie" /></button>{!archiveMode && !referenceStale && !archived && canEdit('partnerMerges') && <><button type="button" role="menuitem" onClick={() => { if (refreshing || reviewBusy || isSubmitting) return; setMergeDirection('current-source'); setMergeMenuOpen(false) }}><StaticText source={"Diesen Partner in anderen zusammenführen …"} /></button><button type="button" role="menuitem" onClick={() => { if (refreshing || reviewBusy || isSubmitting) return; setMergeDirection('current-target'); setMergeMenuOpen(false) }}><StaticText source={"Anderen Partner hierher zusammenführen …"} /></button></>}</div>}</div>}</div>
      {referenceStale && <aside className="partner-archive-notice" role="alert"><p><StaticText source="Die Partnerzuordnung oder die Stammdaten wurden inzwischen geändert. Deine Eingaben bleiben erhalten. Bitte die Seite vor dem Speichern neu laden." /></p></aside>}
      {!archiveMode && !isNew && activePartnerId !== partnerId && <aside className="partner-archive-notice"><p><StaticText source="Dieser Vorgang verweist auf einen zusammengeführten Partner. Du siehst die aktuellen Stammdaten des Zielpartners." /></p><Link to={businessPartnerArchivePath(partnerId)}><StaticText source="Ursprüngliches Stammdatenblatt ansehen" /></Link></aside>}
      {archived && <aside className="partner-archive-notice"><strong><StaticText source={"Archiviertes Stammdatenblatt"} /></strong><p><StaticText source={"Dieses Blatt wurde zusammengeführt und ist nur noch lesbar. Seine früheren Daten bleiben erhalten."} /></p><Link to={businessPartnerDetailPath(partnerId)}><StaticText source={"Aktiven Zielpartner öffnen"} /></Link></aside>}
      {!archived && <MissingCreditorNumberNotice notice={missingCreditorNumberNotice} />}
      {!isNew && <BusinessPartnerHeader account={palletAccount} canViewCrm={!archived && canView('crm')} canViewPallets={!archived && canView('pallets')} partner={shownPartner} partnerId={activePartnerId} ratings={crmRatings} />}
      {!isNew && !archiveMode && !referenceStale && canView('masterData') && <DycosPartnerDataNotice key={activePartnerId} partner={shownPartner} partnerId={activePartnerId} dirty={formDirty || isSubmitting || refreshing} onResolved={handleDycosReview} onBusyChange={setReviewBusy} />}
      {refreshing && <p role="status"><StaticText source="Stammdaten werden aus DyCoS aktualisiert …" /></p>}
      {refreshResult?.partnerId === activePartnerId && <div role="status"><p><StaticText source={refreshResult.status === 'updated' ? 'Stammdaten wurden aus DyCoS ergänzt.' : 'Stammdaten sind aktuell.'} /></p>{refreshResult.refreshedAccounts?.length === 2 && <p><StaticText source="Kunden- und Unternehmerdaten wurden gemeinsam abgeholt." /></p>}{refreshResult.conflicts > 0 && <p><StaticText source="Abweichende Werte wurden beibehalten. Die Unterschiede sind im Stammdatenblatt sichtbar." /></p>}{refreshResult.warningCodes?.length > 0 && <p><StaticText source="Einzelne Quelldaten oder Zuordnungen benötigen eine Prüfung. Bitte die Importhinweise beachten." /></p>}</div>}
      {error && <p className="form-error">{<StaticText source={error} />}</p>}
      <BusinessPartnerForm key={`${activePartnerId || 'new'}-${archiveMode}-${partnerFormVersion}`} formId="business-partner-form" initialValue={partner} isNew={isNew} onSubmit={handleSubmit} onFormChange={setCurrentValues} onDirtyChange={setFormDirty} readOnly={!editable || reviewBusy || refreshing} saving={isSubmitting} canViewArchivedPartner={canView('masterData')} canMerge={!archiveMode && !referenceStale && canEdit('partnerMerges')} onMergeSeparated={handleMergeSeparated} ruleCatalog={ruleCatalog} />
      {!isNew && <PartnerRelatedRecords key={`${activePartnerId}-${partnerFormVersion}`} partnerId={activePartnerId} />}
      {historyOpen && <BusinessPartnerHistoryModal key={activePartnerId} partner={partner} partnerId={activePartnerId} onClose={() => setHistoryOpen(false)} />}
      {mergeDirection && !archiveMode && !referenceStale && <ManualPartnerMergeFlow currentPartnerId={activePartnerId} direction={mergeDirection} onClose={() => setMergeDirection('')} onMerged={handleManualMerge} />}
    </div>
  )
}
