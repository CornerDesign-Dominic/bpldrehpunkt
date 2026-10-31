import { orderRecordPath } from '../lib/orderRecordTabs.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { StaticText } from '../i18n/AutoTranslate.jsx'
import { useLanguage } from '../i18n/useLanguage.js'
import { usePermissions } from '../auth/usePermissions.js'
import { useAuth } from '../auth/useAuth.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { getTransportOrder } from '../lib/transportOrders.js'
import { getEffectiveBusinessPartner } from '../lib/businessPartners.js'
import { businessPartnerDetailPath } from '../lib/businessPartnerLinks.js'
import { getTransportOrderWorkspaceHistory, refreshTransportOrderWorkspace } from '../lib/transportOrderWorkspace.js'
import { latestTransportOrderRefresh, mergeTransportOrderRefreshes, transportOrderResult, transportOrderWorkspaceScope, transportOrderWorkspaceStops, transportOrderWorkspaceTabs } from '../lib/transportOrderWorkspacePresentation.js'
import { useOrderTrackingHistory } from '../lib/useOrderTrackingHistory.js'
import { recordHistoryTime } from '../lib/recordHistoryPresentation.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { createReturnState } from '../lib/recordNavigation.js'
import { transportOrderCasePrefill } from '../../shared/caseTransportLinks.js'
import ContextLink from '../components/ui/ContextLink.jsx'
import TransportInvoiceChecks from '../components/transport-orders/TransportInvoiceChecks.jsx'
import TransportOrderImportedDetails from '../components/transport-orders/TransportOrderImportedDetails.jsx'
import OrderRecordHistoryTables from '../components/transport-orders/OrderRecordHistoryTables.jsx'
import TransportOrderLinkedCasesCard from '../components/case-links/TransportOrderLinkedCasesCard.jsx'
import TransportOrderPalletMovementsCard from '../components/transport-orders/TransportOrderPalletMovementsCard.jsx'
import TransportOrderTodosCard from '../components/transport-orders/TransportOrderTodosCard.jsx'

function Card({ title, onDetails, children }) {
  return <section className="order-workspace__card"><div className="order-workspace__card-header"><h3><StaticText source={title} /></h3>{onDetails && <button className="order-workspace__text-button" type="button" onClick={onDetails}><StaticText source="Details" /> →</button>}</div>{children}</section>
}
function Values({ entries }) {
  return <dl>{entries.map(([label, value]) => <div key={label}><dt><StaticText source={label} /></dt><dd>{value === null || value === undefined || value === '' ? '—' : value}</dd></div>)}</dl>
}
function addressText(address = {}) {
  return [address.company, [address.street, address.houseNumber].filter(Boolean).join(' '), [address.postalCode, address.city].filter(Boolean).join(' '), address.country].filter(Boolean).join(', ')
}
function PartnerCard({ type, imported, partner, canOpen, onDetails, full = false }) {
  const customer = type === 'customer'
  const source = imported[type] || {}
  const name = partner?.companyName || source.partnerName || source.name || source.originalName || '—'
  const number = customer ? partner?.debtorNumber || source.debtorNumber : partner?.creditorNumber || source.creditorNumber
  const contact = customer ? imported.contacts?.customerForOrder : imported.dispatch?.sentTo
  return <Card title={customer ? 'Kunde' : 'Unternehmer'} onDetails={onDetails}>
    <p className="order-workspace__partner">{canOpen && source.partnerId ? <ContextLink to={businessPartnerDetailPath(partner?.id || source.partnerId)}>{name}</ContextLink> : name}</p>
    <p className="order-workspace__muted"><StaticText source={customer ? 'Debitorennummer' : 'Kreditorennummer'} />: {number || '—'}</p>
    <p>{addressText(partner?.address || source.snapshot) || '—'}</p>
    <div className="order-workspace__contact"><Values entries={[[customer ? 'Kontakt im Auftrag' : 'TA zuletzt versendet an', contact]]} /></div>
    {full && <><div className="order-workspace__contact"><Values entries={[["Telefon", partner?.contact?.phone], ['E-Mail (Stammdaten)', partner?.contact?.email], ['USt-IdNr.', partner?.companyData?.vatId]]} /></div>{!customer && imported.contacts?.carrierForOrder && <p>{imported.contacts.carrierForOrder}</p>}</>}
  </Card>
}
function StationCards({ imported, detailed, date, number }) {
  const stops = transportOrderWorkspaceStops(imported)
  return stops.length ? stops.map((stop, index) => <article className="order-workspace__stop" key={`${stop.sourceId || index}-${index}`}>
    <h4>{detailed ? stop.sequence ?? index + 1 : index + 1} · <StaticText source={stop.type === 'loading' ? 'Ladestelle' : stop.type === 'unloading' ? 'Entladestelle' : 'Unbekannte Station'} /></h4>
    <p>{stop.legacy ? stop.originalText || stop.city : addressText(stop.address) || '—'}</p>
    <p>{date(stop.window?.from)} – {date(stop.window?.until)}</p>
    {stop.deliveryInformation && <p className="order-workspace__muted"><StaticText source="Referenz" />: {stop.deliveryInformation}</p>}
    {detailed && <>
      <p><StaticText source="Bemerkung" />: {stop.note || '—'}</p>
      <p><StaticText source="Lieferscheinnummer" />: {stop.deliveryNoteNumber || '—'}</p>
      {stop.slotUntilTime && !stop.window?.until && <p className="order-workspace__muted"><StaticText source="Bis-Uhrzeit aus Quelle (Datum ungeklärt)" />: {stop.slotUntilTime}</p>}
      <div className="order-workspace__stop-cargo"><Values entries={[
        ['Kolli', number(stop.cargo?.packages)], ['Gewicht', number(stop.cargo?.weightKg, ' kg')],
        ['Lademeter', number(stop.cargo?.loadingMeters, ' m')],
        ['Palettentausch', typeof stop.palletExchange === 'boolean' ? <StaticText source={stop.palletExchange ? 'Ja' : 'Nein'} /> : '—'],
      ]} /></div>
    </>}
  </article>) : <p className="order-workspace__muted"><StaticText source="Keine Stationen übermittelt." /></p>
}
function ResultCard({ financial, currency, onDetails }) {
  const result = transportOrderResult(financial)
  return <Card title="Auftragsergebnis" onDetails={onDetails}><div className="order-workspace__money"><span><StaticText source="Ertrag netto" /></span><span>{currency(financial?.revenueNet)}</span></div><div className="order-workspace__money"><span><StaticText source="Kosten netto" /></span><span>{currency(financial?.costNet)}</span></div><div className={`order-workspace__money order-workspace__money--result${result < 0 ? ' order-workspace__money--negative' : ''}`}><span><StaticText source="Gewinn / Verlust" /></span><span>{currency(result)}</span></div></Card>
}

