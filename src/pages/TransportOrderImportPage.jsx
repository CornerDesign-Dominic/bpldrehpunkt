import { useMemo, useRef, useState } from 'react'
import BackLink from '../components/ui/BackLink.jsx'
import TransportCarrierReviewModal from '../components/imports/TransportCarrierReviewModal.jsx'
import { parseTransportOrderCsv, transportOrderFingerprint } from '../lib/transportOrderCsv.js'
import { importTransportOrderRows, previewTransportOrderImport } from '../lib/transportOrders.js'

const statusOrder = ['Fehlerhaft', 'Prüfung erforderlich', 'Neu', 'Aktualisiert', 'Unverändert']
const statusClass = (status) => status.toLocaleLowerCase('de-DE').replaceAll(' ', '-')

function classifyRows(rows, remotePreview, carrierResolutions = {}) {
  const existing = remotePreview?.existing || {}; const customers = remotePreview?.customers || {}; const carriers = remotePreview?.carriers || {}
  return rows.map((row) => {
    if (row.errors.length) return { ...row, status: 'Fehlerhaft', reasons: row.errors }
    const customer = customers[row.imported.customer.debtorNumber]
    const carrier = carriers[row.externalNumber] || { kind: 'missing', candidates: [] }
    const carrierResolution = carrierResolutions[row.externalNumber]
    const carrierNeedsDecision = carrier.kind === 'candidates' && !carrierResolution
    const customerAction = customer ? `Kunde verknüpft: ${customer.companyName}` : 'Kunde wird neu angelegt'
    const carrierAction = carrier.kind === 'exact'
      ? `Unternehmer verknüpft: ${carrier.partner?.companyName || row.imported.carrier.originalName}`
      : carrier.kind === 'missing' ? 'Unternehmer wird neu angelegt'
        : carrierResolution === 'new' ? 'Unternehmer wird neu angelegt'
          : carrierResolution ? `Unternehmer verknüpft: ${(carrier.candidates || []).find((item) => item.id === carrierResolution)?.companyName || 'Auswahl'}` : 'Unternehmerzuordnung auswählen oder Neuanlage bestätigen'
    if (carrierNeedsDecision) return { ...row, status: 'Prüfung erforderlich', reasons: [customerAction, carrierAction], customerAction, carrierAction, carrier }
    const previous = existing[row.externalNumber]
    return { ...row, status: previous ? previous === transportOrderFingerprint(row.imported) ? 'Unverändert' : 'Aktualisiert' : 'Neu', reasons: [customerAction, carrierAction], customerAction, carrierAction, carrier }
  })
}

