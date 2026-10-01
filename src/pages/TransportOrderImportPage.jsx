import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useRef, useState } from 'react'
import BackLink from '../components/ui/BackLink.jsx'
import { parseTransportOrderCsv } from '../lib/transportOrderCsv.js'
import { importTransportOrderRows, listTransportOrderImportRuns, previewTransportOrderImport } from '../lib/transportOrders.js'
import { readCsvFile } from '../lib/csvEncoding.js'

const dateTimeFormatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const resultSections = [
  { title: 'Fehlerhaft', status: 'Fehlerhaft', empty: 'Keine fehlerhaften Zeilen.' },
  { title: 'Aktualisiert', status: 'Aktualisiert', empty: 'Keine Aufträge aktualisiert.' },
  { title: 'Neu', status: 'Neu', empty: 'Keine neuen Aufträge importiert.' },
]

const formatRunDate = (value) => value ? dateTimeFormatter.format(new Date(value)) : '—'
const count = (run, name) => Number(run?.counts?.[name] || 0)

function rowError(row, errors) {
  return { rowNumber: row.rowNumber, externalNumber: row.externalNumber, customerName: row.imported?.customer?.name || '', carrierName: row.imported?.carrier?.originalName || '', errors }
}

function RunDetailsModal({ run, rows, loading, onClose }) {
  return <div className="customer-import-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="customer-import-modal transport-order-import-result-modal" role="dialog" aria-modal="true" aria-labelledby="transport-order-import-result-title">
      <div className="customer-import-modal__heading"><div><h2 id="transport-order-import-result-title"><StaticText source={"Importdetails"} /></h2><p>{run?.fileName || 'CSV-Import'} · {formatRunDate(run?.importedAt)} · {run?.importedByName || 'Unbekannt'}</p></div><TranslatedProps sources={{"aria-label":"Importdetails schließen"}}><button type="button" aria-label="Importdetails schließen" onClick={onClose}>×</button></TranslatedProps></div>
      {loading ? <div className="import-empty-state"><StaticText source={"Importdetails werden geladen …"} /></div> : <div className="transport-order-import-result-modal__sections">{resultSections.map((section) => {
        const sectionRows = (rows || []).filter((row) => row.status === section.status)
        return <details className={`transport-order-import-result-section transport-order-import-result-section--${section.status.toLocaleLowerCase('de-DE')}`} key={section.status}>
          <summary><span>{section.title}</span><strong>{sectionRows.length}</strong></summary>
          {!sectionRows.length ? <p>{section.empty}</p> : <div className="transport-orders-table-frame"><table className="data-table transport-orders-table"><thead><tr><th><StaticText source={"TA-Nummer"} /></th><th><StaticText source={"Kunde"} /></th><th><StaticText source={"Unternehmer"} /></th><th>{<StaticText source={section.status === 'Fehlerhaft' ? 'Fehler' : section.status === 'Aktualisiert' ? 'Aktualisiert' : 'Übernahme'} />}</th></tr></thead><tbody>{sectionRows.map((row) => <tr key={row.id}><td>{row.externalNumber || (row.rowNumber ? `Zeile ${row.rowNumber}` : '—')}</td><td>{row.customerName || '—'}</td><td>{row.carrierName || '—'}</td><td>{section.status === 'Fehlerhaft' ? (row.errors || []).join(' ') || 'Ungültige Importzeile.' : section.status === 'Aktualisiert' ? (row.changedFields || []).join(', ') || 'Auftragsdaten' : `Kunde ${row.customerAction || 'verwendet'} · Unternehmer ${row.carrierAction || 'verwendet'}`}</td></tr>)}</tbody></table></div>}
        </details>
      })}</div>}
      <div className="customer-import-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}><StaticText source={"Schließen"} /></button></div>
    </section>
  </div>
}

