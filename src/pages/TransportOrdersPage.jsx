import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useRef, useState } from 'react'
import { FaBan, FaChevronLeft, FaChevronRight, FaEnvelope, FaHouse, FaStopwatch, FaTruck, FaTruckFast } from 'react-icons/fa6'
import { Link, useNavigate } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { listTransportOrderRelations, listTransportOrdersPage } from '../lib/transportOrders.js'
import { formatTransportOrderRelation, formatTransportOrderWindow, transportOrderPath } from '../lib/transportOrderPresentation.js'
import { defaultTrackingFilter, emptyTrackingFilterMessage, trackingFilterOptions, trackingStatusForList, transportOrderListPageSize, transportOrderListPageSizeOptions, visibleTransportOrderPage } from '../lib/transportOrderListPresentation.js'
import { getShipmentTrackingForecast, refreshShipmentTrackingForecast } from '../lib/shipmentTrackingForecast.js'
import { getShipmentTracking, sendManualShipmentTrackingMail, shipmentTrackingManualMailErrorMessage } from '../lib/shipmentTracking.js'
import ShipmentTrackingForecastModal from '../components/transport-orders/ShipmentTrackingForecastModal.jsx'
import ShipmentTrackingManualMailModal from '../components/transport-orders/ShipmentTrackingManualMailModal.jsx'
import { LicensePlateIcon } from '../components/icons.jsx'

const columns = [
  { key: 'externalNumber', label: 'TA-Nummer' }, { key: 'relation', label: 'Relation' }, { key: 'tracking', label: 'Verfolgung' }, { key: 'attention', label: 'Empfehlung' }, { key: 'forecast', label: 'Prognose' },
  { key: 'loading', label: 'Ladestelle' }, { key: 'loadingFrom', label: 'Ladetermin' },
  { key: 'unloading', label: 'Entladestelle' }, { key: 'unloadingUntil', label: 'Entladetermin' },
  { key: 'customer', label: 'Kunde' }, { key: 'carrier', label: 'Unternehmer' },
]

const emptyIconFilters = { automationPaused: false, mailReview: false, licensePlate: false, stopwatch: '', truck: '' }

const attentionIcon = (item) => item.icon === 'stopwatch' ? FaStopwatch : item.id === 'mail-review' ? FaEnvelope : item.id === 'automation-paused' ? FaBan : FaTruck
const forecastStateLabel = (state) => ({ green: 'Im Plan', yellow: 'Knapp', red: 'Verspätet', grey: 'Abgelaufen' }[state] || 'Unbekannt')
const trackingCarrierRecipient = (tracking) => {
  const carrier = tracking?.recipients?.carrier
  return ['manual', 'transport-order-import'].includes(carrier?.source) && typeof carrier?.email === 'string' ? carrier.email.trim() : ''
}

function IconFilterButton({ active, title, label, children, onClick, tone = '' }) {
  return <button className={`transport-orders-icon-filter${active ? ' transport-orders-icon-filter--active' : ''}${tone ? ` transport-orders-icon-filter--${tone}` : ''}`} type="button" aria-pressed={active} title={title} onClick={onClick}><span aria-hidden="true">{children}</span><span className="sr-only">{label}</span></button>
}