export default function TransportOrderImportPage() {
  const inputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [headerError, setHeaderError] = useState('')
  const [rows, setRows] = useState([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [remotePreview, setRemotePreview] = useState(null)
  const [carrierResolutions, setCarrierResolutions] = useState({})
  const [carrierReview, setCarrierReview] = useState(null)
  const counts = useMemo(() => Object.fromEntries(statusOrder.map((status) => [status, rows.filter((row) => row.status === status).length])), [rows])
  const importableRows = rows.filter((row) => !['Fehlerhaft', 'Prüfung erforderlich'].includes(row.status))
  const errorRows = rows.filter((row) => row.status === 'Fehlerhaft').map((row) => ({ rowNumber: row.rowNumber, errors: row.reasons }))
  const unresolvedCarrierMatches = rows.filter((row) => row.status === 'Prüfung erforderlich').length

  async function selectFile(file) {
    setError(''); setResult(null); setRows([]); setHeaderError(''); setRemotePreview(null); setCarrierResolutions({}); setCarrierReview(null)
    if (!file) return
    if (/\.xlsx?$/i.test(file.name)) { setError('Excel-Dateien werden noch nicht unterstützt. Bitte exportiere die Datei in DyCoS als CSV.'); return }
    if (!/\.csv$/i.test(file.name)) { setError('Bitte wähle einen DyCoS-Export im CSV-Format aus.'); return }
    setFileName(file.name); setLoadingPreview(true)
    try {
      const parsed = parseTransportOrderCsv(await file.text())
      if (parsed.missingHeaders.length) {
        setHeaderError(`Fehlende Pflichtüberschriften: ${parsed.missingHeaders.join(', ')}.`)
        setRows(parsed.rows.map((row) => ({ ...row, status: 'Fehlerhaft', reasons: [...row.errors, 'CSV-Struktur ist unvollständig.'] })))
        return
      }
      const validRows = parsed.rows.filter((row) => !row.errors.length)
      const remotePreview = validRows.length ? await previewTransportOrderImport(validRows) : null
      setRemotePreview(remotePreview)
      setRows(classifyRows(parsed.rows, remotePreview))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Die CSV-Datei konnte nicht gelesen werden.') } finally { setLoadingPreview(false) }
  }

  function setCarrierResolution(externalNumber, value) {
    const next = { ...carrierResolutions, [externalNumber]: value }
    setCarrierResolutions(next)
    setRows((current) => classifyRows(current.map((entry) => {
      const row = { ...entry }
      delete row.status; delete row.reasons; delete row.customerAction; delete row.carrierAction; delete row.carrier
      return row
    }), remotePreview, next))
  }

  async function confirmImport() {
    setSaving(true); setError(''); setResult(null)
    try {
      const carrierResolutionPayload = Object.entries(carrierResolutions).map(([externalNumber, value]) => value === 'new' ? { externalNumber, createNew: true } : { externalNumber, partnerId: value })
      setResult(await importTransportOrderRows({ fileName, rows: importableRows.map(({ rowNumber, externalNumber, imported }) => ({ rowNumber, externalNumber, imported })), rowErrors: errorRows, carrierResolutions: carrierResolutionPayload }))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Der Import konnte nicht durchgeführt werden.') } finally { setSaving(false) }
  }

  return <div className="import-page">
    <div className="import-page__navigation"><BackLink to="/transportauftraege" /></div>
    <div className="import-page__heading"><h2>Transportaufträge importieren</h2><p>CSV-Dateien werden lokal geprüft und erst nach deiner bewussten Bestätigung importiert.</p></div>
    <section className="import-preparation__section"><div className="import-preparation__heading"><h2>1. CSV-Datei auswählen</h2><p>Unterstützt werden UTF-8-CSV-Dateien mit Semikolon oder Komma als Trennzeichen.</p></div><input ref={inputRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => void selectFile(event.target.files?.[0])} /><button className="import-dropzone import-dropzone--button" type="button" disabled={loadingPreview || saving} onClick={() => inputRef.current?.click()}><strong>{loadingPreview ? 'CSV-Datei wird geprüft …' : fileName || 'CSV-Datei auswählen'}</strong><span>Keine Datei wird hochgeladen oder in Storage gespeichert.</span></button></section>
    <section className="import-preparation__section">
      <div className="import-preparation__heading"><h2>2. Vorschau &amp; Validierung</h2><p>Fehlende Kunden und Unternehmer werden beim bestätigten Import kontrolliert angelegt. Nur Unternehmer-Matchkandidaten benötigen eine Auswahl.</p></div>
      {headerError && <p className="form-error">{headerError}</p>}{error && <p className="form-error">{error}</p>}
      {!loadingPreview && !rows.length && !headerError && <div className="import-empty-state">Noch keine CSV-Datei zur Vorschau ausgewählt.</div>}
      {rows.length > 0 && <><div className="import-status-list">{statusOrder.map((status) => <span className={`import-status import-status--${statusClass(status)}`} key={status}>{status}: {counts[status]}</span>)}</div>
        <div className="transport-orders-table-frame import-preview-table"><table className="data-table transport-orders-table"><thead><tr><th>Zeile</th><th>TA-Nummer</th><th>Kunde</th><th>Unternehmer</th><th>Status</th><th>Hinweis / Entscheidung</th></tr></thead><tbody>{rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.externalNumber || '—'}</td><td>{row.imported.customer.name || '—'}</td><td>{row.imported.carrier.originalName || '—'}</td><td><span className={`import-status import-status--${statusClass(row.status)}`}>{row.status}</span></td><td><div>{row.customerAction}</div><div>{row.carrierAction}</div>{row.carrier?.kind === 'candidates' && <button className="import-carrier-resolution__button" type="button" disabled={saving || loadingPreview} onClick={() => setCarrierReview(row)}>{carrierResolutions[row.externalNumber] ? 'Auswahl ändern …' : 'Bitte entscheiden …'}</button>}</td></tr>)}</tbody></table></div></>}
    </section>
    <section className="import-preparation__section import-preparation__section--muted"><div className="import-preparation__heading"><h2>3. Bewusste Übernahme</h2><p>Fehlerhafte Zeilen werden nicht geschrieben. Für Unternehmer-Matchkandidaten muss zuvor eine bewusste Zuordnung oder Neuanlage ausgewählt werden.</p></div><div className="import-confirmation"><span>{unresolvedCarrierMatches ? `${unresolvedCarrierMatches} Unternehmerzuordnung(en) noch offen.` : importableRows.length ? `${importableRows.length} importierbare Zeilen; ${errorRows.length} fehlerhafte Zeilen.` : 'Noch keine importierbaren Zeilen vorhanden.'}</span><button className="button" type="button" disabled={!importableRows.length || unresolvedCarrierMatches || saving || loadingPreview} onClick={() => void confirmImport()}>{saving ? 'Import wird übernommen …' : 'Änderungen übernehmen'}</button></div>{result && <div className="import-result"><strong>Importlauf abgeschlossen.</strong><span>Neu: {result.counts?.Neu || 0} · Aktualisiert: {result.counts?.Aktualisiert || 0} · Unverändert: {result.counts?.Unverändert || 0} · Prüfung erforderlich: {result.counts?.['Prüfung erforderlich'] || 0} · Fehlerhaft: {result.counts?.Fehlerhaft || 0}</span></div>}</section>
    {carrierReview && <TransportCarrierReviewModal row={carrierReview} currentResolution={carrierResolutions[carrierReview.externalNumber]} onClose={() => setCarrierReview(null)} onConfirm={(value) => { setCarrierResolution(carrierReview.externalNumber, value); setCarrierReview(null) }} />}
  </div>
}
