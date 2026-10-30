import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'
import BackLink from '../components/ui/BackLink.jsx'
import { listTransportOrderImportRuns } from '../lib/transportOrders.js'
import DycosOrderFetchForm from '../components/imports/DycosOrderFetchForm.jsx'
import DycosBulkOrderImport from '../components/imports/DycosBulkOrderImport.jsx'

const dateTimeFormatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const resultSections = [
  { title: 'Fehlerhaft', status: 'Fehlerhaft', empty: 'Keine fehlerhaften Zeilen.' },
  { title: 'Aktualisiert', status: 'Aktualisiert', empty: 'Keine Aufträge aktualisiert.' },
  { title: 'Neu', status: 'Neu', empty: 'Keine neuen Aufträge importiert.' },
]

const formatRunDate = (value) => value ? dateTimeFormatter.format(new Date(value)) : '—'
const count = (run, name) => Number(run?.counts?.[name] || 0)
const isDycosFetch = (run) => run?.source === 'dycos-api'
const runTitle = (run) => isDycosFetch(run) ? 'Manueller DyCoS-Abruf' : run?.fileName || 'CSV-Import'

function RunDetailsModal({ run, rows, loading, onClose }) {
  return <div className="customer-import-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="customer-import-modal transport-order-import-result-modal" role="dialog" aria-modal="true" aria-labelledby="transport-order-import-result-title">
      <div className="customer-import-modal__heading"><div><h2 id="transport-order-import-result-title"><StaticText source={"Importdetails"} /></h2><p><StaticText source={runTitle(run)} />{isDycosFetch(run) && run.externalNumber ? ` · TA ${run.externalNumber}` : ''} · {formatRunDate(run?.importedAt)} · {run?.importedByName || 'Unbekannt'}</p></div><TranslatedProps sources={{"aria-label":"Importdetails schließen"}}><button type="button" aria-label="Importdetails schließen" onClick={onClose}>×</button></TranslatedProps></div>
      {loading ? <div className="import-empty-state"><StaticText source={"Importdetails werden geladen …"} /></div> : <div className="transport-order-import-result-modal__sections">{resultSections.map((section) => {
        const sectionRows = (rows || []).filter((row) => row.status === section.status)
        return <details className={`transport-order-import-result-section transport-order-import-result-section--${section.status.toLocaleLowerCase('de-DE')}`} key={section.status}>
          <summary><span>{section.title}</span><strong>{sectionRows.length}</strong></summary>
          {!sectionRows.length ? <p>{section.empty}</p> : <div className="transport-orders-table-frame"><table className="data-table transport-orders-table transport-order-import-result-table"><thead><tr><th><StaticText source={"TA-Nummer"} /></th><th><StaticText source={"Kunde"} /></th><th><StaticText source={"Unternehmer"} /></th><th>{<StaticText source={section.status === 'Fehlerhaft' ? 'Fehler' : section.status === 'Aktualisiert' ? 'Aktualisiert' : 'Übernahme'} />}</th></tr></thead><tbody>{sectionRows.map((row) => { const message = section.status === 'Fehlerhaft' ? (row.errors || []).join(' ') || 'Ungültige Importzeile.' : section.status === 'Aktualisiert' ? (row.changedFields || []).join(', ') || 'Auftragsdaten' : `Kunde ${row.customerAction || 'verwendet'} · Unternehmer ${row.carrierAction || 'verwendet'}`; return <tr key={row.id}><td>{row.externalNumber || (row.rowNumber ? `Zeile ${row.rowNumber}` : '—')}</td><td title={row.customerName || ''}>{row.customerName || '—'}</td><td title={row.carrierName || ''}>{row.carrierName || '—'}</td><td className="transport-order-import-result-table__message" title={message}>{message}</td></tr> })}</tbody></table></div>}
        </details>
      })}</div>}
      <div className="customer-import-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}><StaticText source={"Schließen"} /></button></div>
    </section>
  </div>
}

export default function TransportOrderImportPage() {
  const [runs, setRuns] = useState([])
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [error, setError] = useState('')
  const [details, setDetails] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [singleBusy, setSingleBusy] = useState(false)

  async function refreshRuns() {
    setLoadingRuns(true)
    try { const result = await listTransportOrderImportRuns(); setRuns(result.runs || []) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Der Importverlauf konnte nicht geladen werden.') } finally { setLoadingRuns(false) }
  }

  useEffect(() => {
    let active = true
    void listTransportOrderImportRuns()
      .then((result) => { if (active) setRuns(result.runs || []) })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Der Importverlauf konnte nicht geladen werden.') })
      .finally(() => { if (active) setLoadingRuns(false) })
    return () => { active = false }
  }, [])

  async function openDetails(run) {
    setDetails({ run, rows: [], loading: true })
    try { const detail = await listTransportOrderImportRuns(run.id); setDetails({ run: detail.run, rows: detail.rows || [], loading: false }) } catch (caught) { setDetails(null); setError(caught instanceof Error ? caught.message : 'Die Importdetails konnten nicht geladen werden.') }
  }

  return <div className="import-page customer-import-page transport-order-import-page">
    <div className="transport-order-import-page__toolbar"><div className="import-page__navigation"><BackLink to="/transportauftraege" /></div></div>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    <DycosBulkOrderImport disabled={singleBusy} onBusyChange={setBulkBusy} onImported={() => void refreshRuns()} />
    <DycosOrderFetchForm disabled={bulkBusy} onPendingChange={setSingleBusy} onImported={() => void refreshRuns()} />
    <section className="import-preparation__section transport-order-import-history"><div className="import-preparation__heading"><h2><StaticText source={"Importverlauf"} /></h2></div>
      {loadingRuns ? <div className="import-empty-state"><StaticText source={"Importverlauf wird geladen …"} /></div> : !runs.length ? <div className="import-empty-state"><StaticText source={"Noch keine Transportaufträge importiert."} /></div> : <div className="transport-order-import-history__list">{runs.map((run) => <button className="transport-order-import-history__row" type="button" key={run.id} onClick={() => void openDetails(run)}><span className="transport-order-import-history__file"><strong><StaticText source={runTitle(run)} />{isDycosFetch(run) && run.externalNumber ? ` · TA ${run.externalNumber}` : ''}</strong><small>{formatRunDate(run.importedAt)} · {run.importedByName || 'Unbekannt'} <StaticText source={isDycosFetch(run) ? '· 1 Auftrag' : '· 1 Datei'} /></small></span><span className={count(run, 'Fehlerhaft') ? 'transport-order-import-history__error-count' : ''}><StaticText source={"Fehlerhaft"} /> <strong>{<StaticText source={count(run, 'Fehlerhaft')} />}</strong></span><span><StaticText source={"Aktualisiert"} /> <strong>{<StaticText source={count(run, 'Aktualisiert')} />}</strong></span><span><StaticText source={"Neu"} /> <strong>{<StaticText source={count(run, 'Neu')} />}</strong></span><span aria-hidden="true">›</span></button>)}</div>}
    </section>
    {details && <RunDetailsModal {...details} onClose={() => setDetails(null)} />}
  </div>
}
