import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth.js'
import { usePermissions } from '../../auth/usePermissions.js'
import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { fetchDycosTransportOrder, searchDycosTransportOrders } from '../../lib/transportOrders.js'
import { appendDycosSearchPage, bulkImportComplete, bulkImportCounts, createDycosBulkJob, readDycosBulkJob, runDycosBulkImport } from '../../lib/dycosBulkImport.js'
import { dycosImportWarnings } from '../../lib/dycosOrderFetchFeedback.js'
import { transportOrderPath } from '../../lib/transportOrderPresentation.js'
import { DYCOS_EARLIEST_LOADING_DATE } from '../../../shared/dycosImportPolicy.js'

const labels = { pending: 'Ausstehend', running: 'Wird importiert …', failed: 'Fehlgeschlagen', new: 'Neu angelegt', updated: 'Aktualisiert', unchanged: 'Unverändert' }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const location = station => station ? [station.company, [station.country, station.postalCode, station.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—' : '—'
const searchError = error => ['functions/permission-denied', 'functions/unauthenticated'].includes(error?.code) ? 'Keine Berechtigung für die Suche. Bitte die Anmeldung prüfen.'
  : error?.code === 'functions/failed-precondition' ? 'Die Vorschau ist zu umfangreich. Bitte den Zeitraum verkleinern.'
    : error?.code === 'functions/resource-exhausted' ? 'Zu viele Suchanfragen. Bitte kurz warten und erneut versuchen.'
      : error instanceof Error && !error.code ? error.message : 'Die DyCoS-Suche ist fehlgeschlagen. Bitte erneut versuchen.'

export default function DycosBulkOrderImport(props) {
  const { user } = useAuth()
  return <BulkOrderImport key={user?.uid || 'anonymous'} {...props} />
}

function BulkOrderImport({ onImported, onBusyChange, disabled = false }) {
  const { user } = useAuth(), { canEdit, canView } = usePermissions()
  const uid = user?.uid || '', allowed = canEdit('dataImports')
  const storageKey = `drehpunkt:dycos-bulk:${uid}`
  const [from, setFrom] = useState(today), [until, setUntil] = useState(today), [relationId, setRelationId] = useState('')
  const [relations, setRelations] = useState([]), [relationsError, setRelationsError] = useState(false)
  const [relationsLoading, setRelationsLoading] = useState(true)
  const [orders, setOrders] = useState([]), [selected, setSelected] = useState(new Set()), [query, setQuery] = useState(null)
  const [cursor, setCursor] = useState(0), [hasMore, setHasMore] = useState(false), [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false), [importing, setImporting] = useState(false), [waiting, setWaiting] = useState(false)
  const [error, setError] = useState(''), [job, setJob] = useState(null), [storageError, setStorageError] = useState('')
  const mounted = useRef(true), stop = useRef(false), operation = useRef(false), currentUser = useRef(uid), currentAllowed = useRef(allowed)
  const busy = searching || importing

  useEffect(() => { currentUser.current = uid; currentAllowed.current = allowed }, [uid, allowed])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true } }, [])
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false) }, [busy, onBusyChange])
  useEffect(() => {
    if (!allowed || !uid) return undefined
    let active = true
    void Promise.resolve().then(() => {
      try { const restored = readDycosBulkJob(localStorage, storageKey, uid); if (active) { setJob(restored); setStorageError('') } }
      catch { if (active) setStorageError('Der gespeicherte Importfortschritt konnte nicht geladen werden. Bitte die lokale Auswahl verwerfen und erneut beginnen.') }
    })
    return () => { active = false }
  }, [allowed, uid, storageKey])
  useEffect(() => {
    if (!allowed) return undefined
    let active = true
    void searchDycosTransportOrders({ modus: 'relationen' }).then(result => {
      if (!Array.isArray(result?.relations)) throw new Error('Invalid relations')
      if (active) { setRelations(result.relations); setRelationsError(false) }
    }).catch(() => { if (active) setRelationsError(true) }).finally(() => { if (active) setRelationsLoading(false) })
    return () => { active = false }
  }, [allowed])
  useEffect(() => {
    if (!importing) return undefined
    const prevent = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [importing])

  const interrupted = () => !mounted.current || stop.current || currentUser.current !== uid || !currentAllowed.current
  function resetSelection() { setOrders([]); setSelected(new Set()); setQuery(null); setHasMore(false); setCursor(0); setSearched(false); setError('') }
  async function search({ more = false, all = false } = {}) {
    if (operation.current || disabled || !allowed || importing) return
    const nextQuery = more ? query : { ladeDatumVon: from, ladeDatumBis: until, relationId: relationId === '' ? null : Number(relationId) }
    if (!nextQuery || nextQuery.ladeDatumVon < DYCOS_EARLIEST_LOADING_DATE || nextQuery.ladeDatumBis < nextQuery.ladeDatumVon) { setError('Bitte einen Ladedatumsbereich ab dem 01.01.2026 angeben.'); return }
    operation.current = true; stop.current = false; setSearching(true); setError('')
    let values = more ? orders : [], nextCursor = more ? cursor : 0, nextMore = true
    if (!more) { setOrders([]); setSelected(new Set()); setQuery(nextQuery); setSearched(false) }
    try {
      do {
        const response = await searchDycosTransportOrders({ ...nextQuery, nachId: nextCursor })
        if (!mounted.current || currentUser.current !== uid || !currentAllowed.current) break
        values = appendDycosSearchPage(values, response, nextCursor); nextCursor = response.nextCursor ?? nextCursor; nextMore = response.hasMore
        setOrders(values); setCursor(nextCursor); setHasMore(nextMore); setSearched(true)
      } while (all && nextMore && !interrupted())
      if (all && !nextMore && !interrupted()) setSelected(new Set(values.map(order => order.sourceId)))
    } catch (caught) { if (mounted.current && currentUser.current === uid) setError(searchError(caught)) }
    finally { operation.current = false; if (mounted.current) setSearching(false) }
  }
  function persist(next) {
    localStorage.setItem(storageKey, JSON.stringify(next))
    if (mounted.current && currentUser.current === uid) setJob(next)
  }
  async function importOrders(nextJob) {
    if (operation.current || disabled || !allowed || !uid) return
    try { persist(nextJob) } catch { setStorageError('Der Importfortschritt konnte nicht gespeichert werden. Bitte freien Browserspeicher prüfen.'); return }
    operation.current = true; stop.current = false; setImporting(true); setError(''); setStorageError('')
    try {
      await runDycosBulkImport(nextJob, { fetchOrder: fetchDycosTransportOrder, onChange: persist, shouldStop: interrupted, onWaiting: value => { if (mounted.current) setWaiting(value) } })
    } catch { if (mounted.current) setError('Der Import wurde angehalten. Bitte den gespeicherten Import fortsetzen; bestätigte Übernahmen werden erkannt.') }
    finally { operation.current = false; if (mounted.current) { setImporting(false); setWaiting(false); onImported?.() } }
  }
  function discardJob() {
    try { localStorage.removeItem(storageKey); setJob(null); setStorageError('') } catch { setStorageError('Die lokale Auswahl konnte nicht verworfen werden.') }
  }
  const counts = bulkImportCounts(job), done = (counts.new || 0) + (counts.updated || 0) + (counts.unchanged || 0)
  const unfinished = job && !bulkImportComplete(job)
  const allSelected = orders.length > 0 && selected.size === orders.length && !hasMore
  if (!allowed) return null
  return <section className="import-preparation__section dycos-bulk-import" aria-labelledby="dycos-bulk-title">
    <div className="import-preparation__heading"><h2 id="dycos-bulk-title"><StaticText source="Transportaufträge gesammelt aus DyCoS übernehmen" /></h2><p><StaticText source="Nach Ladedatum ab Januar 2026 suchen, Aufträge auswählen und gesammelt importieren." /></p></div>
    <form className="dycos-order-fetch__form" onSubmit={event => { event.preventDefault(); void search() }}>
      <label className="form-field"><span><StaticText source="Ladedatum von" /></span><input type="date" required min={DYCOS_EARLIEST_LOADING_DATE} value={from} disabled={busy || disabled} onChange={event => { setFrom(event.target.value); resetSelection() }} /></label>
      <label className="form-field"><span><StaticText source="Ladedatum bis" /></span><input type="date" required min={from || DYCOS_EARLIEST_LOADING_DATE} value={until} disabled={busy || disabled} onChange={event => { setUntil(event.target.value); resetSelection() }} /></label>
      <label className="form-field"><span><StaticText source="Relation (optional)" /></span><select value={relationId} disabled={busy || disabled} onChange={event => { setRelationId(event.target.value); resetSelection() }}><option value=""><StaticText source="Alle Relationen" /></option>{relations.map(relation => <option key={relation.id} value={relation.id}>{relation.label}</option>)}</select></label>
      <button className="button" type="submit" disabled={busy || disabled || relationsLoading}><StaticText source="Aufträge suchen" /></button>
    </form>
    {relationsError && <p className="form-error"><StaticText source="Die Relationsliste konnte nicht geladen werden. Die Suche ohne Relationsfilter ist weiterhin möglich." /></p>}
    {relationsLoading && <p role="status"><StaticText source="Relationen werden geladen …" /></p>}
    {(error || storageError) && <p className="form-error" role="alert"><StaticText source={error || storageError} /></p>}
    {searching && <div className="dycos-bulk-import__actions" role="status"><span><StaticText source="Aufträge werden gesucht … Geladene Treffer:" /> {orders.length}</span><button className="button button--secondary" type="button" onClick={() => { stop.current = true }}><StaticText source="Nach laufendem Abruf anhalten" /></button></div>}
    {searched && <>
      <div className="dycos-bulk-import__actions">
        <label className="dycos-bulk-import__select-all"><input type="checkbox" checked={allSelected} disabled={busy || disabled || !orders.length} onChange={event => { if (!event.target.checked) setSelected(new Set()); else if (hasMore) void search({ more: true, all: true }); else setSelected(new Set(orders.map(order => order.sourceId))) }} /><StaticText source="Alle markieren" /></label>
        <span>{orders.length} <StaticText source="geladen" /> · {selected.size} <StaticText source="ausgewählt" /></span>
        {hasMore && <button className="button button--secondary" type="button" disabled={busy || disabled} onClick={() => void search({ more: true })}><StaticText source="Weitere Aufträge laden" /></button>}
        <button className="button" type="button" disabled={busy || disabled || unfinished || Boolean(storageError) || !selected.size} onClick={() => void importOrders(createDycosBulkJob(orders.filter(order => selected.has(order.sourceId)), uid))}><StaticText source="Ausgewählte importieren" /> ({selected.size})</button>
      </div>
      {hasMore && <p className="dycos-bulk-import__hint"><StaticText source="Weitere Treffer vorhanden. „Alle markieren“ lädt zuerst sämtliche Treffer und markiert sie anschließend." /></p>}
      {!orders.length ? <p><StaticText source="Keine passenden Transportaufträge gefunden." /></p> : <div className="transport-orders-table-frame"><table className="data-table dycos-bulk-import__table"><thead><tr><th><StaticText source="Auswahl" /></th><th><StaticText source="TA-Nummer" /></th><th><StaticText source="Kunde" /></th><th><StaticText source="Unternehmer" /></th><th><StaticText source="Erste Ladestelle" /></th><th><StaticText source="Letzte Entladestelle" /></th></tr></thead><tbody>{orders.map(order => <tr key={order.sourceId}><td><TranslatedProps sources={{ 'aria-label': 'Auftrag auswählen' }}><input type="checkbox" aria-label="Auftrag auswählen" aria-describedby={`dycos-bulk-ta-${order.sourceId}`} checked={selected.has(order.sourceId)} disabled={busy || disabled} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(order.sourceId); else next.delete(order.sourceId); return next })} /></TranslatedProps></td><td id={`dycos-bulk-ta-${order.sourceId}`}><strong>{order.externalNumber}</strong><small>{order.loadingDate}</small>{order.existing && <small><StaticText source="Bereits vorhanden" /></small>}</td><td>{order.customer || '—'}</td><td>{order.carrier || '—'}</td><td>{location(order.loading)}</td><td>{location(order.unloading)}</td></tr>)}</tbody></table></div>}
    </>}
    {job && <div className="dycos-bulk-import__progress">
      <h3><StaticText source="Sammelimport" /></h3>
      <p role="status">{done} / {job.items.length} <StaticText source="erfolgreich übernommen" /> · {counts.failed || 0} <StaticText source="fehlgeschlagen" />{waiting && <> · <StaticText source="Abruflimit erreicht. Der Import wird automatisch fortgesetzt." /></>}</p>
      <TranslatedProps sources={{ 'aria-label': 'Importfortschritt' }}><progress max={job.items.length} value={done + (counts.failed || 0)} /></TranslatedProps>
      <p className="dycos-bulk-import__hint"><StaticText source="Die Seite während des Imports geöffnet lassen. Nach einer Unterbrechung kann die gespeicherte Auswahl in diesem Browser fortgesetzt werden." /></p>
      <div className="dycos-bulk-import__actions">
        {importing ? <button className="button button--secondary" type="button" onClick={() => { stop.current = true }}><StaticText source="Nach laufendem Auftrag pausieren" /></button> : <>
          {unfinished && job.items.some(item => item.status === 'pending') && <button className="button" type="button" disabled={busy || disabled} onClick={() => void importOrders(job)}><StaticText source="Import fortsetzen" /></button>}
          {counts.failed > 0 && <button className="button" type="button" disabled={busy || disabled} onClick={() => void importOrders({ ...job, items: job.items.map(item => item.status === 'failed' ? { ...item, status: 'pending', error: '' } : item) })}><StaticText source="Fehlgeschlagene erneut versuchen" /></button>}
          <button className="button button--secondary" type="button" disabled={busy || disabled} onClick={discardJob}><StaticText source="Lokale Auswahl verwerfen" /></button>
        </>}
      </div>
      <div className="transport-orders-table-frame"><table className="data-table dycos-bulk-import__results"><thead><tr><th><StaticText source="TA-Nummer" /></th><th><StaticText source="Ergebnis" /></th></tr></thead><tbody>{job.items.map(item => <tr key={item.requestId}><td>{item.orderId && canView('transportOrders') ? <Link to={transportOrderPath(item.orderId)}>{item.taNummer}</Link> : item.taNummer}</td><td><StaticText source={labels[item.status]} />{item.error && <p className="form-error"><StaticText source={item.error} /></p>}{dycosImportWarnings(item).map(message => <p className="dycos-bulk-import__hint" key={message}><StaticText source={message} /></p>)}</td></tr>)}</tbody></table></div>
    </div>}
    {storageError && !job && <button className="button button--secondary" type="button" disabled={busy} onClick={discardJob}><StaticText source="Lokale Auswahl verwerfen" /></button>}
  </section>
}