export default function TransportOrdersPage() {
  const { canEdit } = usePermissions()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [trackingFilter, setTrackingFilter] = useState(defaultTrackingFilter)
  const [attentionFilter, setAttentionFilter] = useState('all')
  const [iconFilters, setIconFilters] = useState(emptyIconFilters)
  const [relationFilter, setRelationFilter] = useState('')
  const [loadingFrom, setLoadingFrom] = useState('')
  const [loadingUntil, setLoadingUntil] = useState('')
  const [relations, setRelations] = useState([])
  const [sort, setSort] = useState({ key: null, direction: 'asc' })
  const [pageSize, setPageSize] = useState(transportOrderListPageSize)
  const [cursors, setCursors] = useState([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [page, setPage] = useState({ orders: [], hasMore: false, nextCursor: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forecastModal, setForecastModal] = useState(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastRefreshing, setForecastRefreshing] = useState(false)
  const [forecastRequestMail, setForecastRequestMail] = useState(null)
  const [forecastRequestMailSaving, setForecastRequestMailSaving] = useState(false)
  const tableRef = useRef(null)
  const cursor = cursors[pageIndex]

  useEffect(() => {
    let cancelled = false
    listTransportOrdersPage({ cursor, pageSize, search, relation: relationFilter, loadingFrom, loadingUntil, sort, trackingStatus: trackingFilter, attention: attentionFilter, iconFilters })
      .then((result) => {
        if (cancelled) return
        setPage(visibleTransportOrderPage(result, pageSize))
        setError('')
        if (pageIndex > 0) tableRef.current?.scrollIntoView({ block: 'start' })
      })
      .catch(() => { if (!cancelled) setError('Die Auftragsliste konnte nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [cursor, pageIndex, pageSize, search, sort, trackingFilter, attentionFilter, iconFilters, relationFilter, loadingFrom, loadingUntil])

  useEffect(() => {
    let cancelled = false
    listTransportOrderRelations().then((values) => { if (!cancelled) setRelations(values) }).catch(() => { if (!cancelled) setRelations([]) })
    return () => { cancelled = true }
  }, [])

  function resetList(update) {
    setLoading(true)
    setError('')
    setCursors([null])
    setPageIndex(0)
    update()
  }
  function toggleSort(key) { resetList(() => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))) }
  function selectTrackingFilter(value) { resetList(() => setTrackingFilter(value)) }
  function selectAttentionFilter(value) { resetList(() => setAttentionFilter(value)) }
  function toggleIconFilter(key, value = true) { resetList(() => setIconFilters((current) => ({ ...current, [key]: typeof value === 'boolean' ? !current[key] : current[key] === value ? '' : value }))) }
  function updateSearch(value) { resetList(() => setSearch(value)) }
  function updateRelation(value) { resetList(() => setRelationFilter(value)) }
  function updateLoadingFrom(value) { resetList(() => setLoadingFrom(value)) }
  function updateLoadingUntil(value) { resetList(() => setLoadingUntil(value)) }
  function updatePageSize(value) { resetList(() => setPageSize(Number(value))) }
  function resetFilters() { resetList(() => { setSearch(''); setTrackingFilter(defaultTrackingFilter); setAttentionFilter('all'); setIconFilters(emptyIconFilters); setRelationFilter(''); setLoadingFrom(''); setLoadingUntil('') }) }
  async function openForecast(event, orderId) {
    event.stopPropagation()
    setForecastLoading(true)
    setForecastModal({ orderId, data: null, error: '', recipient: '' })
    try {
      const [data, tracking] = await Promise.all([getShipmentTrackingForecast(orderId), getShipmentTracking(orderId)])
      setForecastModal({ orderId, data, error: '', recipient: trackingCarrierRecipient(tracking.tracking) })
    } catch {
      setForecastModal({ orderId, data: null, error: 'Die Transportprognose konnte nicht geladen werden.', recipient: '' })
    } finally { setForecastLoading(false) }
  }
  async function refreshForecast() {
    const orderId = forecastModal?.orderId
    if (!orderId) return
    setForecastRefreshing(true)
    setForecastModal((current) => current?.orderId === orderId ? { ...current, error: '' } : current)
    try {
      await refreshShipmentTrackingForecast(orderId)
      const data = await getShipmentTrackingForecast(orderId)
      setForecastModal((current) => current?.orderId === orderId ? { ...current, data, error: '' } : current)
    } catch {
      setForecastModal((current) => current?.orderId === orderId ? { ...current, error: 'Die Transportprognose konnte nicht aktualisiert werden.' } : current)
    } finally { setForecastRefreshing(false) }
  }
  async function sendForecastRequestMail(payload) {
    const orderId = forecastRequestMail?.orderId
    if (!orderId) return
    setForecastRequestMailSaving(true)
    setError('')
    try {
      await sendManualShipmentTrackingMail(orderId, payload)
      setForecastRequestMail(null)
    } catch (caught) {
      setError(shipmentTrackingManualMailErrorMessage(caught))
    } finally { setForecastRequestMailSaving(false) }
  }
  function goToNextPage() {
    if (!page.hasMore || !page.nextCursor) return
    setLoading(true)
    setCursors((current) => [...current.slice(0, pageIndex + 1), page.nextCursor])
    setPageIndex((current) => current + 1)
  }
  function goToPreviousPage() {
    if (pageIndex === 0) return
    setLoading(true)
    setPageIndex((current) => current - 1)
  }
  function renderSortableHeader({ key, label }) {
    const direction = sort.key === key ? sort.direction : 'none'
    return <th key={key} aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}><button className="table-sort-button" type="button" onClick={() => toggleSort(key)}><span><StaticText source={label} /></span><span className="table-sort-button__indicator" data-direction={direction} aria-hidden="true" /><span className="sr-only">{t(direction === 'none' ? 'orders.sort' : direction === 'asc' ? 'orders.sortAscending' : 'orders.sortDescending')}</span></button></th>
  }
  const openOrder = (orderId) => navigate(transportOrderPath(orderId))

  return <div className="transport-orders-page">
    <div className="list-toolbar">
      <div className="transport-orders-filter-stack">
        <div className="list-controls transport-orders-filters">
          <label className="search-field"><span className="sr-only"><StaticText source="Transportaufträge suchen" /></span><TranslatedProps sources={{ placeholder: 'TA-Nummer, Kunde oder Unternehmer suchen' }}><input type="search" value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="TA-Nummer, Kunde oder Unternehmer suchen" /></TranslatedProps></label>
          <label className="transport-orders-tracking-filter"><span><StaticText source="Sendungsverfolgung" /></span><select value={trackingFilter} onChange={(event) => selectTrackingFilter(event.target.value)}>{trackingFilterOptions.map((option) => <option key={option.value} value={option.value}><StaticText source={option.label} /></option>)}</select></label>
          <label className="transport-orders-tracking-filter"><span>Handlung</span><select value={attentionFilter} onChange={(event) => selectAttentionFilter(event.target.value)}><option value="all">Alle</option><option value="action">Handlung offen</option><option value="critical">Kritisch</option></select></label>
          <label className="transport-orders-tracking-filter"><span><StaticText source="Relation" /></span><select value={relationFilter} onChange={(event) => updateRelation(event.target.value)}><option value=""><StaticText source="Alle Relationen" /></option>{relations.map((relation) => <option key={relation} value={relation}>{relation}</option>)}</select></label>
          <label className="transport-orders-tracking-filter"><span><StaticText source="Start von" /></span><input type="date" value={loadingFrom} max={loadingUntil || undefined} onChange={(event) => updateLoadingFrom(event.target.value)} /></label>
          <label className="transport-orders-tracking-filter"><span><StaticText source="Start bis" /></span><input type="date" value={loadingUntil} min={loadingFrom || undefined} onChange={(event) => updateLoadingUntil(event.target.value)} /></label>
          <button className="button button--secondary transport-orders-filters__reset" type="button" disabled={!search && trackingFilter === defaultTrackingFilter && attentionFilter === 'all' && !iconFilters.automationPaused && !iconFilters.mailReview && !iconFilters.licensePlate && !iconFilters.stopwatch && !iconFilters.truck && !relationFilter && !loadingFrom && !loadingUntil} onClick={resetFilters}><StaticText source="Filter zurücksetzen" /></button>
        </div>
        <section className="transport-orders-icon-filters" aria-label="Filter-Verfolgung">
          <span className="transport-orders-icon-filters__label">Filter-Verfolgung</span>
          <div className="transport-orders-icon-filter-group transport-orders-icon-filter-group--single" aria-label="Pausierte Automatik">
            <IconFilterButton active={iconFilters.automationPaused} title="Pausierte Automatik" label="Pausierte Automatik" onClick={() => toggleIconFilter('automationPaused')} tone="critical"><FaBan /></IconFilterButton>
          </div>
          <div className="transport-orders-icon-filter-group transport-orders-icon-filter-group--single" aria-label="Eingangsmail manuell prüfen">
            <IconFilterButton active={iconFilters.mailReview} title="Eingangsmail manuell prüfen" label="Eingangsmail manuell prüfen" onClick={() => toggleIconFilter('mailReview')} tone="warning"><FaEnvelope /></IconFilterButton>
          </div>
          <div className="transport-orders-icon-filter-group transport-orders-icon-filter-group--single" aria-label="Kennzeichen fehlt">
            <IconFilterButton active={iconFilters.licensePlate} title="Kennzeichen fehlt" label="Kennzeichen fehlt" onClick={() => toggleIconFilter('licensePlate')} tone="warning"><LicensePlateIcon /></IconFilterButton>
          </div>
          <div className="transport-orders-icon-filter-group" aria-label="Stopuhr">
            <IconFilterButton active={iconFilters.stopwatch === 'success'} title="Grüne Stopuhr" label="Grüne Stopuhr" onClick={() => toggleIconFilter('stopwatch', 'success')} tone="success"><FaStopwatch /></IconFilterButton>
            <IconFilterButton active={iconFilters.stopwatch === 'warning'} title="Gelbe Stopuhr" label="Gelbe Stopuhr" onClick={() => toggleIconFilter('stopwatch', 'warning')} tone="warning"><FaStopwatch /></IconFilterButton>
            <IconFilterButton active={iconFilters.stopwatch === 'critical'} title="Rote Stopuhr" label="Rote Stopuhr" onClick={() => toggleIconFilter('stopwatch', 'critical')} tone="critical"><FaStopwatch /></IconFilterButton>
          </div>
          <div className="transport-orders-icon-filter-group" aria-label="LKW-Hinweis">
            <IconFilterButton active={iconFilters.truck === 'info'} title="Blauer LKW-Hinweis" label="Blauer LKW-Hinweis" onClick={() => toggleIconFilter('truck', 'info')} tone="info"><FaTruck /></IconFilterButton>
            <IconFilterButton active={iconFilters.truck === 'success'} title="Grüner LKW-Hinweis" label="Grüner LKW-Hinweis" onClick={() => toggleIconFilter('truck', 'success')} tone="success"><FaTruck /></IconFilterButton>
            <IconFilterButton active={iconFilters.truck === 'warning'} title="Gelber LKW-Hinweis" label="Gelber LKW-Hinweis" onClick={() => toggleIconFilter('truck', 'warning')} tone="warning"><FaTruck /></IconFilterButton>
            <IconFilterButton active={iconFilters.truck === 'critical'} title="Roter LKW-Hinweis" label="Roter LKW-Hinweis" onClick={() => toggleIconFilter('truck', 'critical')} tone="critical"><FaTruck /></IconFilterButton>
          </div>
        </section>
      </div>
      {canEdit('dataImports') && <Link className="button" to="/transportauftraege/import"><StaticText source="Transportaufträge importieren" /></Link>}
    </div>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    <div className="transport-orders-table-frame" ref={tableRef}><table className="data-table transport-orders-table transport-orders-table--list"><thead><tr>{columns.map(renderSortableHeader)}</tr></thead><tbody>{loading ? <tr><td className="table-state" colSpan={columns.length}><StaticText source={"Transportaufträge werden geladen …"} /></td></tr> : !page.orders.length ? <tr><td className="table-state" colSpan={columns.length}><div className="transport-orders-empty"><span><StaticText source={emptyTrackingFilterMessage(trackingFilter)} /></span>{trackingFilter !== 'all' && <button className="button button--secondary" type="button" onClick={() => selectTrackingFilter('all')}><StaticText source={"Filter zurücksetzen"} /></button>}</div></td></tr> : page.orders.map((order) => <tr className="transport-orders-table__row" key={order.id} role="link" tabIndex="0" aria-label={t('orders.open', { number: order.externalNumber })} onClick={() => openOrder(order.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOrder(order.id) } }}>
      <td><strong>{order.externalNumber}</strong></td>
      <td title={formatTransportOrderRelation(order.imported?.relation)}>{formatTransportOrderRelation(order.imported?.relation)}</td>
      <td><span className={`transport-orders-tracking-status transport-orders-tracking-status--${trackingStatusForList(order.trackingStatus).className}`}><StaticText source={trackingStatusForList(order.trackingStatus).label} /></span></td>
      <td><span className="transport-orders-attention-icons">{(order.attention?.visible || []).map((item) => { const Icon = attentionIcon(item); return <span key={item.id} className={`transport-orders-attention-icons__item transport-orders-attention-icons__item--${item.severity}`} title={`${item.label}: ${item.detail}`} aria-label={`${item.label}: ${item.detail}`}>{item.id === 'license-plate' ? <LicensePlateIcon /> : <Icon aria-hidden="true" />}</span> })}{order.attention?.moreCount > 0 && <span>+{order.attention.moreCount}</span>}</span></td>
      <td>{order.forecast && <button className={`transport-orders-forecast-button transport-orders-forecast-button--${order.forecast.state}`} type="button" onClick={(event) => void openForecast(event, order.id)} aria-label={`Transportprognose: ${forecastStateLabel(order.forecast.state)}`} title={`Transportprognose: ${forecastStateLabel(order.forecast.state)}`}>{order.forecast.kind === 'arrival' ? <FaHouse aria-hidden="true" /> : <FaTruckFast aria-hidden="true" />}</button>}</td>
      <td title={order.imported?.loading?.city || ''}>{order.imported?.loading?.city || '—'}</td>
      <td>{formatTransportOrderWindow(order.imported?.loading?.window?.from)}</td>
      <td title={order.imported?.unloading?.city || ''}>{order.imported?.unloading?.city || '—'}</td>
      <td>{formatTransportOrderWindow(order.imported?.unloading?.window?.until)}</td>
      <td className="transport-orders-table__partner" title={order.imported?.customer?.name || ''}>{order.imported?.customer?.name || '—'}</td>
      <td className="transport-orders-table__partner" title={order.imported?.carrier?.originalName || ''}>{order.imported?.carrier?.originalName || '—'}</td>
    </tr>)}</tbody></table></div>
    {!loading && !error && page.orders.length > 0 && <TranslatedProps sources={{"aria-label":"Seitennavigation für Transportaufträge"}}><nav className="transport-orders-pagination" aria-label="Seitennavigation für Transportaufträge"><label className="transport-orders-pagination__page-size"><span><StaticText source="Einträge pro Seite" /></span><select value={pageSize} onChange={(event) => updatePageSize(event.target.value)}>{transportOrderListPageSizeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><div className="transport-orders-pagination__controls"><TranslatedProps sources={{"aria-label":"Vorherige Seite","title":"Vorherige Seite"}}><button className="button button--secondary transport-orders-pagination__button" type="button" disabled={pageIndex === 0} onClick={goToPreviousPage} aria-label="Vorherige Seite" title="Vorherige Seite"><FaChevronLeft aria-hidden="true" /><span className="sr-only"><StaticText source="Vorherige Seite" /></span></button></TranslatedProps><span className="transport-orders-pagination__current"><span><StaticText source="Seite" /></span><strong>{pageIndex + 1}</strong></span><TranslatedProps sources={{"aria-label":"Nächste Seite","title":"Nächste Seite"}}><button className="button button--secondary transport-orders-pagination__button" type="button" disabled={!page.hasMore} onClick={goToNextPage} aria-label="Nächste Seite" title="Nächste Seite"><FaChevronRight aria-hidden="true" /><span className="sr-only"><StaticText source="Nächste Seite" /></span></button></TranslatedProps></div></nav></TranslatedProps>}
    {forecastModal && <ShipmentTrackingForecastModal data={forecastModal.data} loading={forecastLoading} error={forecastModal.error} refreshing={forecastRefreshing} onRefresh={forecastModal.data?.forecast?.kind === 'arrival' ? undefined : () => void refreshForecast()} onRequestForecastUpdate={(templateId) => setForecastRequestMail({ orderId: forecastModal.orderId, recipient: forecastModal.recipient, templateId })} requestDisabled={!canEdit('transportOrders') || !forecastModal.recipient} onClose={() => setForecastModal(null)} />}
    {forecastRequestMail && <ShipmentTrackingManualMailModal orderId={forecastRequestMail.orderId} initialTemplateId={forecastRequestMail.templateId} defaultRecipient={forecastRequestMail.recipient} saving={forecastRequestMailSaving} onClose={() => setForecastRequestMail(null)} onSend={(payload) => void sendForecastRequestMail(payload)} />}</div>
}
