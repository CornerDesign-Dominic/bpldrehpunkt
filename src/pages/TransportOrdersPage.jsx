import { useEffect, useState } from 'react'
import { StaticText } from '../i18n/AutoTranslate.jsx'
import { useLanguage } from '../i18n/useLanguage.js'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import Link from '../components/ui/ContextLink.jsx'
import { listTransportOrderRecordsPage } from '../lib/transportOrderWorkspace.js'
import { normalizeOrderListPreferences, orderListStorageKey } from '../lib/orderListPreferences.js'
import { formatTransportOrderWindow, transportOrderPath } from '../lib/transportOrderPresentation.js'
import '../styles/transportOrderList.css'

const columns = [['externalNumber', 'Auftrag / Referenz'], ['customer', 'Kunde'], ['carrier', 'Unternehmer'], ['relation', 'Relation'], ['loadingFrom', 'Laden'], ['unloadingUntil', 'Entladen']]

function OrderList({ uid }) {
  const { language } = useLanguage()
  const { canEdit } = usePermissions()
  const [storageError, setStorageError] = useState(false)
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
      <label><span><StaticText source="Relation" /></span><input value={filters.relation} maxLength={180} onChange={event => change('relation', event.target.value)} /></label>
      <label><span><StaticText source="Start von" /></span><input type="date" value={filters.loadingFrom} max={filters.loadingUntil || undefined} onChange={event => change('loadingFrom', event.target.value)} /></label>
      <label><span><StaticText source="Start bis" /></span><input type="date" value={filters.loadingUntil} min={filters.loadingFrom || undefined} onChange={event => change('loadingUntil', event.target.value)} /></label>
      <button className="button button--secondary" type="button" onClick={() => saveFilters(normalizeOrderListPreferences())}><StaticText source="Filter zurücksetzen" /></button>
    </div>{canEdit('dataImports') && <Link className="button" to="/transportauftraege/import"><StaticText source="Transportaufträge importieren" /></Link>}</div>
    {storageError && <p className="form-error"><StaticText source="Die Listenansicht konnte auf diesem Gerät nicht gespeichert werden." /></p>}
    {error && <div className="form-error" role="alert"><p><StaticText source="Die Auftragsliste konnte nicht geladen werden." /></p><button type="button" className="button button--secondary" onClick={() => { setLoading(true); setReload(value => value + 1) }}><StaticText source="Erneut versuchen" /></button></div>}
    <div className="order-record-list__table"><table className="data-table"><thead><tr>{columns.map(([key, title]) => <th key={key} aria-sort={filters.sort.key !== key ? 'none' : filters.sort.direction === 'asc' ? 'ascending' : 'descending'}><button type="button" className="table-sort-button" onClick={() => sort(key)}><StaticText source={title} />{filters.sort.key === key && (filters.sort.direction === 'asc' ? ' ↑' : ' ↓')}</button></th>)}<th><StaticText source="Sendungsverfolgung" /></th></tr></thead><tbody>
      {pending ? <tr><td colSpan={7}><StaticText source="Aufträge werden geladen …" /></td></tr> : !data.orders.length ? <tr><td colSpan={7}><StaticText source="Keine Transportaufträge gefunden." /></td></tr> : data.orders.map(order => <tr key={order.id}>
        <td><Link to={transportOrderPath(order.id)}>{order.externalNumber}</Link><small>{order.imported?.customerReference || '—'}</small></td>
        <td>{order.imported?.customer?.name || '—'}</td><td>{order.imported?.carrier?.originalName || '—'}</td><td>{order.imported?.relation || '—'}</td>
        <td>{order.imported?.loading?.city || '—'}<small>{formatTransportOrderWindow(order.imported?.loading?.window?.from)}</small></td><td>{order.imported?.unloading?.city || '—'}<small>{formatTransportOrderWindow(order.imported?.unloading?.window?.until)}</small></td>
        <td><Link to={`/sendungsverfolgung/${encodeURIComponent(order.id)}`}><StaticText source="Verfolgung öffnen" /></Link></td>
      </tr>)}
    </tbody></table></div>
    <nav className="order-record-list__pagination" aria-label={language === 'en' ? 'Order pagination' : 'Auftragsseitennavigation'}><label><StaticText source="Einträge pro Seite" /> <select value={filters.pageSize} onChange={event => change('pageSize', Number(event.target.value))}>{[25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label><button type="button" className="button button--secondary" disabled={pending || pageIndex === 0} onClick={() => { setLoading(true); setPageIndex(value => value - 1) }}><StaticText source="Zurück" /></button><span><StaticText source="Seite" /> {pageIndex + 1}</span><button type="button" className="button button--secondary" disabled={pending || !data.hasMore} onClick={next}><StaticText source="Weiter" /></button></nav>
  </div>
}

export default function TransportOrdersPage() {
  const { user } = useAuth()
  return <OrderList key={user.uid} uid={user.uid} />
}