export default function TransportOrderImportPage() {
  const inputRef = useRef(null)
  const [runs, setRuns] = useState([])
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [error, setError] = useState('')
  const [uploadDialog, setUploadDialog] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [details, setDetails] = useState(null)

  async function refreshRuns() {
    setLoadingRuns(true)
    try { const result = await listTransportOrderImportRuns(); setRuns(result.runs || []) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Der Importverlauf konnte nicht geladen werden.') } finally { setLoadingRuns(false) }
  }

  useEffect(() => { void refreshRuns() }, [])

  function chooseUploadFile(file) {
    if (!file || uploading) return
    const fileError = /\.xlsx?$/i.test(file.name) ? 'Excel-Dateien werden noch nicht unterstützt. Bitte exportiere die Datei in DyCoS als CSV.' : !/\.csv$/i.test(file.name) ? 'Bitte wähle einen DyCoS-Export im CSV-Format aus.' : ''
    setUploadDialog((current) => ({ ...current, file: fileError ? null : file, error: fileError }))
  }

  async function startImport() {
    const file = uploadDialog?.file
    if (!file || uploading) return
    setUploading(true); setUploadDialog((current) => ({ ...current, error: '' })); setError('')
    try {
      const parsed = parseTransportOrderCsv(await readCsvFile(file))
      const initialRows = parsed.rows.map((row) => ({ ...row, errors: [...row.errors, ...(parsed.missingHeaders.length ? [`CSV-Struktur unvollständig: ${parsed.missingHeaders.join(', ')}.`] : [])] }))
      const locallyValidRows = initialRows.filter((row) => !row.errors.length)
      const preview = locallyValidRows.length ? await previewTransportOrderImport(locallyValidRows) : null
      const rejectedRows = initialRows.filter((row) => row.errors.length).map((row) => rowError(row, row.errors))
      const importRows = []
      for (const row of locallyValidRows) {
        const carrier = preview?.carriers?.[row.externalNumber]
        if (carrier?.kind === 'candidates') rejectedRows.push(rowError(row, ['Unternehmer konnte nicht eindeutig zugeordnet werden. Bitte Daten prüfen und erneut importieren.']))
        else importRows.push({ rowNumber: row.rowNumber, externalNumber: row.externalNumber, imported: row.imported })
      }
      const result = await importTransportOrderRows({ fileName: file.name, rows: importRows, rowErrors: rejectedRows, carrierResolutions: [] })
      setUploadDialog(null)
      await refreshRuns()
      const detail = await listTransportOrderImportRuns(result.runId)
      setDetails({ run: detail.run, rows: detail.rows || [], loading: false })
    } catch (caught) { setUploadDialog((current) => ({ ...current, error: caught instanceof Error ? caught.message : 'Die CSV-Datei konnte nicht verarbeitet werden.' })) } finally { setUploading(false) }
  }

  async function openDetails(run) {
    setDetails({ run, rows: [], loading: true })
    try { const detail = await listTransportOrderImportRuns(run.id); setDetails({ run: detail.run, rows: detail.rows || [], loading: false }) } catch (caught) { setDetails(null); setError(caught instanceof Error ? caught.message : 'Die Importdetails konnten nicht geladen werden.') }
  }

  return <div className="import-page customer-import-page transport-order-import-page">
    <div className="transport-order-import-page__toolbar"><div className="import-page__navigation"><BackLink to="/transportauftraege" /></div><div className="masterdata-import-actions transport-order-import-page__actions"><button className="button" type="button" onClick={() => { setUploadDialog({ file: null, error: '' }); setDragOver(false) }}><StaticText source={"Transportaufträge importieren"} /></button></div></div>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    <section className="import-preparation__section transport-order-import-history"><div className="import-preparation__heading"><h2><StaticText source={"Importverlauf"} /></h2></div>
      {loadingRuns ? <div className="import-empty-state"><StaticText source={"Importverlauf wird geladen …"} /></div> : !runs.length ? <div className="import-empty-state"><StaticText source={"Noch keine Transportaufträge importiert."} /></div> : <div className="transport-order-import-history__list">{runs.map((run) => <button className="transport-order-import-history__row" type="button" key={run.id} onClick={() => void openDetails(run)}><span className="transport-order-import-history__file"><strong>{run.fileName || 'CSV-Import'}</strong><small>{formatRunDate(run.importedAt)} · {run.importedByName || 'Unbekannt'} <StaticText source={"· 1 Datei"} /></small></span><span className={count(run, 'Fehlerhaft') ? 'transport-order-import-history__error-count' : ''}><StaticText source={"Fehlerhaft"} /> <strong>{<StaticText source={count(run, 'Fehlerhaft')} />}</strong></span><span><StaticText source={"Aktualisiert"} /> <strong>{<StaticText source={count(run, 'Aktualisiert')} />}</strong></span><span><StaticText source={"Neu"} /> <strong>{<StaticText source={count(run, 'Neu')} />}</strong></span><span aria-hidden="true">›</span></button>)}</div>}
    </section>
    {uploadDialog && <div className="customer-import-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !uploading) setUploadDialog(null) }}>
      <section className="customer-import-modal masterdata-upload-modal" role="dialog" aria-modal="true" aria-labelledby="transport-order-upload-title" aria-busy={uploading}>
        <div className="customer-import-modal__heading"><div><h2 id="transport-order-upload-title"><StaticText source={"Transportaufträge importieren"} /></h2><p><StaticText source={"DyCoS-CSV mit Semikolon oder Komma auswählen."} /></p></div><TranslatedProps sources={{"aria-label":"Import schließen"}}><button type="button" aria-label="Import schließen" disabled={uploading} onClick={() => setUploadDialog(null)}>×</button></TranslatedProps></div>
        <input ref={inputRef} className="sr-only" type="file" accept=".csv,text/csv" disabled={uploading} onChange={(event) => { chooseUploadFile(event.target.files?.[0]); event.target.value = '' }} />
        <button className={`import-dropzone import-dropzone--button masterdata-upload-modal__dropzone${dragOver ? ' masterdata-upload-modal__dropzone--active' : ''}${uploadDialog.file ? ' masterdata-upload-modal__dropzone--selected' : ''}`} type="button" disabled={uploading} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); if (!uploading) setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); chooseUploadFile(event.dataTransfer.files?.[0]) }}><strong>{uploadDialog.file?.name || <StaticText source={"CSV hierher ziehen oder zur Auswahl klicken"} />}</strong><span>{<StaticText source={uploadDialog.file ? 'Datei ausgewählt. Mit „Import starten“ bestätigen.' : 'CSV auswählen; UTF-8- und Windows-CSV werden unterstützt.'} />}</span></button>
        {uploadDialog.error && <p className="form-error" role="alert">{uploadDialog.error}</p>}{uploading && <p className="masterdata-upload-modal__progress" role="status"><StaticText source={"Datei wird geprüft und verarbeitet … Bitte warten."} /></p>}
        <div className="customer-import-modal__actions"><button className="button button--secondary" type="button" disabled={uploading} onClick={() => setUploadDialog(null)}><StaticText source={"Abbrechen"} /></button><button className="button" type="button" disabled={uploading || !uploadDialog.file} onClick={() => void startImport()}>{<StaticText source={uploading ? 'Import läuft …' : 'Import starten'} />}</button></div>
      </section>
    </div>}
    {details && <RunDetailsModal {...details} onClose={() => setDetails(null)} />}
  </div>
}
