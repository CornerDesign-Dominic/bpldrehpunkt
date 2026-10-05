import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { calculateTransportOrderRoute, getTransportOrder, getTransportOrderRoute } from '../lib/transportOrders.js'
import { isCarrierMasterDataIncomplete } from '../lib/importedPartnerStatus.js'
import { businessPartnerDetailPath } from '../lib/businessPartnerLinks.js'
import { transportOrderDocumentTitle } from '../lib/transportOrderPresentation.js'
import { ChevronDownIcon, CopyIcon } from '../components/icons.jsx'
import ShipmentTrackingTimeline from '../components/transport-orders/ShipmentTrackingTimeline.jsx'
import { getEffectiveBusinessPartner } from '../lib/businessPartners.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { usePermissions } from '../auth/usePermissions.js'
import { useAuth } from '../auth/useAuth.js'
import { getOwnTransportOrderRatings, saveTransportOrderRating } from '../lib/transportOrderRatings.js'
import TransportOrderRatingsModal from '../components/transport-orders/TransportOrderRatingsModal.jsx'
import { getShipmentTracking, getShipmentTrackingActivation, getShipmentTrackingDryRun, sendManualShipmentTrackingMail, shipmentTrackingDryRunErrorMessage, shipmentTrackingManualMailErrorMessage, updateManualShipmentTracking } from '../lib/shipmentTracking.js'
import { getShipmentTrackingAttention, getShipmentTrackingForecast, refreshShipmentTrackingForecast } from '../lib/shipmentTrackingForecast.js'
import { shipmentTrackingTimelineModel } from '../lib/shipmentTrackingPresentation.js'
import ShipmentTrackingEditorModal from '../components/transport-orders/ShipmentTrackingEditorModal.jsx'
import ShipmentTrackingStageInfoModal from '../components/transport-orders/ShipmentTrackingStageInfoModal.jsx'
import ShipmentTrackingManualMailModal from '../components/transport-orders/ShipmentTrackingManualMailModal.jsx'
import ShipmentTrackingHistory from '../components/transport-orders/ShipmentTrackingHistory.jsx'
import ShipmentTrackingForecastModal from '../components/transport-orders/ShipmentTrackingForecastModal.jsx'
import TransportOrderRoutePanel from '../components/transport-orders/TransportOrderRoutePanel.jsx'
import TransportOrderRouteCountrySelectionModal from '../components/transport-orders/TransportOrderRouteCountrySelectionModal.jsx'
import TransportOrderLinkedCasesCard from '../components/case-links/TransportOrderLinkedCasesCard.jsx'
import TransportOrderPalletMovementsCard from '../components/transport-orders/TransportOrderPalletMovementsCard.jsx'
import TransportOrderTodosCard from '../components/transport-orders/TransportOrderTodosCard.jsx'
import TransportOrderReceivedMails from '../components/transport-orders/TransportOrderReceivedMails.jsx'
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
function trackingCarrierRecipient(tracking) {
  const carrier = tracking?.recipients?.carrier
  return ['manual', 'transport-order-import'].includes(carrier?.source) && typeof carrier?.email === 'string' ? carrier.email.trim() : ''
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
  return <span className="transport-order-partner-link"><Link to={businessPartnerDetailPath(effectivePartner?.id || partner.partnerId)}>{name}</Link>{warning && <TranslatedProps sources={{"aria-label":"Unternehmer-Stammdaten unvollständig – Kreditorennummer fehlt.","title":"Unternehmer-Stammdaten unvollständig – Kreditorennummer fehlt."}}><span className="transport-order-partner-link__warning" role="img" aria-label="Unternehmer-Stammdaten unvollständig – Kreditorennummer fehlt." title="Unternehmer-Stammdaten unvollständig – Kreditorennummer fehlt.">!</span></TranslatedProps>}</span>
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
  const [trackingManualMailBundles, setTrackingManualMailBundles] = useState([])
  const [trackingManualMailTemplateId, setTrackingManualMailTemplateId] = useState('')
  const [trackingManualMailOpen, setTrackingManualMailOpen] = useState(false)
  const [trackingSaving, setTrackingSaving] = useState(false)
  const [trackingDryRun, setTrackingDryRun] = useState(null)
  const [trackingDryRunError, setTrackingDryRunError] = useState('')
  const [trackingDryRunLoading, setTrackingDryRunLoading] = useState(false)
  const [trackingActivation, setTrackingActivation] = useState({ orderId: '', value: null })
  const [trackingActivationError, setTrackingActivationError] = useState({ orderId: '', message: '' })
  const [trackingEarlyStartConfirmationOpen, setTrackingEarlyStartConfirmationOpen] = useState(false)
  const [trackingCompletionConfirmationOpen, setTrackingCompletionConfirmationOpen] = useState(false)
  const [trackingPauseConfirmationOpen, setTrackingPauseConfirmationOpen] = useState(false)
  const [trackingForecast, setTrackingForecast] = useState(null)
  const [trackingAttention, setTrackingAttention] = useState(null)
  const [trackingForecastOpen, setTrackingForecastOpen] = useState(false)
  const [trackingForecastLoading, setTrackingForecastLoading] = useState(false)
  const [trackingForecastError, setTrackingForecastError] = useState('')
  const [receivedMailVersion, setReceivedMailVersion] = useState(0)
  const handleReceivedMailsChanged = useCallback(() => setReceivedMailVersion((value) => value + 1), [])
  const [route, setRoute] = useState(null)
  const [routeError, setRouteError] = useState('')
  const [routeCalculating, setRouteCalculating] = useState(false)
  const [routeCountrySelection, setRouteCountrySelection] = useState([])
  const [ratings, setRatings] = useState({})
  const [ratingPartners, setRatingPartners] = useState({})
  const [ratingsError, setRatingsError] = useState('')
  const [ratingsLoading, setRatingsLoading] = useState(true)
  const [ratingsModalOpen, setRatingsModalOpen] = useState(false)
  const { setTitle } = usePageHeader()
  const { canEdit, canView } = usePermissions()
  const { user, profile } = useAuth()
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
    if (!tracking) return undefined
    let current = true
    Promise.all([getShipmentTrackingForecast(transportOrderId), getShipmentTrackingAttention(transportOrderId)]).then(([forecast, attention]) => {
      if (!current) return
      setTrackingForecast(forecast)
      setTrackingAttention(attention.attention || null)
      setTrackingForecastError('')
    }).catch(() => { if (current) setTrackingForecastError('Die Transportprognose konnte nicht geladen werden.') })
    return () => { current = false }
  }, [transportOrderId, trackingVersion, tracking, receivedMailVersion])
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
  useEffect(() => {
    if (!order?.id || tracking) return undefined
    let current = true
    getShipmentTrackingActivation(order.id).then((activation) => {
      if (current) { setTrackingActivation({ orderId: order.id, value: activation }); setTrackingActivationError({ orderId: order.id, message: '' }) }
    }).catch(() => {
      if (current) setTrackingActivationError({ orderId: order.id, message: 'Der automatische Startzeitpunkt konnte nicht berechnet werden.' })
    })
    return () => { current = false }
  }, [order?.id, tracking])
  async function refreshRoute() {
    const currentRoute = await getTransportOrderRoute(transportOrderId)
    setRoute(currentRoute)
  }
  async function refreshOrder() {
    const currentOrder = await getTransportOrder(transportOrderId)
    if (currentOrder) setOrder(currentOrder)
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
  }, [order?.id, user?.uid, canView])
  async function saveRatings(values) {
    const savedRatings = await Promise.all(values.map((value) => saveTransportOrderRating(value)))
    setRatings((current) => ({ ...current, ...Object.fromEntries(savedRatings.map((rating) => [rating.partnerRole, rating])) }))
    setRatingsModalOpen(false)
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
      await updateManualShipmentTracking({ orderId: transportOrderId, action, source: payload.source || 'manual', note: payload.note || '', values: payload.changes, transitEntries: payload.transitEntries, transitCorrections: payload.transitCorrections, transitRemovals: payload.transitRemovals, recipientChanges: payload.recipientChanges, earlyStart: payload.earlyStart === true })
      setTrackingEditorStage(null)
      await refreshTracking()
      return true
    } catch (caught) {
      setTrackingError(caught instanceof Error ? caught.message : 'Die Sendungsverfolgung konnte nicht gespeichert werden.')
      return false
    } finally { setTrackingSaving(false) }
  }
  async function refreshForecast() {
    setTrackingForecastLoading(true); setTrackingForecastError('')
    try { await refreshShipmentTrackingForecast(transportOrderId); const forecast = await getShipmentTrackingForecast(transportOrderId); setTrackingForecast(forecast) } catch (caught) { setTrackingForecastError(caught?.message || 'Die Transportprognose konnte nicht aktualisiert werden.') } finally { setTrackingForecastLoading(false) }
  }
  async function confirmTrackingCompletion() {
    await performTrackingAction('complete')
    setTrackingCompletionConfirmationOpen(false)
  }
  async function confirmTrackingEarlyStart() {
    await performTrackingAction(tracking ? 'start_early' : 'start', { earlyStart: !tracking, note: 'Sendungsverfolgung vorzeitig gestartet.' })
    setTrackingEarlyStartConfirmationOpen(false)
  }
  async function confirmTrackingPause() {
    await performTrackingAction('pause_automation')
    setTrackingPauseConfirmationOpen(false)
  }
  async function toggleTrackingAutomation() {
    if (tracking?.automationPaused === true) await performTrackingAction('resume_automation')
    else setTrackingPauseConfirmationOpen(true)
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
      await Promise.all([refreshRoute(), refreshOrder()])
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
    if (route) navigate(route, { state: { caseCreation: { caseType, prefill: transportOrderCasePrefill(order), returnTo: `/transportauftraege/${transportOrderId}` } } })
  }
  if (loading) return <div className="transport-order-detail-page"><p className="page-state"><StaticText source={"Transportauftrag wird geladen …"} /></p></div>
  if (error || !imported) return <div className="transport-order-detail-page"><section className="todo-detail-empty"><h2><StaticText source={"Transportauftrag nicht verfügbar"} /></h2><p>{error || <StaticText source={"Noch keine Daten verfügbar."} />}</p></section></div>
  return <div className="transport-order-detail-page">
    <TranslatedProps sources={{"title":"Sendungsverfolgung vorzeitig starten?"}}><ConfirmDialog open={trackingEarlyStartConfirmationOpen} title="Sendungsverfolgung vorzeitig starten?" message="Die Sendungsverfolgung wird sofort zur manuellen Bearbeitung geöffnet. Es wird keine E-Mail versendet; alle Automatik-Regeln bleiben unverändert." confirmLabel="Vorzeitig starten" submittingLabel="Wird gestartet …" isSubmitting={trackingSaving} onCancel={() => setTrackingEarlyStartConfirmationOpen(false)} onConfirm={() => void confirmTrackingEarlyStart()} /></TranslatedProps>
    <TranslatedProps sources={{"title":"Unwiderruflich abschließen?","confirmLabel":"Abschließen"}}><ConfirmDialog open={trackingCompletionConfirmationOpen} title="Unwiderruflich abschließen?" message="Die Sendungsverfolgung wird beendet und der Auftrag als abgeschlossen abgelegt." confirmLabel="Abschließen" submittingLabel="Wird abgeschlossen …" isSubmitting={trackingSaving} onCancel={() => setTrackingCompletionConfirmationOpen(false)} onConfirm={() => void confirmTrackingCompletion()} /></TranslatedProps>
    <TranslatedProps sources={{"title":"Sendungsverfolgung pausieren?"}}><ConfirmDialog open={trackingPauseConfirmationOpen} title="Sendungsverfolgung pausieren?" message="Bereits bestehende Aktionen behalten ihren Status. Erst Anfragen, die während der Pause fällig werden, werden übersprungen und nicht nachgesendet. Nach dem Fortsetzen laufen nur spätere Termine wieder automatisch; Statusanfragen kannst du jederzeit manuell auslösen." confirmLabel="Pausieren" submittingLabel="Wird pausiert …" isSubmitting={trackingSaving} onCancel={() => setTrackingPauseConfirmationOpen(false)} onConfirm={() => void confirmTrackingPause()} /></TranslatedProps>
    {routeCountrySelection.length > 0 && <TransportOrderRouteCountrySelectionModal problems={routeCountrySelection} calculating={routeCalculating} onCancel={() => setRouteCountrySelection([])} onConfirm={(countryOverrides) => void calculateRoute(countryOverrides)} />}
    {ratingsModalOpen && <TransportOrderRatingsModal order={order} ratings={ratings} partners={ratingPartners} canEdit={canEdit('transportOrders')} onClose={() => setRatingsModalOpen(false)} onSave={saveRatings} />}
    <div className="transport-order-detail-layout">
      <TranslatedProps sources={{"aria-label":"Verknüpfungen"}}><aside className="transport-order-detail-actions" aria-label="Verknüpfungen">
        <TransportOrderRoutePanel route={route} canEdit={canEdit('transportOrders')} calculating={routeCalculating} error={routeError} needsRecalculation={order?.routeNeedsRecalculation === true} onCalculate={() => void calculateRoute()} />
        <TransportOrderLinkedCasesCard transportOrderId={transportOrderId} canEditCase={canEdit} canViewCase={canView} onCreate={createCase} />
        {canView('pallets') && <TransportOrderPalletMovementsCard transportOrder={order} canEdit={canEdit('pallets')} />}
        {(canView('todos') || canEdit('todos')) && <TransportOrderTodosCard canCreate={canEdit('todos')} canView={canView('todos')} canViewMasterData={canView('masterData')} order={order} profile={profile} user={user} />}
        <section className="transport-order-detail-section"><h3><StaticText source={"Sendungsverfolgung"} /></h3><div className="transport-order-detail-actions__buttons"><button type="button" className={tracking?.automationPaused === true ? 'button' : 'button button--secondary'} disabled={!tracking || tracking?.lifecycleStatus === 'completed' || trackingSaving || !canEdit('transportOrders')} title={!tracking ? 'Die Sendungsverfolgung wurde noch nicht gestartet.' : tracking?.lifecycleStatus === 'completed' ? 'Die Sendungsverfolgung ist bereits abgeschlossen.' : undefined} onClick={() => void toggleTrackingAutomation()}>{<StaticText source={tracking?.automationPaused === true ? 'Fortführen' : 'Pausieren'} />}</button><button type="button" className="button button--secondary" disabled={!tracking || tracking?.lifecycleStatus === 'completed' || trackingSaving || !canEdit('transportOrders')} onClick={() => setTrackingCompletionConfirmationOpen(true)}><StaticText source={"Abschließen"} /></button></div></section>
      </aside></TranslatedProps>
      <main className="transport-order-detail-main">
        <section className="transport-order-detail-section transport-order-detail-section--transport-wide transport-order-detail-section--general"><div className="transport-order-detail-general-row transport-order-detail-general-row--order"><h4><StaticText source={"Auftrag & Preise"} /></h4><dl className="transport-order-detail-list"><TranslatedProps sources={{"label":"TA-Nummer"}}><CopyDetail label="TA-Nummer" value={order.externalNumber} /></TranslatedProps><Detail label="Mitarbeiterrelation">{imported.relation}</Detail><CopyDetail label="Kundenreferenz" value={imported.customerReference} /><Detail label="Ertrag netto">{formatCurrency(imported.financial?.revenueNet)}</Detail><Detail label="Kosten netto">{formatCurrency(imported.financial?.costNet)}</Detail></dl></div><div className="transport-order-detail-general-row transport-order-detail-general-row--vehicle-cargo"><h4><StaticText source={"Fahrzeug & Ware"} /></h4><dl className="transport-order-detail-list"><Detail label="Fahrzeugart">{imported.shipment?.vehicleType}</Detail><TranslatedProps sources={{"label":"Kennzeichen"}}><CopyDetail label="Kennzeichen" value={imported.shipment?.licensePlate} /></TranslatedProps><Detail label="Kolli">{formatNumber(imported.shipment?.packages)}</Detail><Detail label="Gewicht">{<StaticText source={formatNumber(imported.shipment?.weightKg, ' kg')} />}</Detail><Detail label="Lademeter">{formatNumber(imported.shipment?.loadingMeters)}</Detail></dl></div></section>
        <section className="transport-order-detail-section"><h3><StaticText source={"Kunde"} /></h3><dl className="transport-order-detail-list"><Detail label="Frachtzahler"><PartnerLink partner={imported.customer} effectivePartner={customerMasterData} /></Detail><Detail label="Debitorennummer">{imported.customer?.debtorNumber}</Detail><TranslatedProps sources={{"label":"Adresse"}}><Detail label="Adresse" emptyFallback="">{formatPartnerAddress(customerMasterData)}</Detail></TranslatedProps></dl></section>
        <section className="transport-order-detail-section"><h3><StaticText source={"Unternehmer"} /></h3><dl className="transport-order-detail-list"><TranslatedProps sources={{"label":"Unternehmer"}}><Detail label="Unternehmer"><PartnerLink partner={imported.carrier} effectivePartner={carrierMasterData} warning={isCarrierMasterDataIncomplete(imported.carrier)} /></Detail></TranslatedProps><Detail label="Kreditorennummer">{carrierMasterData?.creditorNumber || imported.carrier?.creditorNumber}</Detail><TranslatedProps sources={{"label":"Adresse"}}><Detail label="Adresse" emptyFallback="">{formatPartnerAddress(carrierMasterData)}</Detail></TranslatedProps><Detail label="TA versendet an">{imported.dispatch?.sentTo}</Detail></dl></section>
        <section className="transport-order-detail-section transport-order-detail-section--after-partners"><h3><StaticText source={"Erste Ladestelle"} /></h3><dl className="transport-order-detail-list"><TranslatedProps sources={{"label":"Adresse"}}><CopyDetail label="Adresse" value={imported.loading?.originalText} /></TranslatedProps><TranslatedProps sources={{"label":"Ort"}}><CopyDetail label="Ort" value={imported.loading?.city} /></TranslatedProps><TranslatedProps sources={{"label":"Von"}}><Detail label="Von">{formatStationDateTime(imported.loading?.window?.from)}</Detail></TranslatedProps><TranslatedProps sources={{"label":"Bis"}}><Detail label="Bis">{formatStationDateTime(imported.loading?.window?.until)}</Detail></TranslatedProps></dl></section>
        <section className="transport-order-detail-section transport-order-detail-section--after-partners"><h3><StaticText source={"Ladehinweise"} /></h3><dl className="transport-order-detail-list"><TranslatedProps sources={{"label":"Bemerkung"}}><Detail label="Bemerkung">{imported.loading?.note}</Detail></TranslatedProps><TranslatedProps sources={{"label":"Referenz"}}><CopyDetail label="Referenz" value={imported.loading?.reference} /></TranslatedProps></dl></section>
        <section className="transport-order-detail-section"><h3><StaticText source={"Letzte Entladestelle"} /></h3><dl className="transport-order-detail-list"><TranslatedProps sources={{"label":"Adresse"}}><CopyDetail label="Adresse" value={imported.unloading?.originalText} /></TranslatedProps><TranslatedProps sources={{"label":"Ort"}}><CopyDetail label="Ort" value={imported.unloading?.city} /></TranslatedProps><TranslatedProps sources={{"label":"Von"}}><Detail label="Von">{formatStationDateTime(imported.unloading?.window?.from)}</Detail></TranslatedProps><TranslatedProps sources={{"label":"Bis"}}><Detail label="Bis">{formatStationDateTime(imported.unloading?.window?.until)}</Detail></TranslatedProps></dl></section>
        <section className="transport-order-detail-section"><h3><StaticText source={"Entladehinweise"} /></h3><dl className="transport-order-detail-list"><TranslatedProps sources={{"label":"Bemerkung"}}><Detail label="Bemerkung">{imported.unloading?.note}</Detail></TranslatedProps><TranslatedProps sources={{"label":"Referenz"}}><CopyDetail label="Referenz" value={imported.unloading?.reference} /></TranslatedProps></dl></section>
        <ShipmentTrackingTimeline model={shipmentTrackingTimelineModel(tracking, imported, route, customerMasterData?.shipmentTrackingPolicy, trackingEvents, ratings, ratingPartners)} tracking={tracking} events={trackingEvents} dryRunPreview={tracking?.lifecycleStatus === 'active' ? trackingDryRun : null} dryRunLoading={tracking?.lifecycleStatus === 'active' && trackingDryRunLoading} dryRunError={tracking?.lifecycleStatus === 'active' ? trackingDryRunError : ''} activation={trackingActivation.orderId === order.id ? trackingActivation.value : null} activationLoading={!tracking && Boolean(order.id) && trackingActivation.orderId !== order.id && trackingActivationError.orderId !== order.id} activationError={trackingActivationError.orderId === order.id ? trackingActivationError.message : ''} canEdit={canEdit('transportOrders')} saving={trackingSaving} ratingsLoading={ratingsLoading} ratingsError={ratingsError} attention={trackingAttention} forecast={trackingForecast?.forecast} onOpenForecast={() => setTrackingForecastOpen(true)} onOpenRatings={() => setRatingsModalOpen(true)} onEarlyStart={() => setTrackingEarlyStartConfirmationOpen(true)} onEditStage={setTrackingEditorStage} onSaveRecipient={(email) => void performTrackingAction('update_recipients', { recipientChanges: { carrier: email } })} onShowStageInfo={setTrackingInfoStage} onManualDispatch={({ templateId, bundles }) => { setTrackingManualMailTemplateId(templateId); setTrackingManualMailBundles(bundles); setTrackingManualMailOpen(true) }} />
        {trackingError && <p className="form-error transport-order-detail-tracking-error">{trackingError}</p>}
        <ShipmentTrackingHistory events={trackingEvents} loading={trackingLoading} error={trackingError} />
      </main>
      <TranslatedProps sources={{"aria-label":"System und Kontext"}}><aside className="transport-order-detail-system" aria-label="System und Kontext">
        <details open className="transport-order-detail-section transport-order-detail-section--contacts"><summary><StaticText source={"Kontakte"} /><ChevronDownIcon /></summary><div className="transport-order-detail-section__content"><div className="transport-order-detail-contact-group"><h4><StaticText source={"Kunde"} /></h4><dl className="transport-order-detail-list transport-order-detail-list--single"><CopyDetail label="Standard" value={imported.contacts?.customerStandardEmail} /><CopyDetail label="Info-1" value={imported.contacts?.customerForOrder} /></dl></div><div className="transport-order-detail-contact-group"><h4><StaticText source={"Unternehmer"} /></h4><dl className="transport-order-detail-list transport-order-detail-list--single"><CopyDetail label="Standard" value={imported.contacts?.carrierStandardEmail} /><CopyDetail label="Im Auftrag" value={imported.contacts?.carrierForOrder} /></dl></div></div></details>
        <TransportOrderReceivedMails key={transportOrderId} transportOrderId={transportOrderId} canEdit={canEdit('transportOrders')} onMailsChanged={handleReceivedMailsChanged} />
        <details className="transport-order-detail-section transport-order-detail-section--import-info"><summary><StaticText source={"Importinfos"} /></summary><dl className="transport-order-detail-list transport-order-detail-list--single"><Detail label="Importiert am">{formatTimestamp(order.importMeta?.importedAt)}</Detail><TranslatedProps sources={{"label":"Zuletzt aktualisiert"}}><Detail label="Zuletzt aktualisiert">{formatTimestamp(order.updatedAt || order.importMeta?.lastImportedAt)}</Detail></TranslatedProps><TranslatedProps sources={{"label":"Importdatei"}}><Detail label="Importdatei">{order.importMeta?.fileName}</Detail></TranslatedProps><Detail label="Importlauf">{order.importMeta?.importRunId}</Detail></dl></details>
      </aside></TranslatedProps>
    </div>
    {trackingEditorStage && <ShipmentTrackingEditorModal tracking={tracking} events={trackingEvents} stageId={trackingEditorStage} saving={trackingSaving} onClose={() => setTrackingEditorStage(null)} onSave={(payload) => performTrackingAction(trackingEditorStage === 'in_transit' ? 'save_transit_entries' : 'update', payload)} />}
    {trackingInfoStage && <ShipmentTrackingStageInfoModal stageId={trackingInfoStage} events={trackingEvents} onClose={() => setTrackingInfoStage(null)} />}
    {trackingManualMailOpen && <ShipmentTrackingManualMailModal orderId={transportOrderId} bundles={trackingManualMailBundles} initialTemplateId={trackingManualMailTemplateId} defaultRecipient={trackingCarrierRecipient(tracking)} saving={trackingSaving} onClose={() => { setTrackingManualMailOpen(false); setTrackingManualMailBundles([]); setTrackingManualMailTemplateId('') }} onSend={(payload) => void sendTrackingManualMail(payload)} />}
    {trackingForecastOpen && <ShipmentTrackingForecastModal data={trackingForecast} loading={!trackingForecast} error={trackingForecastError} refreshing={trackingForecastLoading} onRefresh={trackingForecast?.forecast?.kind === 'arrival' ? undefined : () => void refreshForecast()} onRequestForecastUpdate={(templateId) => { setTrackingManualMailTemplateId(templateId); setTrackingManualMailBundles([]); setTrackingManualMailOpen(true) }} requestDisabled={!canEdit('transportOrders') || !trackingCarrierRecipient(tracking)} onClose={() => setTrackingForecastOpen(false)} />}
  </div>
}
