import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { filterTransportOrders, linkTransportOrderToCase, listTransportOrderLinksForCase, searchTransportOrders, unlinkTransportOrderFromCase } from '../../lib/caseTransportLinks.js'

function orderLabel(order) {
  const imported = order?.imported || {}
  return [order?.externalNumber || imported.externalNumber || order?.id, imported.customer?.name, imported.carrier?.originalName].filter(Boolean).join(' · ')
}

export default function CaseTransportOrdersCard({ caseType, caseId, actor, canManage, canViewTransportOrders }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!canViewTransportOrders) { setLinks([]); setLoading(false); return }
    setLoading(true)
    try { setLinks(await listTransportOrderLinksForCase(caseType, caseId)); setError('') } catch { setError('Die verknüpften Transportaufträge konnten nicht geladen werden.') } finally { setLoading(false) }
  }

  useEffect(() => {
    let current = true
    if (!canViewTransportOrders) {
      Promise.resolve().then(() => { if (current) { setLinks([]); setLoading(false) } })
      return () => { current = false }
    }
    listTransportOrderLinksForCase(caseType, caseId).then((entries) => { if (current) { setLinks(entries); setError('') } }).catch(() => { if (current) setError('Die verknüpften Transportaufträge konnten nicht geladen werden.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [caseId, caseType, canViewTransportOrders])
  useEffect(() => {
    if (!open) return
    let current = true
    Promise.resolve().then(() => {
      if (current) setSearchLoading(true)
      return searchTransportOrders('')
    }).then((entries) => { if (current) setOrders(entries) }).catch(() => { if (current) setError('Die Transportaufträge konnten nicht geladen werden.') }).finally(() => { if (current) setSearchLoading(false) })
    return () => { current = false }
  }, [open])

  const visibleOrders = useMemo(() => {
    const linkedIds = new Set(links.map((link) => link.transportOrderId))
    return filterTransportOrders(orders, search).filter((order) => !linkedIds.has(order.id)).slice(0, 50)
  }, [links, orders, search])

  async function add(order) {
    setSaving(true)
    try { await linkTransportOrderToCase({ caseType, caseId, transportOrderId: order.id, actor }); await load(); setSearch('') } catch (caught) { setError(caught.message || 'Der Transportauftrag konnte nicht verknüpft werden.') } finally { setSaving(false) }
  }

  async function remove(link) {
    setSaving(true)
    try { await unlinkTransportOrderFromCase(link); await load() } catch (caught) { setError(caught.message || 'Die Verknüpfung konnte nicht gelöst werden.') } finally { setSaving(false) }
  }

  if (!canViewTransportOrders) return null
  return <section className="case-transport-orders"><div className="todo-detail-section-heading"><h3>Transportaufträge</h3>{canManage && <button className="button button--secondary" type="button" onClick={() => setOpen(true)}>Transportauftrag verknüpfen</button>}</div>
    {error && <p className="form-error">{error}</p>}
    {loading ? <p>Transportaufträge werden geladen …</p> : links.length ? <ul className="case-transport-orders__list">{links.map((link) => <li key={link.id}><Link to={`/transportauftraege/${encodeURIComponent(link.transportOrderId)}`}>{orderLabel(link.transportOrder)}</Link>{canManage && <button className="button button--secondary" type="button" disabled={saving} onClick={() => void remove(link)}>Verknüpfung lösen</button>}</li>)}</ul> : <p>Keine Transportaufträge verknüpft.</p>}
    {open && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false) }}><section className="damage-form-modal case-transport-orders__modal" role="dialog" aria-modal="true" aria-labelledby="case-transport-orders-modal-title"><header className="case-transport-orders__modal-header"><h2 id="case-transport-orders-modal-title">Transportauftrag verknüpfen</h2><button className="case-transport-orders__modal-close" type="button" disabled={saving} onClick={() => setOpen(false)} aria-label="Dialog schließen" title="Schließen">×</button></header><div className="case-transport-orders__modal-content"><label className="form-field"><span>TA-Nr., Kunde, Unternehmer oder Referenz suchen</span><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} /></label>{searchLoading ? <p>Transportaufträge werden geladen …</p> : <ul className="case-transport-orders__search-results">{visibleOrders.map((order) => <li key={order.id}><span>{orderLabel(order)}</span><button className="button" type="button" disabled={saving} onClick={() => void add(order)}>Verknüpfen</button></li>)}</ul>}{!searchLoading && !visibleOrders.length && <p>Keine passenden, noch nicht verknüpften Transportaufträge gefunden.</p>}</div><footer className="case-transport-orders__modal-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={() => setOpen(false)}>Schließen</button></footer></section></div>}
  </section>
}
