import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EditIcon } from '../icons.jsx'
import TodoTransportOrderPicker from '../todos/TodoTransportOrderPicker.jsx'
import { linkTransportOrderToCase, listTransportOrderLinksForCase, unlinkTransportOrderFromCase } from '../../lib/caseTransportLinks.js'

function orderNumber(order) {
  return String(order?.externalNumber || order?.imported?.externalNumber || order?.id || '').trim()
}

export default function CaseTransportOrdersCard({ caseType, caseId, actor, canManage, canViewTransportOrders }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
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
  const transportOrderLinks = useMemo(() => links.map((link) => ({ id: link.transportOrderId, number: orderNumber(link.transportOrder) })), [links])

  async function add(order) {
    setSaving(true)
    try { await linkTransportOrderToCase({ caseType, caseId, transportOrderId: order.id, actor }); await load() } catch (caught) { setError(caught.message || 'Der Transportauftrag konnte nicht verknüpft werden.') } finally { setSaving(false) }
  }

  async function remove(transportOrderId) {
    const link = links.find((entry) => entry.transportOrderId === transportOrderId)
    if (!link) return
    setSaving(true)
    try { await unlinkTransportOrderFromCase(link); await load() } catch (caught) { setError(caught.message || 'Die Verknüpfung konnte nicht gelöst werden.') } finally { setSaving(false) }
  }

  if (!canViewTransportOrders) return null
  return <section className="case-transport-orders"><div className="todo-detail-section-heading"><h3><StaticText source={"Verknüpfungen"} /></h3>{canManage && <TranslatedProps sources={{"aria-label":"Transportaufträge bearbeiten","title":"Transportaufträge bearbeiten"}}><button className="todo-detail-section-edit" type="button" onClick={() => setOpen(true)} aria-label="Transportaufträge bearbeiten" title="Transportaufträge bearbeiten"><EditIcon size={14} /></button></TranslatedProps>}</div>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    <dl className="case-transport-orders__details"><div><dt><StaticText source={"TA-Nummern"} /></dt><dd>{loading ? <StaticText source="Transportaufträge werden geladen …" /> : transportOrderLinks.length ? transportOrderLinks.map((link, index) => <span key={link.id}>{<StaticText source={index > 0 && ', '} />}<Link to={`/transportauftraege/${encodeURIComponent(link.id)}`}>TA {link.number || link.id}</Link></span>) : '—'}</dd></div></dl>
    {open && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false) }}><section className="damage-form-modal case-transport-orders__modal" role="dialog" aria-modal="true" aria-labelledby="case-transport-orders-modal-title"><header className="case-transport-orders__modal-header"><h2 id="case-transport-orders-modal-title"><StaticText source={"Transportaufträge verknüpfen"} /></h2><TranslatedProps sources={{"aria-label":"Dialog schließen","title":"Schließen"}}><button className="case-transport-orders__modal-close" type="button" disabled={saving} onClick={() => setOpen(false)} aria-label="Dialog schließen" title="Schließen">×</button></TranslatedProps></header><div className="case-transport-orders__modal-content"><p><StaticText source={"TA-Nummer eingeben und passenden Transportauftrag auswählen."} /></p><TodoTransportOrderPicker autoFocus canViewTransportOrders disabled={saving} onRemove={(transportOrderId) => void remove(transportOrderId)} onSelect={(order) => void add(order)} transportOrderLinks={transportOrderLinks} /></div><footer className="case-transport-orders__modal-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={() => setOpen(false)}><StaticText source={"Fertig"} /></button></footer></section></div>}
  </section>
}
