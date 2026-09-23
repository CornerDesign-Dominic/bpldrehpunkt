import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import BusinessPartnerForm from '../components/business-partners/BusinessPartnerForm.jsx'
import BusinessPartnerHeader from '../components/business-partners/BusinessPartnerHeader.jsx'
import ManualPartnerMergeFlow from '../components/business-partners/ManualPartnerMergeFlow.jsx'
import Toast from '../components/ui/Toast.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import { createBusinessPartner, createEmptyBusinessPartner, getBusinessPartner, updateBusinessPartner } from '../lib/businessPartners.js'
import { listCurrentCrmRatings } from '../lib/crmRatings.js'
import { getHistoryActor } from '../lib/partnerHistory.js'
import { listPalletClosings, listPalletMovements, summarizePalletAccount } from '../lib/palletAccounts.js'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getMissingCreditorNumberNotice } from '../lib/importedPartnerStatus.js'

function formatImportDate(value) {
  if (value?.toDate) return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(value.toDate())
  if (typeof value === 'string' && value) return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  return '—'
}

function MissingCreditorNumberNotice({ notice }) {
  if (!notice) return null
  return <aside className="partner-import-warning" aria-labelledby="partner-import-warning-title">
    <strong id="partner-import-warning-title">Kreditorennummer fehlt</strong>
    <p>Dieser Unternehmer wurde aus einem Transportauftrag angelegt. Bitte Stammdaten ergänzen oder später mit einem bestehenden Unternehmer zusammenführen.</p>
    <small>TA-Nummer: {notice.transportOrderNumber || '—'} · Importlauf: {notice.importRunId || '—'} · Importdatum: {formatImportDate(notice.importedAt)}</small>
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
  const [toast, setToast] = useState(location.state?.toast ?? '')
  const [crmRatings, setCrmRatings] = useState({})
  const [palletMovements, setPalletMovements] = useState(null)
  const [palletClosings, setPalletClosings] = useState(null)
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false)
  const [mergeDirection, setMergeDirection] = useState('')
  const [partnerFormVersion, setPartnerFormVersion] = useState(0)
  const mergeMenuRef = useRef(null)

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
      .then((result) => { if (active) { setPartner(result); setCurrentValues(result); if (!result) setError('Der Geschäftspartner wurde nicht gefunden.') } })
      .catch(() => { if (active) setError('Die Stammdaten konnten nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [mode, partnerId])

  useEffect(() => {
    if (mode !== 'existing') return
    let isCurrent = true
    Promise.all([listPalletMovements(partnerId), listPalletClosings(partnerId)])
      .then(([movements, closings]) => { if (isCurrent) { setPalletMovements(movements); setPalletClosings(closings) } })
      .catch(() => { if (isCurrent) { setPalletMovements([]); setPalletClosings([]) } })
    return () => { isCurrent = false }
  }, [mode, partnerId])

  useEffect(() => {
    if (mode !== 'existing') return
    listCurrentCrmRatings([partnerId])
      .then((ratings) => setCrmRatings(ratings[partnerId] ?? {}))
      .catch(() => setCrmRatings({}))
  }, [mode, partnerId])

  async function handleSubmit(values) {
    setSubmitting(true)
    setError('')
    try {
      const savedId = mode === 'create' ? await createBusinessPartner(values) : (await updateBusinessPartner(partnerId, values, getHistoryActor(authState)), partnerId)
      if (mode === 'create') {
        navigate(`/kunden-unternehmer/${savedId}`, { state: { toast: 'Geschäftspartner erfolgreich angelegt.' } })
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
      navigate(`/kunden-unternehmer/${result.targetPartnerId}`, { state: { toast: 'Partner wurden zusammengeführt.' } })
      return
    }
    try {
      const refreshed = await getBusinessPartner(partnerId)
      setPartner(refreshed)
      setCurrentValues(refreshed)
      setPartnerFormVersion((value) => value + 1)
    } catch { setError('Die Zusammenführung war erfolgreich. Bitte die Stammdatenseite neu laden.') }
  }

  async function handleMergeSeparated(result) {
    try {
      const refreshed = await getBusinessPartner(partnerId)
      setPartner(refreshed)
      setCurrentValues(refreshed)
      setPartnerFormVersion((value) => value + 1)
      setToast(result.warnings?.length ? 'Zusammenführung getrennt. Einige später geänderte Werte benötigen manuelle Prüfung.' : 'Zusammenführung sicher getrennt.')
    } catch { setToast('Zusammenführung getrennt. Bitte das Stammdatenblatt neu laden.') }
  }

  const palletAccount = useMemo(() => (palletMovements && palletClosings ? summarizePalletAccount(palletMovements, palletClosings, partnerId) : null), [palletClosings, palletMovements, partnerId])

  if (loading) return <p className="page-state">Stammdaten werden geladen …</p>
  if (error && !partner) return <section className="page-state page-state--error"><p>{error}</p><BackLink to="/kunden-unternehmer" /></section>

  const shownPartner = currentValues ?? partner
  const isNew = mode === 'create'
  const archived = !isNew && Boolean(shownPartner?.mergedIntoPartnerId)
  const missingCreditorNumberNotice = getMissingCreditorNumberNotice(shownPartner)
  const editable = canEdit('masterData') && !archived

  return (
    <div className="masterdata-page">
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
      <div className="masterdata-action-row"><div><BackLink to="/kunden-unternehmer" /></div>{isNew && editable && <button aria-busy={isSubmitting} className="button masterdata-record-actions__save" form="business-partner-form" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Wird angelegt …' : 'Anlegen'}</button>}{!isNew && !archived && canEdit('partnerMerges') && <div className="partner-merge-menu" ref={mergeMenuRef}><button className="partner-merge-menu__trigger" type="button" aria-label="Partner-Aktionen öffnen" aria-haspopup="menu" aria-expanded={mergeMenuOpen} onClick={() => setMergeMenuOpen((open) => !open)}>…</button>{mergeMenuOpen && <div className="partner-merge-menu__dropdown" role="menu"><button type="button" role="menuitem" onClick={() => { setMergeDirection('current-source'); setMergeMenuOpen(false) }}>Diesen Partner in anderen zusammenführen …</button><button type="button" role="menuitem" onClick={() => { setMergeDirection('current-target'); setMergeMenuOpen(false) }}>Anderen Partner hierher zusammenführen …</button></div>}</div>}</div>
      {archived && <aside className="partner-archive-notice"><strong>Archiviertes Stammdatenblatt</strong><p>Dieses Blatt wurde zusammengeführt und ist nur noch lesbar. Seine früheren Daten bleiben erhalten.</p><Link to={`/kunden-unternehmer/${shownPartner.mergedIntoPartnerId}`}>Aktiven Zielpartner öffnen</Link></aside>}
      {!archived && <MissingCreditorNumberNotice notice={missingCreditorNumberNotice} />}
      {!isNew && <BusinessPartnerHeader account={palletAccount} canViewCrm={!archived && canView('crm')} canViewPallets={!archived && canView('pallets')} partner={shownPartner} partnerId={partnerId} ratings={crmRatings} />}
      {error && <p className="form-error">{error}</p>}
      <BusinessPartnerForm key={`${partnerId || 'new'}-${partnerFormVersion}`} formId="business-partner-form" initialValue={partner} isNew={isNew} onSubmit={handleSubmit} onFormChange={setCurrentValues} readOnly={!editable} saving={isSubmitting} canViewArchivedPartner={canView('masterData')} canMerge={canEdit('partnerMerges')} onMergeSeparated={handleMergeSeparated} />
      {mergeDirection && <ManualPartnerMergeFlow currentPartnerId={partnerId} direction={mergeDirection} onClose={() => setMergeDirection('')} onMerged={handleManualMerge} />}
    </div>
  )
}
