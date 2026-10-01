import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { listTransportOrdersPage } from '../../lib/transportOrders.js'

function orderNumber(order) { return String(order?.externalNumber || order?.imported?.externalNumber || order?.id || '').trim() }
function orderContext(order) {
  return [order?.imported?.customer?.name, order?.imported?.carrier?.originalName].filter(Boolean).join(' · ')
}

export default function TodoTransportOrderPicker({ autoFocus = false, canViewTransportOrders = false, disabled = false, onRemove, onSelect, transportOrderLinks = [] }) {
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultPosition, setResultPosition] = useState(null)
  const inputRef = useRef(null)
  const enabled = canViewTransportOrders && !disabled
  const selectedIds = new Set(transportOrderLinks.map((link) => link.id))

  useEffect(() => {
    const needle = search.trim()
    if (!enabled || !needle) return undefined
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      listTransportOrdersPage({ trackingStatus: 'all', search: needle, relation: '', loadingFrom: '', loadingUntil: '', sort: { key: 'externalNumber', direction: 'asc' } })
        .then((result) => { if (active) setMatches((result.orders || []).slice(0, 12)) })
        .catch(() => { if (active) { setMatches([]); setError('Die passenden Transportaufträge konnten nicht geladen werden.') } })
        .finally(() => { if (active) setLoading(false) })
    }, 180)
    return () => { active = false; window.clearTimeout(timer) }
  }, [enabled, search])

  useLayoutEffect(() => {
    if (!search.trim() || !inputRef.current) { setResultPosition(null); return undefined }
    function positionResults() {
      const rect = inputRef.current?.getBoundingClientRect()
      if (!rect) return
      const gap = 4
      const spaceAbove = rect.top - gap - 8
      const spaceBelow = window.innerHeight - rect.bottom - gap - 8
      const openAbove = spaceBelow < 210 && spaceAbove > spaceBelow
      const maxHeight = Math.max(96, Math.min(240, openAbove ? spaceAbove : spaceBelow))
      const availableWidth = window.innerWidth - rect.left - 8
      const width = Math.min(Math.max(rect.width, 260), availableWidth)
      setResultPosition({ left: rect.left, top: openAbove ? Math.max(8, rect.top - gap - maxHeight) : rect.bottom + gap, width, maxHeight })
    }
    positionResults()
    window.addEventListener('resize', positionResults)
    window.addEventListener('scroll', positionResults, true)
    return () => { window.removeEventListener('resize', positionResults); window.removeEventListener('scroll', positionResults, true) }
  }, [search])

  function select(order) {
    onSelect({ id: order.id, number: orderNumber(order) })
    setSearch('')
    setMatches([])
  }

  if (!canViewTransportOrders) {
    return <label className="form-field"><span><StaticText source={"TA-Nummer"} /></span><TranslatedProps sources={{"placeholder":"Kein Transportauftrag verknüpft"}}><input value={transportOrderLinks.map((link) => link.number).join(', ')} readOnly aria-readonly="true" placeholder="Kein Transportauftrag verknüpft" /></TranslatedProps></label>
  }

  return <div className="todo-transport-order-picker">
    <label className="form-field"><span><StaticText source={"TA-Nummer"} /></span><TranslatedProps sources={{"placeholder":"TA-Nummer eingeben"}}><input ref={inputRef} type="search" value={search} disabled={disabled} onChange={(event) => setSearch(event.target.value)} placeholder="TA-Nummer eingeben" autoFocus={autoFocus} autoComplete="off" aria-autocomplete="list" aria-controls="todo-transport-order-results" aria-expanded={Boolean(search.trim())} /></TranslatedProps></label>
    {transportOrderLinks.length > 0 && <div className="todo-transport-order-picker__selected"><span><StaticText source={"Verknüpft:"} /> {transportOrderLinks.map((link, index) => <span className="todo-transport-order-picker__tag" key={link.id}><strong>TA {link.number || link.id}</strong><TranslatedProps sources={{"title":"Verknüpfung entfernen"}}><button type="button" disabled={disabled} onClick={() => onRemove(link.id)} aria-label={`TA ${link.number || link.id} entfernen`} title="Verknüpfung entfernen">×</button></TranslatedProps>{<StaticText source={index < transportOrderLinks.length - 1 && ', '} />}</span>)}</span></div>}
    {search.trim() && resultPosition && createPortal(<TranslatedProps sources={{"aria-label":"Passende Transportaufträge"}}><div id="todo-transport-order-results" className="todo-transport-order-picker__results" style={resultPosition} role="listbox" aria-label="Passende Transportaufträge">{loading && <p><StaticText source={"Passende Transportaufträge werden gesucht …"} /></p>}{!loading && error && <p className="form-error">{<StaticText source={error} />}</p>}{!loading && !error && matches.filter((order) => !selectedIds.has(order.id)).map((order) => <button key={order.id} type="button" role="option" onClick={() => select(order)}><strong>TA {orderNumber(order)}</strong>{orderContext(order) && <span>{orderContext(order)}</span>}</button>)}{!loading && !error && !matches.some((order) => !selectedIds.has(order.id)) && <p><StaticText source={"Keine weiteren passenden Transportaufträge gefunden."} /></p>}</div></TranslatedProps>, document.body)}
  </div>
}
