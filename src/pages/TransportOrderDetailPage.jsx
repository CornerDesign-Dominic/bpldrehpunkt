import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { calculateTransportOrderRoute, getTransportOrder, getTransportOrderRoute } from '../lib/transportOrders.js'
import { isCarrierMasterDataIncomplete } from '../lib/importedPartnerStatus.js'
import { businessPartnerDetailPath } from '../lib/businessPartnerLinks.js'
import { transportOrderDocumentTitle } from '../lib/transportOrderPresentation.js'
import { CopyIcon } from '../components/icons.jsx'
import ShipmentTrackingTimeline from '../components/transport-orders/ShipmentTrackingTimeline.jsx'
import { getEffectiveBusinessPartner } from '../lib/businessPartners.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { usePermissions } from '../auth/usePermissions.js'
import { useAuth } from '../auth/useAuth.js'
import { getOwnTransportOrderRatings, saveTransportOrderRating } from '../lib/transportOrderRatings.js'
import TransportOrderRatingModal from '../components/transport-orders/TransportOrderRatingModal.jsx'
import { getShipmentTracking, getShipmentTrackingDryRun, sendManualShipmentTrackingMail, shipmentTrackingDryRunErrorMessage, shipmentTrackingManualMailErrorMessage, updateManualShipmentTracking } from '../lib/shipmentTracking.js'
import { shipmentTrackingTimelineModel } from '../lib/shipmentTrackingPresentation.js'
import ShipmentTrackingEditorModal from '../components/transport-orders/ShipmentTrackingEditorModal.jsx'
import ShipmentTrackingStageInfoModal from '../components/transport-orders/ShipmentTrackingStageInfoModal.jsx'
import ShipmentTrackingRecipientsModal from '../components/transport-orders/ShipmentTrackingRecipientsModal.jsx'
import ShipmentTrackingManualMailModal from '../components/transport-orders/ShipmentTrackingManualMailModal.jsx'
import ShipmentTrackingMailtoModal from '../components/transport-orders/ShipmentTrackingMailtoModal.jsx'
import ShipmentTrackingHistory from '../components/transport-orders/ShipmentTrackingHistory.jsx'
import TransportOrderRoutePanel from '../components/transport-orders/TransportOrderRoutePanel.jsx'
import TransportOrderRouteCountrySelectionModal from '../components/transport-orders/TransportOrderRouteCountrySelectionModal.jsx'
import TransportOrderLinkedCasesCard from '../components/case-links/TransportOrderLinkedCasesCard.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import { transportOrderCasePrefill } from '../../shared/caseTransportLinks.js'

