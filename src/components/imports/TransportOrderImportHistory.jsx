import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { listTransportOrderImportRuns, manageTransportOrderImport } from '../../lib/transportOrders.js'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { usePermissions } from '../../auth/usePermissions.js'
import { transportOrderPath } from '../../lib/transportOrderPresentation.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'

const formatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const title = run => run.kind === 'bulk' ? 'Sammelimport' : run.kind === 'refresh' ? 'Auftragsaktualisierung' : run.kind === 'single' ? 'Einzelimport' : run.fileName || 'Früherer CSV-Import'
const status = run => ({ running: 'Offen', completed: 'Erfolgreich', partial: 'Mit Fehlern', cancelled: 'Beendet' })[run.status] || run.status
const historyError = (error, fallback) => {
  void reportTechnicalFailure({ module: 'website', stage: 'transport-orders', error })
  return error?.code === 'functions/permission-denied' ? 'Keine Berechtigung für diesen Importverlauf.' : fallback
}

function RunDialog({ children, onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement
    element.showModal()
    return () => { element.close(); previous?.focus() }
  }, [])
  return createPortal(<dialog ref={dialog} className="record-history-modal transport-order-import-dialog" aria-labelledby="order-import-detail-title" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>{children}</dialog>, document.body)
}

export default function TransportOrderImportHistory({ kind, scope = 'own', revision, openRequest, onResume, busy }) {
  const { canView } = usePermissions()
  const [runs, setRuns] = useState([]), [loading, setLoading] = useState(true), [cursor, setCursor] = useState(null), [more, setMore] = useState(false)
  const [error, setError] = useState(''), [detail, setDetail] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const generation = useRef(0), detailGeneration = useRef(0)
  const open = useCallback(async runId => {
    const generation = ++detailGeneration.current
    setDetail({ loading: true }); setError('')
    try { const result = await listTransportOrderImportRuns({ kind, scope, runId }); if (generation === detailGeneration.current) setDetail(result) }
    catch (caught) { if (generation === detailGeneration.current) { setDetail(null); setError(historyError(caught, 'Die Importdetails konnten nicht geladen werden.')) } }
  }, [kind, scope])
  useEffect(() => {
    const current = ++generation.current
    const listGeneration = generation
    void Promise.resolve().then(() => { if (current === generation.current) setLoading(true); return listTransportOrderImportRuns({ kind, scope }) }).then(result => { if (current === generation.current) { setRuns(result.runs); setCursor(result.cursor); setMore(result.hasMore); setError('') } })
      .catch(caught => { if (current === generation.current) setError(historyError(caught, 'Der Importverlauf konnte nicht geladen werden.')) })
      .finally(() => { if (current === generation.current) setLoading(false) })
    return () => { listGeneration.current++ }
  }, [kind, scope, revision, refresh])
  useEffect(() => { const modalGeneration = detailGeneration; return () => { modalGeneration.current++ } }, [])
  useEffect(() => { let active = true; if (openRequest?.id) void Promise.resolve().then(() => { if (active) return open(openRequest.id) }); return () => { active = false } }, [open, openRequest])
  async function loadMore() {
    if (loading) return
    const current = generation.current
    setLoading(true)
    try { const result = await listTransportOrderImportRuns({ kind, scope, cursor }); if (current === generation.current) { setRuns(previous => [...new Map([...previous, ...result.runs].map(run => [run.id, run])).values()]); setCursor(result.cursor); setMore(result.hasMore) } }
    catch (caught) { setError(historyError(caught, 'Weitere Einträge konnten nicht geladen werden.')) }
    finally { if (current === generation.current) setLoading(false) }
  }
  const close = () => { detailGeneration.current++; setDetail(null) }
  async function discard() {
    try { await manageTransportOrderImport({ action: 'discard', runId: detail.run.id }); setRefresh(value => value + 1); await open(detail.run.id) }
    catch (caught) { setError(historyError(caught, 'Der Vorgang konnte nicht beendet werden.')) }
  }
  return <section className="import-preparation__section transport-order-import-history">
    <div className="import-preparation__heading"><h2><StaticText source={scope === 'all' ? 'Gemeinsamer Importverlauf' : 'Mein Importverlauf'} /></h2><button className="button button--secondary" type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}><StaticText source="Verlauf aktualisieren" /></button></div>
    {error && <p className="form-error" role="alert"><StaticText source={error} /></p>}
    {!loading && !runs.length && <p><StaticText source="Noch keine Importvorgänge vorhanden." /></p>}
    <div className="transport-order-import-history__list">{runs.map(run => <button className="transport-order-import-history__row" key={run.id} type="button" onClick={() => void open(run.id)}>
      <span className="transport-order-import-history__file"><strong><StaticText source={title(run)} />{run.externalNumber ? ` · TA ${run.externalNumber}` : ` · ${run.total}`}</strong><small>{run.importedAt ? formatter.format(new Date(run.importedAt)) : '—'} · {run.importedByName} · <StaticText source={status(run)} /></small></span>
      <span><StaticText source="Fehlerhaft" /><strong>{run.counts.Fehlerhaft || 0}</strong></span><span><StaticText source="Aktualisiert" /><strong>{run.counts.Aktualisiert || 0}</strong></span><span><StaticText source="Neu" /><strong>{run.counts.Neu || 0}</strong></span><span aria-hidden="true">›</span>
    </button>)}</div>
    {loading && <p role="status"><StaticText source="Importverlauf wird geladen …" /></p>}
    {more && <button className="button button--secondary" type="button" disabled={loading} onClick={() => void loadMore()}><StaticText source="Mehr anzeigen" /></button>}
    {detail && <RunDialog onClose={close}>
      <section className="customer-import-modal transport-order-import-result-modal">
        <div className="customer-import-modal__heading"><h2 id="order-import-detail-title"><StaticText source={detail.loading ? 'Importdetails werden geladen …' : title(detail.run)} /></h2><button className="button button--secondary" type="button" onClick={close}><StaticText source="Schließen" /></button></div>
        {!detail.loading && <><p>{detail.run.importedAt ? formatter.format(new Date(detail.run.importedAt)) : '—'} · {detail.run.importedByName} · <StaticText source={status(detail.run)} /></p>
          <div className="transport-orders-table-frame"><table className="data-table"><thead><tr><th><StaticText source="TA-Nummer" /></th><th><StaticText source="Ergebnis" /></th><th><StaticText source="Hinweise" /></th></tr></thead><tbody>{detail.rows.map(row => <tr key={row.id}><td>{row.orderId && canView('transportOrders') ? <Link to={transportOrderPath(row.orderId)} target="_blank" rel="noopener">{row.externalNumber}</Link> : row.externalNumber || `Zeile ${row.rowNumber}`}</td><td><StaticText source={row.status} /></td><td>{(row.errors || row.changedFields || []).join(' · ') || [row.customerName, row.carrierName].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody></table></div>
          {detail.resume && onResume && <div className="dycos-bulk-import__actions"><button className="button" type="button" disabled={busy} onClick={() => { onResume(detail); close() }}><StaticText source="Offene und fehlgeschlagene Aufträge fortsetzen" /></button><button className="button button--secondary" type="button" disabled={busy} onClick={() => void discard()}><StaticText source="Vorgang beenden" /></button></div>}
        </>}
      </section>
    </RunDialog>}
  </section>
}
