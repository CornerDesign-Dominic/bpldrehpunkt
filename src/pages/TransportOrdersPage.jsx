import { useEffect, useState } from 'react'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa6'
import { StaticText } from '../i18n/AutoTranslate.jsx'
import { useLanguage } from '../i18n/useLanguage.js'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import Link from '../components/ui/ContextLink.jsx'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { listTransportOrderRelations } from '../lib/transportOrders.js'
import { listTransportOrderRecordsPage } from '../lib/transportOrderWorkspace.js'
import { normalizeOrderListPreferences, orderListStorageKey } from '../lib/orderListPreferences.js'
import { formatTransportOrderWindowRange, transportOrderPath } from '../lib/transportOrderPresentation.js'
import '../styles/transportOrderList.css'

const columns = [['externalNumber', 'TA-Nummer'], ['relation', 'Relation'], ['customer', 'Kunde'], ['carrier', 'Unternehmer'], ['loadingFrom', 'Laden'], ['unloadingUntil', 'Entladen']]

function OrderList({ uid }) {
  const { language } = useLanguage()
  const { canEdit } = usePermissions()
  const [storageError, setStorageError] = useState(false)
  const [relations, setRelations] = useState([])
  const [relationsError, setRelationsError] = useState(false)
  const [relationsReload, setRelationsReload] = useState(0)
  useEffect(() => {
    let current = true
    listTransportOrderRelations().then(values => { if (current) { setRelations(values); setRelationsError(false) } }).catch(error => {
      void reportTechnicalFailure({ module: 'transport-orders', stage: 'list', error })
      if (current) setRelationsError(true)
    })
    return () => { current = false }
  }, [relationsReload])
  const [filters, setFilters] = useState(() => {
    try { return normalizeOrderListPreferences(JSON.parse(localStorage.getItem(orderListStorageKey(uid)) || '{}')) } catch { return normalizeOrderListPreferences() }
  })
  const [queryFilters, setQueryFilters] = useState(filters)
  const [cursors, setCursors] = useState([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [data, setData] = useState({ orders: [], hasMore: false, nextCursor: null })
  const [loadedKey, setLoadedKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)
  const cursor = cursors[pageIndex]
  const queryKey = JSON.stringify({ ...queryFilters, cursor, reload })
  const pending = loading || queryFilters !== filters || loadedKey !== queryKey
  useEffect(() => {
    const timer = setTimeout(() => { setQueryFilters(filters); setCursors([null]); setPageIndex(0) }, 300)
    return () => clearTimeout(timer)
  }, [filters])
  useEffect(() => {
    let current = true
    listTransportOrderRecordsPage({ ...queryFilters, cursor }).then(result => {
      if (current) { setData(result); setError(false) }
    }).catch(() => { if (current) { setError(true); setData({ orders: [], hasMore: false }) } }).finally(() => { if (current) { setLoading(false); setLoadedKey(queryKey) } })
    return () => { current = false }
  }, [queryFilters, cursor, reload, queryKey])
  useEffect(() => {
    document.title = language === 'en' ? 'Drehpunkt · Transport orders' : 'Drehpunkt · Aufträge'
    return () => { document.title = 'Drehpunkt' }
  }, [language])
  function saveFilters(next) {
    setLoading(true); setFilters(next)
    try { localStorage.setItem(orderListStorageKey(uid), JSON.stringify(next)); setStorageError(false) } catch { setStorageError(true) }
  }
  function change(key, value) { saveFilters({ ...filters, [key]: value }) }
  function sort(key) { change('sort', { key, direction: filters.sort.key === key && filters.sort.direction === 'asc' ? 'desc' : 'asc' }) }
  function next() { setLoading(true); setCursors(current => [...current.slice(0, pageIndex + 1), data.nextCursor]); setPageIndex(current => current + 1) }
  return <div className="order-record-list">
    <div className="list-toolbar"><div className="order-record-list__filters">
      <label><span><StaticText source="Aufträge suchen" /></span><input type="search" value={filters.search} maxLength={180} aria-label={language === 'en' ? 'Search transport orders' : 'Aufträge suchen'} placeholder={language === 'en' ? 'Order, reference, customer or carrier' : 'TA, Referenz, Kunde oder Unternehmer'} onChange={event => change('search', event.target.value)} /></label>
      <label><span><StaticText source="Relation" /></span><select aria-label={language === 'en' ? 'Dispatch team' : 'Relation'} value={filters.relation} onChange={event => change('relation', event.target.value)}><option value=""><StaticText source="Alle Relationen" /></option>{filters.relation && !relations.includes(filters.relation) && <option value={filters.relation}>{filters.relation}</option>}{relations.map(relation => <option key={relation} value={relation}>{relation}</option>)}</select></label>
      <label><span><StaticText source="Start von" /></span><input type="date" value={filters.loadingFrom} max={filters.loadingUntil || undefined} onChange={event => change('loadingFrom', event.target.value)} /></label>
      <label><span><StaticText source="Start bis" /></span><input type="date" value={filters.loadingUntil} min={filters.loadingFrom || undefined} onChange={event => change('loadingUntil', event.target.value)} /></label>
      <button className="button button--secondary" type="button" onClick={() => saveFilters(normalizeOrderListPreferences())}><StaticText source="Filter zurücksetzen" /></button>
    </div><div className="order-record-list__import-actions">{canEdit('transportOrderSingleImport') && <Link className="button order-record-list__import-button" to="/transportauftraege/import/einzel" target="_blank" rel="noopener"><StaticText source="Einzelimport" /></Link>}{canEdit('transportOrderBulkImport') && <Link className="button order-record-list__import-button" to="/transportauftraege/import/sammel" target="_blank" rel="noopener"><StaticText source="Sammelimport" /></Link>}</div></div>
    {relationsError && <p className="form-error" role="alert"><StaticText source="Relationen konnten nicht geladen werden." /> <button className="button button--secondary" type="button" onClick={() => setRelationsReload(value => value + 1)}><StaticText source="Erneut versuchen" /></button></p>}
    {storageError && <p className="form-error"><StaticText source="Die Listenansicht konnte auf diesem Gerät nicht gespeichert werden." /></p>}
    {error && <div className="form-error" role="alert"><p><StaticText source="Die Auftragsliste konnte nicht geladen werden." /></p><button type="button" className="button button--secondary" onClick={() => { setLoading(true); setReload(value => value + 1) }}><StaticText source="Erneut versuchen" /></button></div>}
    <div className="transport-orders-table-frame order-record-list__table"><table className="data-table transport-orders-table"><colgroup>{columns.map(([key]) => <col key={key} className={`order-record-list__column--${key}`} />)}</colgroup><thead><tr>{columns.map(([key, title]) => <th key={key} aria-sort={filters.sort.key !== key ? 'none' : filters.sort.direction === 'asc' ? 'ascending' : 'descending'}><button type="button" className="table-sort-button" onClick={() => sort(key)}><span><StaticText source={title} /></span><span className="table-sort-button__indicator" data-direction={filters.sort.key === key ? filters.sort.direction : 'none'} aria-hidden="true" /></button></th>)}</tr></thead><tbody>
      {pending ? <tr><td colSpan={columns.length}><StaticText source="Aufträge werden geladen …" /></td></tr> : !data.orders.length ? <tr><td colSpan={columns.length}><StaticText source="Keine Transportaufträge gefunden." /></td></tr> : data.orders.map(order => <tr key={order.id}>
        <td><Link className="order-record-list__row-link" to={transportOrderPath(order.id)} aria-label={language === 'en' ? `Open transport order ${order.externalNumber}` : `Transportauftrag ${order.externalNumber} öffnen`}>{order.externalNumber}</Link></td>
        <td><span className="order-record-list__cell-text" title={order.imported?.relation}>{order.imported?.relation || '—'}</span></td>
        <td><span className="order-record-list__cell-text" title={order.imported?.customer?.name}>{order.imported?.customer?.name || '—'}</span></td><td><span className="order-record-list__cell-text" title={order.imported?.carrier?.originalName}>{order.imported?.carrier?.originalName || '—'}</span></td>
        <td><span className="order-record-list__cell-text" title={order.imported?.loading?.city}>{order.imported?.loading?.city || '—'}</span><small>{formatTransportOrderWindowRange(order.imported?.loading?.window, language)}</small></td><td><span className="order-record-list__cell-text" title={order.imported?.unloading?.city}>{order.imported?.unloading?.city || '—'}</span><small>{formatTransportOrderWindowRange(order.imported?.unloading?.window, language)}</small></td>
      </tr>)}
    </tbody></table></div>
    <nav className="transport-orders-pagination" aria-label={language === 'en' ? 'Order pagination' : 'Auftragsseitennavigation'}><label className="transport-orders-pagination__page-size"><span><StaticText source="Einträge pro Seite" /></span><select value={filters.pageSize} onChange={event => change('pageSize', Number(event.target.value))}>{[25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label><div className="transport-orders-pagination__controls"><button type="button" className="button button--secondary transport-orders-pagination__button" disabled={pending || pageIndex === 0} onClick={() => { setLoading(true); setPageIndex(value => value - 1) }}><FaChevronLeft aria-hidden="true" /><span className="sr-only"><StaticText source="Zurück" /></span></button><span className="transport-orders-pagination__current"><StaticText source="Seite" /> <strong>{pageIndex + 1}</strong></span><button type="button" className="button button--secondary transport-orders-pagination__button" disabled={pending || !data.hasMore} onClick={next}><FaChevronRight aria-hidden="true" /><span className="sr-only"><StaticText source="Weiter" /></span></button></div></nav>
  </div>
}

export default function TransportOrdersPage() {
  const { user } = useAuth()
  return <OrderList key={user.uid} uid={user.uid} />
}
