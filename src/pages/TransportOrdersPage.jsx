import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import { listTransportOrders } from '../lib/transportOrders.js'
import { formatTransportOrderWindow, sortTransportOrders, transportOrderPath } from '../lib/transportOrderPresentation.js'

const columns = [
  { key: 'externalNumber', label: 'TA-Nummer' }, { key: 'tracking', label: 'Sendungsverfolgung' },
  { key: 'loading', label: 'Ladestelle' }, { key: 'loadingFrom', label: 'Ladetermin frühestens' },
  { key: 'unloading', label: 'Entladestelle' }, { key: 'unloadingUntil', label: 'Entladetermin spätestens' },
  { key: 'customer', label: 'Kunde' }, { key: 'carrier', label: 'Unternehmer' }, { key: 'relation', label: 'Relation' },
]

export default function TransportOrdersPage() {
  const { canEdit } = usePermissions()
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: null, direction: 'asc' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { listTransportOrders().then(setOrders).catch(() => setError('Die Auftragsliste konnte nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.')).finally(() => setLoading(false)) }, [])
  const visibleOrders = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('de-DE')
    const filtered = needle ? orders.filter((order) => [order.externalNumber, order.imported?.customer?.name, order.imported?.customer?.debtorNumber, order.imported?.carrier?.originalName, order.imported?.customerReference, order.imported?.loading?.city, order.imported?.unloading?.city].filter(Boolean).join(' ').toLocaleLowerCase('de-DE').includes(needle)) : orders
    return sortTransportOrders(filtered, sort)
  }, [orders, search, sort])
  function toggleSort(key) { setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' })) }
  function renderSortableHeader({ key, label }) {
    const direction = sort.key === key ? sort.direction : 'none'
    return <th key={key} aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}><button className="table-sort-button" type="button" onClick={() => toggleSort(key)}><span>{label}</span><span className="table-sort-button__indicator" data-direction={direction} aria-hidden="true" /><span className="sr-only">{direction === 'none' ? ', sortieren' : `, aktuell ${direction === 'asc' ? 'aufsteigend' : 'absteigend'} sortiert`}</span></button></th>
  }
  const openOrder = (orderId) => window.open(transportOrderPath(orderId), '_blank', 'noopener')

  return <div className="transport-orders-page">
    <div className="list-toolbar"><div className="list-controls transport-orders-filters"><label className="search-field"><span className="sr-only">Transportaufträge suchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="TA-Nummer, Kunde oder Unternehmer suchen" /></label></div>{canEdit('dataImports') && <Link className="button" to="/transportauftraege/import">Transportaufträge importieren</Link>}</div>
    {error && <p className="form-error">{error}</p>}
    <div className="transport-orders-table-frame"><table className="data-table transport-orders-table transport-orders-table--list"><thead><tr>{columns.map(renderSortableHeader)}</tr></thead><tbody>{loading ? <tr><td className="table-state" colSpan={columns.length}>Transportaufträge werden geladen …</td></tr> : !visibleOrders.length ? <tr><td className="table-state" colSpan={columns.length}>{orders.length ? 'Keine Transportaufträge gefunden.' : 'Noch keine Transportaufträge importiert.'}</td></tr> : visibleOrders.map((order) => <tr className="transport-orders-table__row" key={order.id} role="link" tabIndex="0" aria-label={`TA ${order.externalNumber} in neuem Tab öffnen`} onClick={() => openOrder(order.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOrder(order.id) } }}>
      <td><strong>{order.externalNumber}</strong></td>
      <td>{order.tracking?.status || '—'}</td>
      <td title={order.imported?.loading?.city || ''}>{order.imported?.loading?.city || '—'}</td>
      <td>{formatTransportOrderWindow(order.imported?.loading?.window?.from)}</td>
      <td title={order.imported?.unloading?.city || ''}>{order.imported?.unloading?.city || '—'}</td>
      <td>{formatTransportOrderWindow(order.imported?.unloading?.window?.until)}</td>
      <td className="transport-orders-table__partner" title={order.imported?.customer?.name || ''}>{order.imported?.customer?.name || '—'}</td>
      <td className="transport-orders-table__partner" title={order.imported?.carrier?.originalName || ''}>{order.imported?.carrier?.originalName || '—'}</td>
      <td title={order.imported?.relation || ''}>{order.imported?.relation || '—'}</td>
    </tr>)}</tbody></table></div>
  </div>
}