function Workspace({ orderId, active, showTabs, tabOverride }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const locale = language === 'en' ? 'en-GB' : 'de-DE'
  const { canView, canEdit } = usePermissions()
  const { user, profile } = useAuth()
  const { setTitle } = usePageHeader()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = tabOverride || searchParams.get('tab') || 'overview'
  const tab = transportOrderWorkspaceTabs.includes(selected) ? selected : 'overview'
  const scope = transportOrderWorkspaceScope(tab)
  const [order, setOrder] = useState(null)
  const [partners, setPartners] = useState({ customer: null, carrier: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [partnerError, setPartnerError] = useState(false)
  const [history, setHistory] = useState({ changes: [], refreshes: [] })
  const [historyError, setHistoryError] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [localAttempts, setLocalAttempts] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [reloadError, setReloadError] = useState(false)
  const trackingHistory = useOrderTrackingHistory(orderId, active && tab === 'history')
  const alive = useRef(true)
  const inFlight = useRef(false)
  const requestIds = useRef({})
  const canReadPartners = canView('masterData') || canView('crm') || canView('pallets')
  const canRefresh = scope === 'partners' ? canEdit('masterData') : scope === 'all' ? canEdit('dataImports') && canEdit('masterData') : canEdit('dataImports')
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const loadOrder = useCallback(async () => {
    let entry
    try { entry = await getTransportOrder(orderId) } catch (caught) {
      void reportTechnicalFailure({ module: 'transport-orders', stage: 'load', error: caught, orderId })
      throw caught
    }
    if (alive.current) { setOrder(entry); setError(entry ? '' : 'Transportauftrag nicht gefunden.') }
    return entry
  }, [orderId, setError])
  async function moreHistory() {
    if (historyLoading) return
    setHistoryLoading(true)
    try {
      const result = await getTransportOrderWorkspaceHistory(orderId, { changesCursor: history.changesCursor, refreshCursor: history.refreshCursor })
      if (alive.current) setHistory((previous) => ({ ...result, changes: [...previous.changes, ...result.changes].filter((entry, index, entries) => entries.findIndex((item) => item.id === entry.id) === index), refreshes: [...previous.refreshes, ...result.refreshes].filter((entry, index, entries) => entries.findIndex((item) => item.id === entry.id) === index) }))
      if (alive.current) setHistoryError(false)
    } catch { if (alive.current) setHistoryError(true) }
    finally { if (alive.current) setHistoryLoading(false) }
  }
  const loadHistory = useCallback(async () => {
    if (alive.current) setHistoryLoading(true)
    try {
      const result = await getTransportOrderWorkspaceHistory(orderId)
      if (alive.current) {
        setHistory(result); setHistoryError(false)
        const recorded = new Set(result.refreshes.map((entry) => entry.id))
        setLocalAttempts((entries) => entries.filter((entry) => !recorded.has(entry.id)))
      }
    } catch { if (alive.current) setHistoryError(true) }
    finally { if (alive.current) setHistoryLoading(false) }
  }, [orderId])
  useEffect(() => {
    if (!active) return undefined
    let current = true
    loadOrder().catch(() => { if (current) setError('Der Transportauftrag konnte nicht geladen werden.') }).finally(() => { if (current) setLoading(false) })
    void Promise.resolve().then(loadHistory)
    return () => { current = false }
  }, [loadOrder, loadHistory, active])
  useEffect(() => {
    let current = true
    if (!order || !canReadPartners) return undefined
    Promise.all(['customer', 'carrier'].map(async (kind) => {
      const id = order.imported?.[kind]?.partnerId
      return id ? getEffectiveBusinessPartner(id) : null
    })).then(([customer, carrier]) => { if (current) { setPartners({ customer, carrier }); setPartnerError(false) } }).catch((caught) => { void reportTechnicalFailure({ module: 'transport-orders', stage: 'load', error: caught, orderId }); if (current) setPartnerError(true) })
    return () => { current = false }
  }, [order, canReadPartners, orderId])
  useEffect(() => {
    if (!active) return undefined
    const title = order?.externalNumber ? `${language === 'en' ? 'Order' : 'Auftrag'} · TA ${order.externalNumber}` : ''
    setTitle(title)
    document.title = title ? `Drehpunkt · ${title}` : 'Drehpunkt'
    return () => { setTitle(''); document.title = 'Drehpunkt' }
  }, [order?.externalNumber, language, setTitle, active])
  function selectTab(value) {
    const next = new URLSearchParams(searchParams)
    if (value === 'overview') next.delete('tab'); else next.set('tab', value)
    setSearchParams(next, { replace: true, state: location.state })
  }
  async function refresh() {
    if (!scope || !canRefresh || inFlight.current) return
    inFlight.current = true; setRefreshing(true); setReloadError(false)
    const requestId = requestIds.current[scope] ||= crypto.randomUUID()
    try {
      const outcome = await refreshTransportOrderWorkspace({ orderId, scope, requestId })
      if (!['success', 'partial', 'failed'].includes(outcome?.status)) throw new Error('Invalid refresh response')
      delete requestIds.current[scope]
      if (!alive.current) return
      // Preserve the confirmed result even if reloading history fails afterwards.
      // This is local presentation state; the callable already stored its receipt.
      setLocalAttempts((entries) => [...entries.filter((entry) => entry.requestId !== requestId && entry.id !== outcome.recordId), {
        id: outcome.recordId, requestId, scope, status: outcome.status,
        completedAt: outcome.completedAt, result: outcome,
        actorId: user?.uid, actorName: [profile?.firstName, profile?.lastName].filter(Boolean).join(' '),
      }])
      try { await loadOrder() } catch { if (alive.current) setReloadError(true) }
      await loadHistory()
      if (alive.current && outcome.recordId) setSearchParams((current) => { const next = new URLSearchParams(current); next.set('refresh', outcome.recordId); return next }, { replace: true, state: location.state })
    } catch {
      if (alive.current) setLocalAttempts((entries) => [...entries.filter((entry) => entry.requestId !== requestId), { id: `local-${requestId}`, requestId, scope, status: 'unconfirmed', completedAt: new Date().toISOString(), actorName: [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') }])
    } finally { inFlight.current = false; if (alive.current) setRefreshing(false) }
  }
  function createCase(caseType) {
    const route = { damage: '/schaeden', inkasso: '/inkasso', legalDispute: '/legal-disputes', insolvency: '/insolvenzen' }[caseType]
    if (route) navigate(route, { state: { caseCreation: { caseType, prefill: transportOrderCasePrefill(order), ...createReturnState(location) } } })
  }
  const date = (value) => { const time = recordHistoryTime(value); return time ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(time)) : '—' }
  const number = (value, suffix = '') => Number.isFinite(value) ? new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value) + suffix : '—'
  const currency = (value) => Number.isFinite(value) ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value) : '—'
  const refreshes = mergeTransportOrderRefreshes(history.refreshes, localAttempts)
  const latest = latestTransportOrderRefresh(refreshes, scope || 'all')
  const lastSuccess = latestTransportOrderRefresh(refreshes.filter((entry) => entry.status === 'success'), scope || 'all')
  const statusLabels = { success: w('Aktualisiert', 'Updated'), partial: w('Teilweise aktualisiert', 'Partially updated'), failed: w('Aktualisierung fehlgeschlagen', 'Update failed'), unconfirmed: w('Aktualisierung nicht bestätigt', 'Update not confirmed'), running: w('Aktualisierung läuft', 'Update in progress') }
  const tabLabels = { overview: w('Übersicht', 'Overview'), transport: w('Transport & Ware', 'Transport & cargo'), partners: w('Geschäftspartner', 'Business partners'), finance: w('Finanzen', 'Finances'), history: w('Historie', 'History') }
  if (loading) return <p className="page-state"><StaticText source="Transportauftrag wird geladen …" /></p>
  if (error || !order?.imported) return <section className="todo-detail-empty"><h2><StaticText source="Transportauftrag nicht verfügbar" /></h2><p><StaticText source={error || 'Noch keine Daten verfügbar.'} /></p><button className="button button--secondary" type="button" onClick={() => { setLoading(true); void loadOrder().catch(() => setError('Der Transportauftrag konnte nicht geladen werden.')).finally(() => setLoading(false)) }}><StaticText source="Erneut versuchen" /></button></section>
  const imported = order.imported
  const shipment = imported.shipment || {}
  const cargoEntries = [['Fahrzeugart', shipment.vehicleType], ['Kennzeichen', shipment.licensePlate], ['Kolli', number(shipment.packages)], ['Gewicht', number(shipment.weightKg, ' kg')], ['Lademeter', number(shipment.loadingMeters, ' m')]]
  return <div className="order-workspace">
    {showTabs && <div className="order-workspace__tabs" role="tablist" aria-label={w('Auftragsbereiche', 'Order sections')}>{transportOrderWorkspaceTabs.map((value) => <button key={value} type="button" role="tab" id={`order-tab-${value}`} aria-controls={`order-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => selectTab(value)} onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? transportOrderWorkspaceTabs.length - 1 : (transportOrderWorkspaceTabs.indexOf(value) + (event.key === 'ArrowRight' ? 1 : -1) + transportOrderWorkspaceTabs.length) % transportOrderWorkspaceTabs.length
      const next = transportOrderWorkspaceTabs[index]; selectTab(next); document.getElementById(`order-tab-${next}`)?.focus()
    }}>{tabLabels[value]}</button>)}</div>}
    {tab !== 'history' && <div className="order-workspace__toolbar"><div className="order-workspace__update" aria-live="polite"><StaticText source="Letzte Aktualisierung" />: {date(lastSuccess?.completedAt || (scope === 'order' ? order.importMeta?.lastImportedAt : null))}{latest && latest.status !== 'success' && <> · {statusLabels[latest.status] || w('Aktualisierung prüfen', 'Check update')}</>} · <button type="button" className="order-workspace__text-button" onClick={() => selectTab('history')}><StaticText source="Siehe Historie" /></button></div>{scope && canRefresh && <button className="button" type="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? w('Wird aktualisiert …', 'Updating …') : scope === 'all' ? w('Auftrag aktualisieren', 'Update order') : scope === 'partners' ? w('Stammdaten aktualisieren', 'Update master data') : w('Auftragsdaten aktualisieren', 'Update order data')}</button>}</div>}
    {reloadError && <p className="form-error"><StaticText source="Die Daten wurden gespeichert, aber die Ansicht konnte nicht aktualisiert werden. Bitte lade die Seite neu." /></p>}
    {tab !== 'history' && partnerError && <p className="form-error"><StaticText source="Die Geschäftspartnerdaten konnten nicht geladen werden." /></p>}
    <div className={`order-workspace__layout${tab === 'history' ? ' order-workspace__layout--history' : tab === 'transport' ? ' order-workspace__layout--transport' : ''}`}><main className="order-workspace__content"><section role="tabpanel" id={`order-panel-${tab}`} aria-labelledby={`order-tab-${tab}`}>
      {tab === 'overview' && <div className="order-workspace__overview"><div className="order-workspace__stack"><Card title="Stationen" onDetails={() => selectTab('transport')}><StationCards imported={imported} date={date} /></Card><Card title="Ware & Fahrzeug" onDetails={() => selectTab('transport')}><Values entries={cargoEntries} /></Card></div><div className="order-workspace__stack"><ResultCard financial={imported.financial} currency={currency} onDetails={() => selectTab('finance')} /><PartnerCard type="customer" imported={imported} partner={partners.customer} canOpen={canView('masterData')} onDetails={() => selectTab('partners')} /><PartnerCard type="carrier" imported={imported} partner={partners.carrier} canOpen={canView('masterData')} onDetails={() => selectTab('partners')} /></div></div>}
      {tab === 'transport' && <div className="order-workspace__transport">
        <Card title="Alle Stationen"><StationCards imported={imported} detailed date={date} number={number} /><p className="order-workspace__muted"><StaticText source="Palettentausch ist eine Quellenangabe und erzeugt keine Palettenbuchung." /></p></Card>
        <div className="order-workspace__stack">
          <Card title="Transport & Fahrzeug"><Values entries={[
            ['Fahrzeugart', shipment.vehicleType], ['Kennzeichen', shipment.licensePlate], ['Tour-ID (DyCoS)', imported.source?.tourId],
          ]} /></Card>
          <Card title="Ware & Auftragsmengen"><Values entries={[
            ['Warenart', w('Nicht übermittelt', 'Not provided')], ['Maße (L × B × H)', w('Nicht übermittelt', 'Not provided')],
            ['Kolli', number(shipment.packages)], ['Gewicht', number(shipment.weightKg, ' kg')], ['Lademeter', number(shipment.loadingMeters, ' m')],
          ]} /><p className="order-workspace__cargo-note order-workspace__muted"><StaticText source="Stationsmengen werden nicht addiert." /></p></Card>
          <Card title="Dispositionsbemerkung"><p>{imported.dispositionNote || '—'}</p></Card>
        </div>
      </div>}
      {tab === 'partners' && <div className="order-workspace__stack"><PartnerCard type="customer" imported={imported} partner={partners.customer} canOpen={canView('masterData')} full /><PartnerCard type="carrier" imported={imported} partner={partners.carrier} canOpen={canView('masterData')} full /><Card title="Auftragsbezogene Angaben"><Values entries={[["Kundenreferenz", imported.customerReference], ['Dispositionsbemerkung', imported.dispositionNote], ['TA zuletzt versendet am', date(imported.dispatch?.sentAt)]]} /></Card></div>}
      {tab === 'finance' && <div className="order-workspace__finance"><TransportInvoiceChecks orderId={orderId} number={order.externalNumber} /><ResultCard financial={imported.financial} currency={currency} /><TransportOrderImportedDetails imported={{ financial: imported.financial }} />{!imported.financial?.documents && <Card title="Rechnungen und Gutschriften"><p><StaticText source="Noch keine Belegdaten übermittelt. Bitte den Auftrag aktualisieren." /></p></Card>}</div>}
      {tab === 'history' && <OrderRecordHistoryTables order={order} history={history} refreshes={refreshes} historyError={historyError} historyLoading={historyLoading} onRetry={() => void loadHistory()} onMore={() => void moreHistory()} tracking={trackingHistory} onTrackingRetry={trackingHistory.retry} onTrackingMore={trackingHistory.more} focusedRefreshId={searchParams.get('refresh')} />}
    </section></main>{tab !== 'history' && tab !== 'transport' && <aside className="order-workspace__links" aria-label={w('Verknüpfungen zum Auftrag', 'Linked records')}><Card title="Sendungsverfolgung"><p className="order-workspace__muted">TA {order.externalNumber}</p><ContextLink className="button button--secondary" to={orderRecordPath(orderId, 'tracking')} onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); selectTab('tracking') } }}><StaticText source="Sendungsverfolgung öffnen" /> ↗</ContextLink></Card><TransportOrderLinkedCasesCard key={order.id} transportOrderId={orderId} canEditCase={canEdit} canViewCase={canView} onCreate={createCase} />{canView('pallets') && <TransportOrderPalletMovementsCard key={`pallets-${order.id}`} transportOrder={order} canEdit={canEdit('pallets')} />}{canView('todos') && <TransportOrderTodosCard key={`todos-${order.id}`} canCreate={canEdit('todos')} canView canViewMasterData={canView('masterData')} order={order} profile={profile} user={user} />}</aside>}</div>
  </div>
}
export default function TransportOrderDetailPage({ active = true, showTabs = true, tabOverride }) {
  const { transportOrderId } = useParams()
  return <Workspace key={transportOrderId} orderId={transportOrderId} active={active} showTabs={showTabs} tabOverride={tabOverride} />
}
