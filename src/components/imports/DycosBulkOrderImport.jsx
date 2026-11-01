import { useEffect, useState, useSyncExternalStore } from 'react'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { searchDycosTransportOrders } from '../../lib/transportOrders.js'
import { createImportJob, importFinished } from '../../lib/dycosImportSession.js'
import { getDycosSearchRuntime } from '../../lib/dycosSearchRuntime.js'
import { DYCOS_EARLIEST_LOADING_DATE } from '../../../shared/dycosImportPolicy.js'
import DycosImportProgress from './DycosImportProgress.jsx'

const location = station => station ? [station.company, [station.country, station.postalCode, station.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—' : '—'
let relationCache = null

export default function DycosBulkOrderImport({ state: importState, onOpenHistory }) {
  const { uid, job, busy: importing, runtime: importer } = importState
  const runtime = getDycosSearchRuntime(uid), search = useSyncExternalStore(runtime.subscribe, runtime.snapshot)
  const [draft, setDraft] = useState(null)
  const from = draft?.from ?? search.query?.ladeDatumVon ?? '', until = draft?.until ?? search.query?.ladeDatumBis ?? '', relationId = draft?.relationId ?? (search.query?.relationId == null ? '' : String(search.query.relationId))
  const [relations, setRelations] = useState(relationCache || []), [relationError, setRelationError] = useState(false)
  const [error, setError] = useState('')
  const busy = importing || search.busy, selected = new Set(search.selected), activeJob = job && !importFinished(job)
  useEffect(() => { runtime.enter() }, [runtime])
  useEffect(() => {
    if (relationCache) return undefined
    let active = true
    void searchDycosTransportOrders({ modus: 'relationen' }).then(result => {
      if (!Array.isArray(result?.relations)) throw new Error('Invalid relations')
      relationCache = result.relations
      if (active) setRelations(result.relations)
    }).catch(() => { if (active) setRelationError(true) })
    return () => { active = false }
  }, [])
  function change(field, value) { setDraft(current => ({ from, until, relationId, ...current, [field]: value })); runtime.clear(); setError('') }
  function importSelection() {
    const next = createImportJob(search.orders.filter(order => selected.has(order.sourceId)).map(order => ({ taNummer: order.externalNumber, expectedSourceId: order.sourceId })), uid, 'bulk')
    setDraft(null)
    void importer.run(next)
  }
  function submit(event) {
    event.preventDefault()
    if (busy || activeJob) return
    const fields = new FormData(event.currentTarget), loadingFrom = String(fields.get('from') || ''), loadingUntil = String(fields.get('until') || ''), relation = String(fields.get('relation') || '')
    if (!loadingFrom || !loadingUntil || loadingFrom < DYCOS_EARLIEST_LOADING_DATE || loadingUntil < loadingFrom) { setError('Bitte einen Ladedatumsbereich ab dem 01.01.2026 angeben.'); return }
    void runtime.search({ ladeDatumVon: loadingFrom, ladeDatumBis: loadingUntil, relationId: relation === '' ? null : Number(relation) })
  }
  return <section className="import-preparation__section dycos-bulk-import dycos-import-compact">
    <h2><StaticText source="Sammelimport" /></h2>
    {!activeJob && <form className="dycos-order-fetch__form" onSubmit={submit}>
      <label className="form-field"><span><StaticText source="Ladedatum von" /></span><input name="from" type="date" required min={DYCOS_EARLIEST_LOADING_DATE} value={from} disabled={busy} onChange={event => change('from', event.target.value)} /></label>
      <label className="form-field"><span><StaticText source="Ladedatum bis" /></span><input name="until" type="date" required min={from || DYCOS_EARLIEST_LOADING_DATE} value={until} disabled={busy} onChange={event => change('until', event.target.value)} /></label>
      <label className="form-field"><span><StaticText source="Relation (optional)" /></span><select name="relation" value={relationId} disabled={busy} onChange={event => change('relationId', event.target.value)}><option value=""><StaticText source="Alle Relationen" /></option>{relations.map(relation => <option key={relation.id} value={relation.id}>{relation.label}</option>)}</select></label>
      <button className="button" type="submit" disabled={busy}><StaticText source="Aufträge suchen" /></button>
    </form>}
    {relationError && <p className="dycos-bulk-import__hint"><StaticText source="Die Relationsliste konnte nicht geladen werden. Die Suche ohne Relationsfilter ist weiterhin möglich." /></p>}
    {(error || search.error) && <p className="form-error" role="alert"><StaticText source={error || search.error} /></p>}
    {search.busy && <div className="dycos-bulk-import__actions"><p role="status"><StaticText source="Aufträge werden gesucht …" /> {search.orders.length}</p><button className="button button--secondary" type="button" onClick={() => runtime.pause()}><StaticText source="Nach laufendem Abruf anhalten" /></button></div>}
    {search.searched && !activeJob && <>
      <div className="dycos-bulk-import__actions">
        <label className="dycos-bulk-import__select-all"><input type="checkbox" checked={Boolean(search.orders.length) && selected.size === search.orders.length && !search.hasMore} disabled={busy || !search.orders.length} onChange={event => { if (!event.target.checked) runtime.select([]); else if (search.hasMore) void runtime.search(search.query, { more: true, all: true }); else runtime.select(search.orders.map(order => order.sourceId)) }} /><StaticText source="Alle markieren" /></label>
        <span>{search.orders.length} <StaticText source="geladen" /> · {selected.size} <StaticText source="ausgewählt" /></span>
        {search.hasMore && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void runtime.search(search.query, { more: true })}><StaticText source="Weitere Aufträge laden" /></button>}
        <button className="button" type="button" disabled={busy || !selected.size || Boolean(search.error)} onClick={importSelection}><StaticText source="Ausgewählte importieren" /> ({selected.size})</button>
      </div>
      {!search.orders.length ? <p><StaticText source="Keine passenden Transportaufträge gefunden." /></p> : <div className="transport-orders-table-frame"><table className="data-table dycos-bulk-import__table"><thead><tr>{['Auswahl', 'TA-Nummer', 'Relation', 'Kunde', 'Unternehmer', 'Erste Ladestelle', 'Letzte Entladestelle'].map(label => <th key={label}><StaticText source={label} /></th>)}</tr></thead><tbody>{search.orders.map(order => <tr key={order.sourceId}>
        <td><label><input type="checkbox" checked={selected.has(order.sourceId)} disabled={busy} onChange={event => { const next = new Set(selected); if (event.target.checked) next.add(order.sourceId); else next.delete(order.sourceId); runtime.select([...next]) }} /><span className="sr-only">TA {order.externalNumber}</span></label></td>
        <td><strong>{order.externalNumber}</strong><small>{order.loadingDate}</small>{order.existing && <small><StaticText source="Bereits vorhanden" /></small>}</td><td>{order.relation || '—'}</td><td>{order.customer || '—'}</td><td>{order.carrier || '—'}</td><td>{location(order.loading)}</td><td>{location(order.unloading)}</td>
      </tr>)}</tbody></table></div>}
    </>}
    <DycosImportProgress state={importState} onOpenHistory={onOpenHistory} />
  </section>
}