function Detail({ label, children, emptyFallback = '—' }) { return <div><dt>{label}</dt><dd>{children || emptyFallback}</dd></div> }
async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const temporaryInput = document.createElement('textarea')
  temporaryInput.value = value
  temporaryInput.setAttribute('readonly', '')
  temporaryInput.style.position = 'fixed'
  temporaryInput.style.opacity = '0'
  document.body.appendChild(temporaryInput)
  temporaryInput.select()
  document.execCommand('copy')
  temporaryInput.remove()
}
function CopyDetail({ label, value }) {
  const [copied, setCopied] = useState(false)
  const displayValue = value || '—'
  async function copyValue() {
    try {
      await copyToClipboard(displayValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return <div><dt>{label}</dt><dd className="transport-order-copy-detail__value"><span>{displayValue}</span>{displayValue !== '—' && <button type="button" className="transport-order-copy-detail__button" onClick={copyValue} title={copied ? 'Kopiert' : `${label} kopieren`} aria-label={copied ? `${label} kopiert` : `${label} kopieren`}><CopyIcon size={14} /></button>}</dd></div>
}
function formatNumber(value, suffix = '') { return typeof value === 'number' ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value) + suffix : '—' }
function formatCurrency(value) { return typeof value === 'number' ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value) : '—' }
function formatStationDateTime(value) {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(`${value}:00`)
  if (Number.isNaN(date.getTime())) return '—'
  const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  return `${weekdays[date.getDay()]}, ${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
function formatTimestamp(value) { return value?.toDate ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(value.toDate()) : '—' }
function formatPartnerAddress(partner) {
  const address = partner?.address || {}
  return [[address.street, address.houseNumber].filter(Boolean).join(' '), [address.postalCode, address.city].filter(Boolean).join(' '), address.country].filter(Boolean).join(', ')
}
function usePartnerMasterData(partnerId) {
  const [entry, setEntry] = useState({ partnerId: '', data: null })
  useEffect(() => {
    if (!partnerId) return undefined
    let current = true
    getEffectiveBusinessPartner(partnerId).then((partner) => { if (current) setEntry({ partnerId, data: partner }) }).catch(() => { if (current) setEntry({ partnerId, data: null }) })
    return () => { current = false }
  }, [partnerId])
  return entry.partnerId === partnerId ? entry.data : null
}
function PartnerLink({ partner, effectivePartner, warning }) {
  const name = effectivePartner?.companyName || partner?.partnerName || partner?.originalName || partner?.name
  if (!partner?.partnerId) return name || '—'
  return <span className="transport-order-partner-link"><Link to={businessPartnerDetailPath(effectivePartner?.id || partner.partnerId)}>{name}</Link>{warning && <span className="transport-order-partner-link__warning" role="img" aria-label="Unternehmer-Stammdaten unvollständig – Kreditorennummer fehlt." title="Unternehmer-Stammdaten unvollständig – Kreditorennummer fehlt.">!</span>}</span>
}

export default function TransportOrderDetailPage() {
  const { transportOrderId } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tracking, setTracking] = useState(null)
  const [trackingEvents, setTrackingEvents] = useState([])
  const [trackingLoading, setTrackingLoading] = useState(true)
  const [trackingError, setTrackingError] = useState('')
  const [trackingEditorStage, setTrackingEditorStage] = useState(null)
  const [trackingInfoStage, setTrackingInfoStage] = useState(null)
  const [trackingRecipientsEditorOpen, setTrackingRecipientsEditorOpen] = useState(false)
  const [trackingManualMailBundles, setTrackingManualMailBundles] = useState([])
  const [trackingManualMailOpen, setTrackingManualMailOpen] = useState(false)
  const [trackingMailtoOpen, setTrackingMailtoOpen] = useState(false)
  const [trackingSaving, setTrackingSaving] = useState(false)
  const [trackingDryRun, setTrackingDryRun] = useState(null)
  const [trackingDryRunError, setTrackingDryRunError] = useState('')
  const [trackingDryRunLoading, setTrackingDryRunLoading] = useState(false)
  const [trackingCompletionConfirmationOpen, setTrackingCompletionConfirmationOpen] = useState(false)
  const [route, setRoute] = useState(null)
  const [routeError, setRouteError] = useState('')
  const [routeCalculating, setRouteCalculating] = useState(false)
  const [routeCountrySelection, setRouteCountrySelection] = useState([])
  const [ratings, setRatings] = useState({})
  const [ratingPartners, setRatingPartners] = useState({})
  const [ratingsError, setRatingsError] = useState('')
  const [ratingsLoading, setRatingsLoading] = useState(true)
  const [ratingsReloadKey, setRatingsReloadKey] = useState(0)
  const [ratingRole, setRatingRole] = useState('')
  const { setTitle } = usePageHeader()
  const { canEdit, canView } = usePermissions()
  const { user } = useAuth()
  useEffect(() => { getTransportOrder(transportOrderId).then((entry) => { setOrder(entry); if (!entry) setError('Transportauftrag nicht gefunden.') }).catch(() => setError('Der Transportauftrag konnte nicht geladen werden.')).finally(() => setLoading(false)) }, [transportOrderId])
  async function refreshTracking() {
    setTrackingLoading(true)
    try {
      const result = await getShipmentTracking(transportOrderId)
      setTracking(result.tracking); setTrackingEvents(result.events); setTrackingError('')
    } catch {
      setTrackingError('Die Sendungsverfolgung konnte nicht geladen werden.')
    } finally { setTrackingLoading(false) }
  }
  useEffect(() => {
    let current = true
    getShipmentTracking(transportOrderId).then((result) => {
      if (!current) return
      setTracking(result.tracking); setTrackingEvents(result.events); setTrackingError('')
    }).catch(() => { if (current) setTrackingError('Die Sendungsverfolgung konnte nicht geladen werden.') }).finally(() => { if (current) setTrackingLoading(false) })
    return () => { current = false }
  }, [transportOrderId])
  const trackingVersion = tracking?.updatedAt?.toMillis?.() || tracking?.updatedAt?.seconds || ''
  useEffect(() => {
    if (tracking?.lifecycleStatus !== 'active') return undefined
    let current = true
    Promise.resolve().then(() => {
      if (current) setTrackingDryRunLoading(true)
      return getShipmentTrackingDryRun(transportOrderId)
    }).then((preview) => {
      if (current) { setTrackingDryRun(preview); setTrackingDryRunError('') }
    }).catch((caught) => {
      if (current) { setTrackingDryRun(null); setTrackingDryRunError(shipmentTrackingDryRunErrorMessage(caught)) }
    }).finally(() => { if (current) setTrackingDryRunLoading(false) })
    return () => { current = false }
  }, [transportOrderId, tracking?.lifecycleStatus, trackingVersion])
  async function refreshRoute() {
    const currentRoute = await getTransportOrderRoute(transportOrderId)
    setRoute(currentRoute)
  }
  useEffect(() => {
    let current = true
    getTransportOrderRoute(transportOrderId).then((result) => { if (current) { setRoute(result); setRouteError('') } }).catch(() => { if (current) setRouteError('Die gespeicherte Planungsstrecke konnte nicht geladen werden.') })
    return () => { current = false }
  }, [transportOrderId])
  const customerMasterData = usePartnerMasterData(order?.imported?.customer?.partnerId)
  const carrierMasterData = usePartnerMasterData(order?.imported?.carrier?.partnerId)
  useEffect(() => {
    if (!order?.id || !user?.uid || !canView('transportOrders')) return undefined
    let current = true
    getOwnTransportOrderRatings(order.id).then((result) => { if (current) { setRatings(result.ratings); setRatingPartners(result.partners); setRatingsError('') } }).catch((caught) => { if (current) { setRatings({}); setRatingPartners({}); setRatingsError(caught?.code === 'functions/not-found' ? 'Die Bewertungsfunktion ist derzeit nicht verfügbar.' : 'Die Bewertung konnte nicht geladen werden.') } }).finally(() => { if (current) setRatingsLoading(false) })
    return () => { current = false }
  }, [order?.id, user?.uid, canView, ratingsReloadKey])
  function retryRatings() {
    setRatingsLoading(true)
    setRatingsError('')
    setRatingsReloadKey((current) => current + 1)
  }
  async function saveRating(values) {
    const rating = await saveTransportOrderRating(values)
    setRatings((current) => ({ ...current, [values.partnerRole]: rating }))
    setRatingRole('')
  }
  function ratingButtonLabel(role) {
    const label = role === 'customer' ? 'Kunde' : 'Unternehmer'
    const rating = ratings[role]
    return rating ? `✓ ${label} bewertet · ${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(rating.averageScore)} ★` : canEdit('transportOrders') ? `${label} bewerten` : `${label}: keine eigene Bewertung`
  }
  useEffect(() => {
    document.title = transportOrderDocumentTitle(order?.externalNumber)
    return () => { document.title = 'Drehpunkt' }
  }, [order?.externalNumber])
  useEffect(() => {
    setTitle(order?.externalNumber ? `TA ${order.externalNumber}` : '')
    return () => setTitle('')
  }, [order?.externalNumber, setTitle])
  async function performTrackingAction(action, payload = {}) {
    setTrackingSaving(true); setTrackingError('')
    try {
      await updateManualShipmentTracking({ orderId: transportOrderId, action, source: payload.source || 'manual', note: payload.note || '', values: payload.changes, recipientChanges: payload.recipientChanges })
      setTrackingEditorStage(null)
      setTrackingRecipientsEditorOpen(false)
      await refreshTracking()
    } catch (caught) {
      setTrackingError(caught instanceof Error ? caught.message : 'Die Sendungsverfolgung konnte nicht gespeichert werden.')
    } finally { setTrackingSaving(false) }
  }
  async function confirmTrackingCompletion() {
    await performTrackingAction('complete')
    setTrackingCompletionConfirmationOpen(false)
  }
  async function sendTrackingManualMail(payload) {
    setTrackingSaving(true); setTrackingError('')
    try {
      await sendManualShipmentTrackingMail(transportOrderId, payload)
      setTrackingManualMailBundles([])
      setTrackingManualMailOpen(false)
      await refreshTracking()
    } catch (caught) {
      setTrackingError(shipmentTrackingManualMailErrorMessage(caught))
    } finally { setTrackingSaving(false) }
  }
  function ambiguousRouteCountryProblems(error) {
    const problems = error?.details?.routeProblems
    return Array.isArray(problems) ? problems.filter((problem) => problem?.code === 'country_ambiguous' && problem.station && Array.isArray(problem.countryCandidates) && problem.countryCandidates.length > 1) : []
  }
  async function calculateRoute(countryOverrides = undefined) {
    setRouteCalculating(true); setRouteError('')
    try {
      await calculateTransportOrderRoute(transportOrderId, countryOverrides)
      setRouteCountrySelection([])
      await refreshRoute()
    } catch (caught) {
      const ambiguousProblems = ambiguousRouteCountryProblems(caught)
      if (ambiguousProblems.length) {
        setRouteCountrySelection(ambiguousProblems)
        return
      }
      setRouteError(caught instanceof Error ? caught.message.replace(/^.*?:\s*/, '') : 'Die Planungsstrecke konnte nicht berechnet werden.')
      try { await refreshRoute() } catch { /* Die Nutzerfehlermeldung bleibt sichtbar. */ }
    } finally { setRouteCalculating(false) }
  }
  const imported = order?.imported
  function createCase(caseType) {
    const route = { damage: '/schaeden', inkasso: '/inkasso', legalDispute: '/legal-disputes' }[caseType]
    if (route) navigate(route, { state: { caseCreation: { caseType, prefill: transportOrderCasePrefill(order) } } })
  }
  if (loading) return <div className="transport-order-detail-page"><p className="page-state">Transportauftrag wird geladen …</p></div>
  if (error || !imported) return <div className="transport-order-detail-page"><section className="todo-detail-empty"><h2>Transportauftrag nicht verfügbar</h2><p>{error || 'Noch keine Daten verfügbar.'}</p></section></div>
  return <div className="transport-order-detail-page">
    <ConfirmDialog open={trackingCompletionConfirmationOpen} title="Sendungsverfolgung abschließen?" message="Möchtest du die Sendungsverfolgung für diesen Auftrag wirklich abschließen?" confirmLabel="Ja, abschließen" submittingLabel="Wird abgeschlossen …" isSubmitting={trackingSaving} onCancel={() => setTrackingCompletionConfirmationOpen(false)} onConfirm={() => void confirmTrackingCompletion()} />
    {routeCountrySelection.length > 0 && <TransportOrderRouteCountrySelectionModal problems={routeCountrySelection} calculating={routeCalculating} onCancel={() => setRouteCountrySelection([])} onConfirm={(countryOverrides) => void calculateRoute(countryOverrides)} />}
    {ratingRole && <TransportOrderRatingModal key={ratingRole} role={ratingRole} partner={ratingPartners[ratingRole]} order={order} rating={ratings[ratingRole]} canEdit={canEdit('transportOrders')} onClose={() => setRatingRole('')} onSave={saveRating} />}
    <div className="transport-order-detail-layout">
      <aside className="transport-order-detail-actions" aria-label="Verknüpfungen">
        <TransportOrderRoutePanel route={route} canEdit={canEdit('transportOrders')} calculating={routeCalculating} error={routeError} onCalculate={() => void calculateRoute()} />
        <TransportOrderLinkedCasesCard transportOrderId={transportOrderId} canEditCase={canEdit} canViewCase={canView} onCreate={createCase} />
        <section className="transport-order-detail-section"><h3>Bewertung</h3><div className="transport-order-detail-actions__buttons"><button type="button" className="button button--secondary" disabled={ratingsLoading || Boolean(ratingsError)} onClick={() => setRatingRole('customer')}>{ratingButtonLabel('customer')}</button><button type="button" className="button button--secondary" disabled={ratingsLoading || Boolean(ratingsError)} onClick={() => setRatingRole('carrier')}>{ratingButtonLabel('carrier')}</button></div>{ratingsError && <><p className="form-error" role="alert">{ratingsError}</p><button type="button" className="button button--secondary" onClick={retryRatings}>Erneut versuchen</button></>}</section>
      </aside>
      <main className="transport-order-detail-main">
        <section className="transport-order-detail-section transport-order-detail-section--transport-wide transport-order-detail-section--general"><div className="transport-order-detail-general-row transport-order-detail-general-row--order"><h4>Auftrag &amp; Preise</h4><dl className="transport-order-detail-list"><CopyDetail label="TA-Nummer" value={order.externalNumber} /><Detail label="Mitarbeiterrelation">{imported.relation}</Detail><CopyDetail label="Kundenreferenz" value={imported.customerReference} /><Detail label="Ertrag netto">{formatCurrency(imported.financial?.revenueNet)}</Detail><Detail label="Kosten netto">{formatCurrency(imported.financial?.costNet)}</Detail></dl></div><div className="transport-order-detail-general-row transport-order-detail-general-row--vehicle-cargo"><h4>Fahrzeug &amp; Ware</h4><dl className="transport-order-detail-list"><Detail label="Fahrzeugart">{imported.shipment?.vehicleType}</Detail><CopyDetail label="Kennzeichen" value={imported.shipment?.licensePlate} /><Detail label="Kolli">{formatNumber(imported.shipment?.packages)}</Detail><Detail label="Gewicht">{formatNumber(imported.shipment?.weightKg, ' kg')}</Detail><Detail label="Lademeter">{formatNumber(imported.shipment?.loadingMeters)}</Detail></dl></div></section>
        <section className="transport-order-detail-section"><h3>Kunde</h3><dl className="transport-order-detail-list"><Detail label="Frachtzahler"><PartnerLink partner={imported.customer} effectivePartner={customerMasterData} /></Detail><Detail label="Debitorennummer">{imported.customer?.debtorNumber}</Detail><Detail label="Adresse" emptyFallback="">{formatPartnerAddress(customerMasterData)}</Detail></dl></section>
        <section className="transport-order-detail-section"><h3>Unternehmer</h3><dl className="transport-order-detail-list"><Detail label="Unternehmer"><PartnerLink partner={imported.carrier} effectivePartner={carrierMasterData} warning={isCarrierMasterDataIncomplete(imported.carrier)} /></Detail><Detail label="Kreditorennummer">{carrierMasterData?.creditorNumber || imported.carrier?.creditorNumber}</Detail><Detail label="Adresse" emptyFallback="">{formatPartnerAddress(carrierMasterData)}</Detail><Detail label="TA versendet an">{imported.dispatch?.sentTo}</Detail></dl></section>
        <section className="transport-order-detail-section transport-order-detail-section--after-partners"><h3>Erste Ladestelle</h3><dl className="transport-order-detail-list"><CopyDetail label="Adresse" value={imported.loading?.originalText} /><CopyDetail label="Ort" value={imported.loading?.city} /><Detail label="Von">{formatStationDateTime(imported.loading?.window?.from)}</Detail><Detail label="Bis">{formatStationDateTime(imported.loading?.window?.until)}</Detail></dl></section>
        <section className="transport-order-detail-section transport-order-detail-section--after-partners"><h3>Ladehinweise</h3><dl className="transport-order-detail-list"><Detail label="Bemerkung">{imported.loading?.note}</Detail><CopyDetail label="Referenz" value={imported.loading?.reference} /></dl></section>
        <section className="transport-order-detail-section"><h3>Letzte Entladestelle</h3><dl className="transport-order-detail-list"><CopyDetail label="Adresse" value={imported.unloading?.originalText} /><CopyDetail label="Ort" value={imported.unloading?.city} /><Detail label="Von">{formatStationDateTime(imported.unloading?.window?.from)}</Detail><Detail label="Bis">{formatStationDateTime(imported.unloading?.window?.until)}</Detail></dl></section>
        <section className="transport-order-detail-section"><h3>Entladehinweise</h3><dl className="transport-order-detail-list"><Detail label="Bemerkung">{imported.unloading?.note}</Detail><CopyDetail label="Referenz" value={imported.unloading?.reference} /></dl></section>
        <ShipmentTrackingTimeline model={shipmentTrackingTimelineModel(tracking, imported, route, customerMasterData?.shipmentTrackingPolicy)} tracking={tracking} events={trackingEvents} dryRunPreview={tracking?.lifecycleStatus === 'active' ? trackingDryRun : null} dryRunLoading={tracking?.lifecycleStatus === 'active' && trackingDryRunLoading} dryRunError={tracking?.lifecycleStatus === 'active' ? trackingDryRunError : ''} canEdit={canEdit('transportOrders')} saving={trackingSaving} onStart={() => void performTrackingAction('start')} onEditStage={setTrackingEditorStage} onEditRecipients={() => setTrackingRecipientsEditorOpen(true)} onShowStageInfo={setTrackingInfoStage} onOpenMailTemplate={() => setTrackingMailtoOpen(true)} onManualDispatch={(bundles) => { setTrackingManualMailBundles(bundles); setTrackingManualMailOpen(true) }} onComplete={() => setTrackingCompletionConfirmationOpen(true)} />
        {trackingError && <p className="form-error transport-order-detail-tracking-error">{trackingError}</p>}
        <ShipmentTrackingHistory events={trackingEvents} loading={trackingLoading} error={trackingError} />
      </main>
      <aside className="transport-order-detail-system" aria-label="System und Kontext">
        <section className="transport-order-detail-section transport-order-detail-section--contacts"><h3>Kontakte</h3><div className="transport-order-detail-contact-group"><h4>Kunde</h4><dl className="transport-order-detail-list transport-order-detail-list--single"><CopyDetail label="Standard" value={imported.contacts?.customerStandardEmail} /><CopyDetail label="Info-1" value={imported.contacts?.customerForOrder} /></dl></div><div className="transport-order-detail-contact-group"><h4>Unternehmer</h4><dl className="transport-order-detail-list transport-order-detail-list--single"><CopyDetail label="Standard" value={imported.contacts?.carrierStandardEmail} /><CopyDetail label="Im Auftrag" value={imported.contacts?.carrierForOrder} /></dl></div></section>
        <section className="transport-order-detail-section transport-order-detail-section--import-info"><h3>Importinfos</h3><dl className="transport-order-detail-list transport-order-detail-list--single"><Detail label="Importiert am">{formatTimestamp(order.importMeta?.importedAt)}</Detail><Detail label="Zuletzt aktualisiert">{formatTimestamp(order.updatedAt || order.importMeta?.lastImportedAt)}</Detail></dl><details className="transport-order-detail-import-info"><summary>Weitere Importinfos</summary><dl className="transport-order-detail-list transport-order-detail-list--single"><Detail label="Importdatei">{order.importMeta?.fileName}</Detail><Detail label="Importlauf">{order.importMeta?.importRunId}</Detail></dl></details></section>
      </aside>
    </div>
    {trackingEditorStage && <ShipmentTrackingEditorModal tracking={tracking} stageId={trackingEditorStage} saving={trackingSaving} onClose={() => setTrackingEditorStage(null)} onSave={(payload) => performTrackingAction('update', payload)} />}
    {trackingInfoStage && <ShipmentTrackingStageInfoModal stageId={trackingInfoStage} events={trackingEvents} onClose={() => setTrackingInfoStage(null)} />}
    {trackingRecipientsEditorOpen && <ShipmentTrackingRecipientsModal tracking={tracking} saving={trackingSaving} onClose={() => setTrackingRecipientsEditorOpen(false)} onSave={(payload) => performTrackingAction('update_recipients', payload)} />}
    {trackingManualMailOpen && <ShipmentTrackingManualMailModal orderId={transportOrderId} bundles={trackingManualMailBundles} defaultRecipient={tracking?.recipients?.carrier?.source === 'manual' ? tracking.recipients.carrier.email || '' : ''} saving={trackingSaving} onClose={() => { setTrackingManualMailOpen(false); setTrackingManualMailBundles([]) }} onSend={(payload) => void sendTrackingManualMail(payload)} />}
    {trackingMailtoOpen && <ShipmentTrackingMailtoModal orderId={transportOrderId} defaultRecipient={tracking?.recipients?.carrier?.source === 'manual' ? tracking.recipients.carrier.email || '' : ''} onClose={() => setTrackingMailtoOpen(false)} />}
  </div>
}
