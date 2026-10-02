import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { listTransportOrderRelations, listTransportOrdersPage } from '../lib/transportOrders.js'
import { formatTransportOrderWindow, transportOrderPath } from '../lib/transportOrderPresentation.js'
import { defaultTrackingFilter, emptyTrackingFilterMessage, trackingFilterOptions, trackingStatusForList, visibleTransportOrderPage } from '../lib/transportOrderListPresentation.js'

const columns = [
  { key: 'externalNumber', label: 'TA-Nummer' }, { key: 'tracking', label: 'Sendungsverfolgung' },
  { key: 'loading', label: 'Ladestelle' }, { key: 'loadingFrom', label: 'Ladetermin frühestens' },
  { key: 'unloading', label: 'Entladestelle' }, { key: 'unloadingUntil', label: 'Entladetermin spätestens' },
  { key: 'customer', label: 'Kunde' }, { key: 'carrier', label: 'Unternehmer' }, { key: 'relation', label: 'Relation' },
]

export default function TransportOrdersPage() {
  const { canEdit } = usePermissions()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [trackingFilter, setTrackingFilter] = useState(defaultTrackingFilter)
  const [relationFilter, setRelationFilter] = useState('')
  const [loadingFrom, setLoadingFrom] = useState('')
  const [loadingUntil, setLoadingUntil] = useState('')
  const [relations, setRelations] = useState([])
  const [sort, setSort] = useState({ key: null, direction: 'asc' })
  const [cursors, setCursors] = useState([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [page, setPage] = useState({ orders: [], hasMore: false, nextCursor: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const tableRef = useRef(null)
  const cursor = cursors[pageIndex]

  useEffect(() => {
    let cancelled = false
    listTransportOrdersPage({ cursor, search, relation: relationFilter, loadingFrom, loadingUntil, sort, trackingStatus: trackingFilter })
      .then((result) => {
        if (cancelled) return
        setPage(visibleTransportOrderPage(result))
        setError('')
        if (pageIndex > 0) tableRef.current?.scrollIntoView({ block: 'start' })
      })
      .catch(() => { if (!cancelled) setError('Die Auftragsliste konnte nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [cursor, pageIndex, search, sort, trackingFilter, relationFilter, loadingFrom, loadingUntil])

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
  function updateSearch(value) { resetList(() => setSearch(value)) }
  function updateRelation(value) { resetList(() => setRelationFilter(value)) }
  function updateLoadingFrom(value) { resetList(() => setLoadingFrom(value)) }
  function updateLoadingUntil(value) { resetList(() => setLoadingUntil(value)) }
  function resetFilters() { resetList(() => { setSearch(''); setTrackingFilter(defaultTrackingFilter); setRelationFilter(''); setLoadingFrom(''); setLoadingUntil('') }) }
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
    <div className="list-toolbar"><div className="list-controls transport-orders-filters"><label className="search-field"><span className="sr-only"><StaticText source={"Transportaufträge suchen"} /></span><TranslatedProps sources={{"placeholder":"TA-Nummer, Kunde oder Unternehmer suchen"}}><input type="search" value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="TA-Nummer, Kunde oder Unternehmer suchen" /></TranslatedProps></label><label className="transport-orders-tracking-filter"><span><StaticText source={"Sendungsverfolgung"} /></span><select value={trackingFilter} onChange={(event) => selectTrackingFilter(event.target.value)}>{trackingFilterOptions.map((option) => <option key={option.value} value={option.value}>{<StaticText source={option.label} />}</option>)}</select></label><label className="transport-orders-tracking-filter"><span><StaticText source={"Relation"} /></span><select value={relationFilter} onChange={(event) => updateRelation(event.target.value)}><option value=""><StaticText source={"Alle Relationen"} /></option>{relations.map((relation) => <option key={relation} value={relation}>{relation}</option>)}</select></label><label className="transport-orders-tracking-filter"><span><StaticText source={"Start von"} /></span><input type="date" value={loadingFrom} max={loadingUntil || undefined} onChange={(event) => updateLoadingFrom(event.target.value)} /></label><label className="transport-orders-tracking-filter"><span><StaticText source={"Start bis"} /></span><input type="date" value={loadingUntil} min={loadingFrom || undefined} onChange={(event) => updateLoadingUntil(event.target.value)} /></label><button className="button button--secondary transport-orders-filters__reset" type="button" disabled={!search && trackingFilter === defaultTrackingFilter && !relationFilter && !loadingFrom && !loadingUntil} onClick={resetFilters}><StaticText source={"Filter zurücksetzen"} /></button></div>{canEdit('dataImports') && <Link className="button" to="/transportauftraege/import"><StaticText source={"Transportaufträge importieren"} /></Link>}</div>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    <div className="transport-orders-table-frame" ref={tableRef}><table className="data-table transport-orders-table transport-orders-table--list"><thead><tr>{columns.map(renderSortableHeader)}</tr></thead><tbody>{loading ? <tr><td className="table-state" colSpan={columns.length}><StaticText source={"Transportaufträge werden geladen …"} /></td></tr> : !page.orders.length ? <tr><td className="table-state" colSpan={columns.length}><div className="transport-orders-empty"><span><StaticText source={emptyTrackingFilterMessage(trackingFilter)} /></span>{trackingFilter !== 'all' && <button className="button button--secondary" type="button" onClick={() => selectTrackingFilter('all')}><StaticText source={"Filter zurücksetzen"} /></button>}</div></td></tr> : page.orders.map((order) => <tr className="transport-orders-table__row" key={order.id} role="link" tabIndex="0" aria-label={t('orders.open', { number: order.externalNumber })} onClick={() => openOrder(order.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOrder(order.id) } }}>
      <td><strong>{order.externalNumber}</strong></td>
      <td><span className={`transport-orders-tracking-status transport-orders-tracking-status--${trackingStatusForList(order.trackingStatus).className}`}><StaticText source={trackingStatusForList(order.trackingStatus).label} /></span></td>
      <td title={order.imported?.loading?.city || ''}>{order.imported?.loading?.city || '—'}</td>
      <td>{formatTransportOrderWindow(order.imported?.loading?.window?.from)}</td>
      <td title={order.imported?.unloading?.city || ''}>{order.imported?.unloading?.city || '—'}</td>
      <td>{formatTransportOrderWindow(order.imported?.unloading?.window?.until)}</td>
      <td className="transport-orders-table__partner" title={order.imported?.customer?.name || ''}>{order.imported?.customer?.name || '—'}</td>
      <td className="transport-orders-table__partner" title={order.imported?.carrier?.originalName || ''}>{order.imported?.carrier?.originalName || '—'}</td>
      <td title={order.imported?.relation || ''}>{order.imported?.relation || '—'}</td>
    </tr>)}</tbody></table></div>
    {!loading && !error && (pageIndex > 0 || page.hasMore) && <TranslatedProps sources={{"aria-label":"Seitennavigation für Transportaufträge"}}><nav className="transport-orders-pagination" aria-label="Seitennavigation für Transportaufträge"><button className="button button--secondary" type="button" disabled={pageIndex === 0} onClick={goToPreviousPage}><StaticText source={"← Zurück"} /></button><span><StaticText source={"Seite"} /> {pageIndex + 1}</span><button className="button button--secondary" type="button" disabled={!page.hasMore} onClick={goToNextPage}><StaticText source={"Weiter →"} /></button></nav></TranslatedProps>}
  </div>
}
