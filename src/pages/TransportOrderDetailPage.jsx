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
import { transportOrderHistoryRows, transportOrderHistoryValue } from '../lib/transportOrderHistoryPresentation.js'
import { recordHistoryActor, recordHistoryTime } from '../lib/recordHistoryPresentation.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { createReturnState } from '../lib/recordNavigation.js'
import { transportOrderCasePrefill } from '../../shared/caseTransportLinks.js'
import ContextLink from '../components/ui/ContextLink.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import TransportInvoiceChecks from '../components/transport-orders/TransportInvoiceChecks.jsx'
import TransportOrderImportedDetails from '../components/transport-orders/TransportOrderImportedDetails.jsx'
import TransportOrderHistoryModal from '../components/transport-orders/TransportOrderHistoryModal.jsx'
import TransportOrderLinkedCasesCard from '../components/case-links/TransportOrderLinkedCasesCard.jsx'
import TransportOrderPalletMovementsCard from '../components/transport-orders/TransportOrderPalletMovementsCard.jsx'
import TransportOrderTodosCard from '../components/transport-orders/TransportOrderTodosCard.jsx'

function Card({ title, onDetails, children }) {
  return <section className="order-workspace__card"><div className="order-workspace__card-header"><h3><StaticText source={title} /></h3>{onDetails && <button className="order-workspace__text-button" type="button" onClick={onDetails}><StaticText source="Details" /> →</button>}</div>{children}</section>
}
function Values({ entries }) {
  return <dl>{entries.map(([label, value]) => <div key={label} style={{ display: 'contents' }}><dt><StaticText source={label} /></dt><dd>{value === null || value === undefined || value === '' ? '—' : value}</dd></div>)}</dl>
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
function StationCards({ imported, detailed, date }) {
  const stops = transportOrderWorkspaceStops(imported)
  return stops.length ? stops.map((stop, index) => <article className="order-workspace__stop" key={`${stop.sourceId || index}-${index}`}>
    <h4>{index + 1} · <StaticText source={stop.type === 'loading' ? 'Ladestelle' : stop.type === 'unloading' ? 'Entladestelle' : 'Unbekannte Station'} /></h4>
    <p>{stop.legacy ? stop.originalText || stop.city : addressText(stop.address) || '—'}</p>
    <p>{date(stop.window?.from)} – {date(stop.window?.until)}</p>
    {stop.deliveryInformation && <p className="order-workspace__muted"><StaticText source="Referenz" />: {stop.deliveryInformation}</p>}
    {detailed && <><p><StaticText source="Bemerkung" />: {stop.note || '—'}</p><p><StaticText source="Lieferscheinnummer" />: {stop.deliveryNoteNumber || '—'}</p>{stop.slotUntilTime && !stop.window?.until && <p className="order-workspace__muted"><StaticText source="Bis-Uhrzeit aus Quelle (Datum ungeklärt)" />: {stop.slotUntilTime}</p>}</>}
  </article>) : <p className="order-workspace__muted"><StaticText source="Keine Stationen übermittelt." /></p>
}
function ResultCard({ financial, currency, onDetails }) {
  const result = transportOrderResult(financial)
  return <Card title="Auftragsergebnis" onDetails={onDetails}><div className="order-workspace__money"><span><StaticText source="Ertrag netto" /></span><span>{currency(financial?.revenueNet)}</span></div><div className="order-workspace__money"><span><StaticText source="Kosten netto" /></span><span>{currency(financial?.costNet)}</span></div><div className={`order-workspace__money order-workspace__money--result${result < 0 ? ' order-workspace__money--negative' : ''}`}><span><StaticText source="Gewinn / Verlust" /></span><span>{currency(result)}</span></div></Card>
}

function Workspace({ orderId }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const locale = language === 'en' ? 'en-GB' : 'de-DE'
  const { canView, canEdit } = usePermissions()
  const { user, profile } = useAuth()
  const { setTitle } = usePageHeader()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get('tab') || 'overview'
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
  const [historyOpen, setHistoryOpen] = useState(false)
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
  }, [orderId])
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
    try {
      const result = await getTransportOrderWorkspaceHistory(orderId)
      if (alive.current) {
        setHistory(result); setHistoryError(false)
        const recorded = new Set(result.refreshes.map((entry) => entry.id))
        setLocalAttempts((entries) => entries.filter((entry) => !recorded.has(entry.id)))
      }
    } catch { if (alive.current) setHistoryError(true) }
  }, [orderId])
  useEffect(() => {
    let current = true
    loadOrder().catch(() => { if (current) setError('Der Transportauftrag konnte nicht geladen werden.') }).finally(() => { if (current) setLoading(false) })
    void Promise.resolve().then(loadHistory)
    return () => { current = false }
  }, [loadOrder, loadHistory])
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
    const title = order?.externalNumber ? `${language === 'en' ? 'Order' : 'Auftrag'} · TA ${order.externalNumber}` : ''
    setTitle(title)
    document.title = title ? `Drehpunkt · ${title}` : 'Drehpunkt'
    return () => { setTitle(''); document.title = 'Drehpunkt' }
  }, [order?.externalNumber, language, setTitle])
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
  const scopeLabels = { all: w('Auftrag und Stammdaten', 'Order and master data'), order: w('Auftragsdaten', 'Order data'), partners: w('Geschäftspartner', 'Business partners') }
  const stepStatus = (value) => ({ updated: w('Aktualisiert', 'Updated'), unchanged: w('Unverändert', 'Unchanged'), new: w('Neu angelegt', 'Created'), failed: w('Fehlgeschlagen', 'Failed'), skipped: w('Nicht abgerufen', 'Not retrieved') })[value] || w('Prüfung erforderlich', 'Review required')
  const codeLabel = (value) => ({ interrupted: w('Abruf unterbrochen; der Ausgang einzelner Schritte ist ungewiss. Bereits gespeicherte Änderungen bleiben erhalten.', 'Update interrupted; some step results are uncertain. Changes already saved remain intact.'), 'no-linked-partners': w('Keine Geschäftspartner mit dem Auftrag verknüpft.', 'No business partners linked to this order.'), 'permission-denied': w('Für diesen Teil fehlt die Berechtigung.', 'Permission is missing for this step.') })[value] || w('Dieser Teil konnte nicht zuverlässig abgeschlossen werden.', 'This step could not be reliably completed.')
  const historyRows = transportOrderHistoryRows(order, history.changes || [])
  if (loading) return <p className="page-state"><StaticText source="Transportauftrag wird geladen …" /></p>
  if (error || !order?.imported) return <section className="todo-detail-empty"><BackLink to="/transportauftraege" /><h2><StaticText source="Transportauftrag nicht verfügbar" /></h2><p><StaticText source={error || 'Noch keine Daten verfügbar.'} /></p><button className="button button--secondary" type="button" onClick={() => { setLoading(true); void loadOrder().catch(() => setError('Der Transportauftrag konnte nicht geladen werden.')).finally(() => setLoading(false)) }}><StaticText source="Erneut versuchen" /></button></section>
  const imported = order.imported
  const shipment = imported.shipment || {}
  const cargoEntries = [['Fahrzeugart', shipment.vehicleType], ['Kennzeichen', shipment.licensePlate], ['Kolli', number(shipment.packages)], ['Gewicht', number(shipment.weightKg, ' kg')], ['Lademeter', number(shipment.loadingMeters, ' m')]]
  return <div className="order-workspace">
    <BackLink to="/transportauftraege" />
    <div className="order-workspace__head"><h2>TA {order.externalNumber}</h2><span className="order-workspace__muted">{[imported.loading?.city, imported.unloading?.city].filter(Boolean).join(' → ')}</span></div>
    <div className="order-workspace__meta"><span><StaticText source="Kundenreferenz" />: {imported.customerReference || '—'}</span><span><StaticText source="Relation" />: {imported.relation || '—'}</span></div>
    <div className="order-workspace__tabs" role="tablist" aria-label={w('Auftragsbereiche', 'Order sections')}>{transportOrderWorkspaceTabs.map((value) => <button key={value} type="button" role="tab" id={`order-tab-${value}`} aria-controls={`order-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => selectTab(value)} onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? transportOrderWorkspaceTabs.length - 1 : (transportOrderWorkspaceTabs.indexOf(value) + (event.key === 'ArrowRight' ? 1 : -1) + transportOrderWorkspaceTabs.length) % transportOrderWorkspaceTabs.length
      const next = transportOrderWorkspaceTabs[index]; selectTab(next); document.getElementById(`order-tab-${next}`)?.focus()
    }}>{tabLabels[value]}</button>)}</div>
    <div className="order-workspace__toolbar"><div className="order-workspace__update" aria-live="polite">{tab !== 'history' && <>{<><StaticText source="Letzte Aktualisierung" />: {date(lastSuccess?.completedAt || (scope === 'order' ? order.importMeta?.lastImportedAt : null))}{latest && latest.status !== 'success' && <> · {statusLabels[latest.status] || w('Aktualisierung prüfen', 'Check update')}</>}</>} · <button type="button" className="order-workspace__text-button" onClick={() => selectTab('history')}><StaticText source="Siehe Historie" /></button></>}</div>{scope && canRefresh && <button className="button" type="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? w('Wird aktualisiert …', 'Updating …') : scope === 'all' ? w('Auftrag aktualisieren', 'Update order') : scope === 'partners' ? w('Stammdaten aktualisieren', 'Update master data') : w('Auftragsdaten aktualisieren', 'Update order data')}</button>}</div>
    {reloadError && <p className="form-error"><StaticText source="Die Daten wurden gespeichert, aber die Ansicht konnte nicht aktualisiert werden. Bitte lade die Seite neu." /></p>}
    {partnerError && <p className="form-error"><StaticText source="Die Geschäftspartnerdaten konnten nicht geladen werden." /></p>}
    <div className="order-workspace__layout"><main className="order-workspace__content"><section role="tabpanel" id={`order-panel-${tab}`} aria-labelledby={`order-tab-${tab}`}>
      {tab === 'overview' && <div className="order-workspace__overview"><div className="order-workspace__stack"><Card title="Stationen" onDetails={() => selectTab('transport')}><StationCards imported={imported} date={date} /></Card><Card title="Ware & Fahrzeug" onDetails={() => selectTab('transport')}><Values entries={cargoEntries} /></Card></div><div className="order-workspace__stack"><ResultCard financial={imported.financial} currency={currency} onDetails={() => selectTab('finance')} /><PartnerCard type="customer" imported={imported} partner={partners.customer} canOpen={canView('masterData')} onDetails={() => selectTab('partners')} /><PartnerCard type="carrier" imported={imported} partner={partners.carrier} canOpen={canView('masterData')} onDetails={() => selectTab('partners')} /></div></div>}
      {tab === 'transport' && <div className="order-workspace__stack"><Card title="Transport & Tour"><Values entries={[["Tour-ID (DyCoS)", imported.source?.tourId], ...cargoEntries, ['Dispositionsbemerkung', imported.dispositionNote]]} /></Card><Card title="Alle Stationen"><StationCards imported={imported} detailed date={date} /></Card><TransportOrderImportedDetails imported={{ stops: transportOrderWorkspaceStops(imported) }} /></div>}
      {tab === 'partners' && <div className="order-workspace__stack"><PartnerCard type="customer" imported={imported} partner={partners.customer} canOpen={canView('masterData')} full /><PartnerCard type="carrier" imported={imported} partner={partners.carrier} canOpen={canView('masterData')} full /><Card title="Auftragsbezogene Angaben"><Values entries={[["Kundenreferenz", imported.customerReference], ['Dispositionsbemerkung', imported.dispositionNote], ['TA zuletzt versendet am', date(imported.dispatch?.sentAt)]]} /></Card></div>}
      {tab === 'finance' && <div className="order-workspace__finance"><TransportInvoiceChecks orderId={orderId} number={order.externalNumber} /><ResultCard financial={imported.financial} currency={currency} /><TransportOrderImportedDetails imported={{ financial: imported.financial }} />{!imported.financial?.documents && <Card title="Rechnungen und Gutschriften"><p><StaticText source="Noch keine Belegdaten übermittelt. Bitte den Auftrag aktualisieren." /></p></Card>}</div>}
      {tab === 'history' && <div className="order-workspace__history">{historyError && <p className="form-error"><StaticText source="Die Auftragshistorie konnte nicht geladen werden." /> <button className="order-workspace__text-button" type="button" onClick={() => void loadHistory()}><StaticText source="Erneut versuchen" /></button></p>}
        <h3><StaticText source="Aktualisierungen" /></h3>{!refreshes.length && <p className="order-workspace__muted"><StaticText source="Noch keine Aktualisierungen über diesen Auftragsbereich protokolliert." /></p>}{refreshes.map((entry) => <details key={entry.id} open={entry.id === searchParams.get('refresh') || entry.status !== 'success'} data-focused={entry.id === searchParams.get('refresh')}><summary>{date(entry.completedAt || entry.startedAt)} · {statusLabels[entry.status] || entry.status}<div className="order-workspace__muted">{scopeLabels[entry.scope]} · {entry.actorName || entry.actorId || '—'}</div></summary><p>{entry.status === 'unconfirmed' ? w('Das Ergebnis des Abrufs konnte nicht bestätigt werden. Bitte erneut aktualisieren. Bereits gespeicherte Änderungen bleiben erhalten.', 'The result could not be confirmed. Please update again. Changes already saved remain intact.') : w('Der Abruf wurde protokolliert. Fachliche Änderungen stehen im Änderungsverlauf darunter.', 'This update was recorded. Business changes are listed in the history below.')}</p>{entry.result?.code && <p>{codeLabel(entry.result.code)}</p>}{entry.result?.order && <p><StaticText source="Auftragsdaten" />: {stepStatus(entry.result.order.status)}{entry.result.order.code && <> · {codeLabel(entry.result.order.code)}</>}{entry.result.order.conflicts > 0 && <> · {w('Abweichende Stammdaten prüfen', 'Review differing master data')}</>}</p>}{entry.result?.partners?.map((partner, index) => <p key={index}><StaticText source="Geschäftspartner" />: {stepStatus(partner.status)}{partner.code && <> · {codeLabel(partner.code)}</>}{partner.conflicts > 0 && <> · <StaticText source="Abweichende Stammdaten prüfen" /></>}</p>)}</details>)}
        {(history.hasMore || history.refreshHasMore) && <button className="button button--secondary" type="button" disabled={historyLoading} onClick={() => void moreHistory()}><StaticText source={historyLoading ? 'Wird geladen …' : 'Weitere Historie laden'} /></button>}<h3><StaticText source="Auftragsänderungen" /></h3>{historyRows.map((entry) => <details key={entry.id}><summary>{date(entry.createdAt)} · {recordHistoryActor(entry)}{entry.creation && <> · <StaticText source="Transportauftrag angelegt" /></>}</summary>{entry.changes?.length > 0 ? <div className="order-workspace__scroll"><table className="data-table"><thead><tr>{['Feld', 'Alte Daten', 'Neue Daten'].map((label) => <th key={label}><StaticText source={label} /></th>)}</tr></thead><tbody>{entry.changes.map((change, index) => <tr key={`${change.path}-${index}`}><td>{change.label.split(' · ').map((label, part) => <span key={part}>{part ? ' · ' : ''}<StaticText source={label} /></span>)}</td><td>{transportOrderHistoryValue(change.oldValue, language, change)}</td><td>{transportOrderHistoryValue(change.newValue, language, change)}</td></tr>)}</tbody></table></div> : <p><StaticText source={entry.summary || (entry.creation ? 'Transportauftrag angelegt' : 'Daten geändert')} /></p>}</details>)}<button className="button button--secondary" type="button" onClick={() => setHistoryOpen(true)}><StaticText source="Vollständigen Änderungsverlauf öffnen" /></button></div>}
    </section></main><aside className="order-workspace__links" aria-label={w('Verknüpfungen zum Auftrag', 'Linked records')}><Card title="Sendungsverfolgung"><p className="order-workspace__muted">TA {order.externalNumber}</p><ContextLink className="button button--secondary" to={`/sendungsverfolgung/${encodeURIComponent(orderId)}`}><StaticText source="Sendungsverfolgung öffnen" /> ↗</ContextLink></Card><TransportOrderLinkedCasesCard key={order.id} transportOrderId={orderId} canEditCase={canEdit} canViewCase={canView} onCreate={createCase} />{canView('pallets') && <TransportOrderPalletMovementsCard key={`pallets-${order.id}`} transportOrder={order} canEdit={canEdit('pallets')} />}{canView('todos') && <TransportOrderTodosCard key={`todos-${order.id}`} canCreate={canEdit('todos')} canView canViewMasterData={canView('masterData')} order={order} profile={profile} user={user} />}</aside></div>
    {historyOpen && <TransportOrderHistoryModal order={order} onClose={() => setHistoryOpen(false)} />}
  </div>
}
export default function TransportOrderDetailPage() {
  const { transportOrderId } = useParams()
  return <Workspace key={transportOrderId} orderId={transportOrderId} />
}
