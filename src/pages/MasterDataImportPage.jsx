import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import BackLink from '../components/ui/BackLink.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import { approveCustomerImportRow, claimCustomerImportRow, listCustomerImportQueue, mergeCustomerImportPartners, processCustomerImport, releaseCustomerImportRow } from '../lib/customerImports.js'
import { parseCustomerCsv } from '../lib/customerCsv.js'
import { approveCarrierImportRow, claimCarrierImportRow, listCarrierImportQueue, mergeCarrierImportPartners, processCarrierImport, releaseCarrierImportRow } from '../lib/carrierImports.js'
import { parseCarrierCsv } from '../lib/carrierCsv.js'
import { customerImportResultView } from '../lib/customerImportPresentation.js'
import { mergeComparison, mergeDecisionSummary } from '../lib/partnerMergeDecisions.js'
import PartnerMergeReview from '../components/business-partners/PartnerMergeReview.jsx'
import CustomerImportHistory from '../components/imports/CustomerImportHistory.jsx'

const statusLabel = (row) => row.kind === 'error' ? 'Fehlerhaft' : row.kind === 'merge' ? 'Zusammenführung erforderlich' : 'Prüfung erforderlich'
const approvalLabel = (row) => row.approval?.type === 'reviewed' ? 'geprüft übernommen' : 'automatisch übernommen'
const activeLock = (row) => row.lock?.expiresAt?.toMillis?.() > Date.now()
const editableComparisonValue = (value) => value === true || String(value).toLowerCase() === 'true' ? 'Ja' : value === false || String(value).toLowerCase() === 'false' ? 'Nein' : String(value ?? '')
const comparisonValues = (row) => Object.fromEntries((row.comparisons || []).map((item) => [item.path, editableComparisonValue(item.incomingValue)]))
const importApis = {
  customer: { parse: parseCustomerCsv, process: processCustomerImport, list: listCustomerImportQueue, claim: claimCustomerImportRow, release: releaseCustomerImportRow, approve: approveCustomerImportRow, merge: mergeCustomerImportPartners },
  carrier: { parse: parseCarrierCsv, process: processCarrierImport, list: listCarrierImportQueue, claim: claimCarrierImportRow, release: releaseCarrierImportRow, approve: approveCarrierImportRow, merge: mergeCarrierImportPartners },
}
const importPath = (kind) => kind === 'carrier' ? '/kunden-unternehmer/import/unternehmer' : '/kunden-unternehmer/import'

function AcceptedRowsTable({ rows, emptyMessage, carrier = false }) {
  if (!rows.length) return <div className="import-empty-state">{emptyMessage}</div>
  return <div className="transport-orders-table-frame import-preview-table"><table className="data-table transport-orders-table customer-import-accepted-table"><thead><tr><th>CSV-{carrier ? 'Kreditorennummer' : 'Debitor'}</th><th>Ergebnis</th><th>Betroffener Partner</th><th>Zuordnung durch</th><th>Übernahmeart</th><th>Importdatei</th></tr></thead><tbody>{rows.map((row) => {
    const view = customerImportResultView(row)
    return <tr key={row.id}><td>{carrier ? row.creditorNumber || '—' : row.debtorNumber || '—'}</td><td><div className="customer-import-result-labels">{view.labels.map((label) => <span key={label}>{label}</span>)}</div></td><td><strong>{view.partnerName}</strong><small className="customer-import-partner-id" title={view.partnerId}>ID: {view.partnerId || '—'}</small>{view.partnerPath && <Link to={view.partnerPath}>Stammdatenblatt öffnen</Link>}</td><td>{view.match}</td><td>{approvalLabel(row)}</td><td>{row.fileName || '—'}</td></tr>
  })}</tbody></table></div>
}

export default function MasterDataImportPage({ kind = 'customer' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const showingResults = searchParams.get('view') === 'results'
  const selectedRunId = searchParams.get('runId') || ''
  const carrier = kind === 'carrier'
  const api = carrier ? importApis.carrier : importApis.customer
  const subject = carrier ? 'Unternehmer' : 'Kunden'
  const numberKey = carrier ? 'creditorNumber' : 'debtorNumber'
  const numberLabel = carrier ? 'Kreditorennummer' : 'Debitorennummer'
  const { canEdit } = usePermissions()
  const inputRef = useRef(null)
  const [queue, setQueue] = useState({ open: [], accepted: [], currentAccepted: [], runs: {} })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadDialog, setUploadDialog] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  const [savingReview, setSavingReview] = useState(false)
  const allowed = canEdit('dataImports') && canEdit('masterData')

  async function refresh(runId = selectedRunId) {
    if (!allowed) return
    setLoading(true)
    try { setQueue(await api.list(runId)) } catch (caught) { setError(caught instanceof Error ? caught.message : `Die ${subject}prüfungen konnten nicht geladen werden.`) } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!allowed || !showingResults) return undefined
    let active = true
    void api.list(selectedRunId).then((nextQueue) => { if (active) setQueue(nextQueue) }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : `Die ${subject}prüfungen konnten nicht geladen werden.`) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [allowed, api, selectedRunId, showingResults, subject])

  function chooseUploadFile(file) {
    if (!file || uploading) return
    const validationError = /\.xlsx?$/i.test(file.name)
      ? 'Excel-Dateien werden noch nicht unterstützt. Bitte exportiere die Datei in DyCoS als CSV.'
      : !/\.csv$/i.test(file.name) ? 'Bitte wähle einen DyCoS-Export im CSV-Format aus.' : ''
    setUploadDialog((current) => ({ ...current, file: validationError ? null : file, error: validationError }))
  }

  async function confirmUpload() {
    if (!uploadDialog?.file || uploading) return
    const { file, kind: uploadKind } = uploadDialog
    const uploadApi = importApis[uploadKind]
    setUploading(true)
    setUploadDialog((current) => ({ ...current, error: '' }))
    try {
      const parsed = uploadApi.parse(await file.text())
      const rows = parsed.rows.map((row) => ({ ...row, errors: [...row.errors, ...(parsed.missingHeaders.length ? [`CSV-Struktur unvollständig: ${parsed.missingHeaders.join(', ')}.`] : [])] }))
      const result = await uploadApi.process({ fileName: file.name, rows })
      setUploadDialog(null)
      setNotice('')
      setLoading(true)
      navigate(`${importPath(uploadKind)}?view=results&runId=${encodeURIComponent(result.runId)}`, { state: { importNotice: `${result.counts.automaticallyAccepted} Zeile(n) automatisch übernommen, ${result.counts.open} Zeile(n) zur Prüfung eingestellt.` } })
    } catch (caught) { setUploadDialog((current) => ({ ...current, error: caught instanceof Error ? caught.message : 'Die CSV-Datei konnte nicht verarbeitet werden.' })) } finally { setUploading(false) }
  }

  async function openRow(row) {
    setError('')
    if (row.kind === 'error') { setModal({ row, values: {} }); return }
    try {
      const claimed = await api.claim({ runId: row.runId, rowId: row.id })
      const targetPartnerId = claimed.row.merge?.suggestedTargetId || claimed.row.merge?.partners?.[0]?.id || ''
      setModal({ row: claimed.row, values: comparisonValues(claimed.row), conflictMessage: '', targetPartnerId, mergeComparison: mergeComparison(claimed.row.merge, targetPartnerId) })
      await refresh(selectedRunId)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Die Prüfzeile konnte nicht geöffnet werden.') }
  }

  async function closeModal() {
    const current = modal
    setModal(null)
    if (current?.row?.kind !== 'error') { try { await api.release(current.row.id); await refresh(selectedRunId) } catch { /* Die zeitbasierte Sperre läuft ohne weiteren Eingriff ab. */ } }
  }

  async function approve() {
    if (!modal) return
    setSavingReview(true); setError('')
    try {
      const result = await api.approve({ runId: modal.row.runId, rowId: modal.row.id, approvedValues: modal.values })
      const acceptedRow = { ...modal.row, ...result.row, state: 'accepted', approval: { type: 'reviewed' } }
      setQueue((current) => ({ ...current, open: current.open.filter((row) => row.id !== modal.row.id), accepted: [acceptedRow, ...current.accepted.filter((row) => row.id !== modal.row.id)], currentAccepted: modal.row.runId === selectedRunId ? [acceptedRow, ...current.currentAccepted.filter((row) => row.id !== modal.row.id)] : current.currentAccepted }))
      setModal(null); setNotice(`${result.row.companyName || result.row[numberKey]} wurde geprüft übernommen.`); await refresh(selectedRunId)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Die geprüfte Änderung konnte nicht übernommen werden.'
      if (message.includes('inzwischen geändert') && modal) {
        try {
          const claimed = await api.claim({ runId: modal.row.runId, rowId: modal.row.id })
          setModal({ row: claimed.row, values: comparisonValues(claimed.row), conflictMessage: 'Die Stammdaten wurden parallel geändert. Der Vergleich wurde aktualisiert.' })
        } catch { setError(message) }
      } else setError(message)
    } finally { setSavingReview(false) }
  }

  async function mergePartners() {
    if (!modal?.targetPartnerId) return
    setSavingReview(true); setError('')
    try {
      const result = await api.merge({ runId: modal.row.runId, rowId: modal.row.id, targetPartnerId: modal.targetPartnerId, decisions: modal.mergeComparison.decisions, partnerVersions: Object.fromEntries((modal.row.merge?.partners || []).map((partner) => [partner.id, partner.version])) })
      if (result.row.state !== 'open') {
        const acceptedRow = { ...modal.row, ...result.row, state: 'accepted', approval: { type: 'reviewed' } }
        setQueue((current) => ({ ...current, open: current.open.filter((row) => row.id !== modal.row.id), accepted: [acceptedRow, ...current.accepted.filter((row) => row.id !== modal.row.id)], currentAccepted: modal.row.runId === selectedRunId ? [acceptedRow, ...current.currentAccepted.filter((row) => row.id !== modal.row.id)] : current.currentAccepted }))
      }
      setModal(null); setNotice(result.row.state === 'open' ? 'Partner wurden zusammengeführt. Weitere CSV-Abweichungen müssen noch geprüft werden.' : 'Partner wurden zusammengeführt und die Prüfzeile übernommen.'); await refresh(selectedRunId)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Die Partner konnten nicht zusammengeführt werden.'
      if (message.includes('inzwischen geändert')) {
        try {
          const claimed = await api.claim({ runId: modal.row.runId, rowId: modal.row.id })
          const targetPartnerId = modal.targetPartnerId
          setModal({ row: claimed.row, values: comparisonValues(claimed.row), conflictMessage: 'Die Stammdaten wurden parallel geändert. Bitte die Entscheidungen erneut prüfen.', targetPartnerId, mergeComparison: mergeComparison(claimed.row.merge, targetPartnerId) })
        } catch { setError(message) }
      } else setError(message)
    } finally { setSavingReview(false) }
  }

  if (!allowed) return <div className="import-page customer-import-page"><div className="import-page__navigation"><BackLink to="/kunden-unternehmer" /></div><div className="import-page__heading"><h2>{subject} importieren</h2><p>Für die gemeinsame Importwarteschlange werden Datenimport- und Stammdaten-Bearbeitungsrechte benötigt.</p></div></div>

  return <div className="import-page customer-import-page">
    <div className="import-page__navigation"><BackLink to="/kunden-unternehmer" /></div>
    <div className="import-page__heading"><h2>{showingResults ? `${subject} importieren` : 'Stammdaten importieren'}</h2><p>Sichere Daten werden direkt übernommen. Fachliche Entscheidungen bleiben für berechtigte Nutzer dauerhaft in einer gemeinsamen Warteschlange.</p></div>
    <div className="masterdata-import-actions">
      <button className="button" type="button" onClick={() => { setUploadDialog({ kind: 'customer', file: null, error: '' }); setDragOver(false) }}>KU Daten importieren</button>
      <button className="button" type="button" onClick={() => { setUploadDialog({ kind: 'carrier', file: null, error: '' }); setDragOver(false) }}>UTN Daten importieren</button>
      {!showingResults && <Link className="masterdata-import-actions__history" to={`${importPath(kind)}?view=results`}>Prüfungen &amp; Importverlauf anzeigen</Link>}
    </div>
    {showingResults && <>
    <p className="masterdata-import-switch"><Link to={`${importPath(carrier ? 'customer' : 'carrier')}?view=results`} onClick={() => setLoading(true)}>{carrier ? 'Kundenprüfungen und -verlauf anzeigen' : 'Unternehmerprüfungen und -verlauf anzeigen'}</Link></p>
    {error && <p className="form-error">{error}</p>}{(notice || location.state?.importNotice) && <div className="import-result">{notice || location.state.importNotice}</div>}
    <section className="import-preparation__section"><div className="import-preparation__heading"><h2>Noch zu prüfen</h2><p>Gemeinsame Warteschlange aller offenen {subject}prüfungen. Ein Klick öffnet den Vergleich.</p></div>{loading ? <div className="import-empty-state">{subject}prüfungen werden geladen …</div> : !queue.open.length ? <div className="import-empty-state">Keine offenen {subject}prüfungen vorhanden.</div> : <div className="transport-orders-table-frame import-preview-table"><table className="data-table transport-orders-table"><thead><tr><th>{numberLabel}</th><th>Firma</th><th>Status</th><th>Grund</th><th>Importdatei</th></tr></thead><tbody>{queue.open.map((row) => <tr className="customer-import-queue-row" key={row.id} role="button" tabIndex="0" onClick={() => void openRow(row)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openRow(row) } }}><td>{row[numberKey] || '—'}</td><td>{row.companyName || '—'}</td><td><span className={`import-status import-status--${row.kind === 'error' ? 'fehlerhaft' : 'prüfung-erforderlich'}`}>{statusLabel(row)}</span>{activeLock(row) && <div className="import-table-note">wird geprüft von {row.lock.userName}</div>}</td><td>{(row.reasons || []).join(' ') || 'Abweichende Daten prüfen.'}</td><td>{row.fileName || '—'}</td></tr>)}</tbody></table></div>}</section>
    {selectedRunId && <section className="import-preparation__section import-preparation__section--muted"><div className="import-preparation__heading"><h2>Ergebnis dieses Imports</h2><p>Bereits übernommene Zeilen des aktuellen Importlaufs.</p></div>{loading ? null : <AcceptedRowsTable carrier={carrier} rows={queue.currentAccepted || []} emptyMessage="In diesem Importlauf wurde noch keine Zeile übernommen." />}</section>}
    <section className="import-preparation__section import-preparation__section--muted"><div className="import-preparation__heading"><h2>Importverlauf</h2><p>Alle automatisch oder geprüft übernommenen Zeilen, nach Importlauf gruppiert.</p></div>{loading ? null : <CustomerImportHistory identityLabel={carrier ? 'Kreditor' : 'Debitor'} rows={queue.accepted} runs={queue.runs} />}</section>
    </>}
    {uploadDialog && <div className="customer-import-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !uploading) setUploadDialog(null) }}>
      <section className="customer-import-modal masterdata-upload-modal" role="dialog" aria-modal="true" aria-labelledby="masterdata-upload-title" aria-busy={uploading} onKeyDown={(event) => { if (event.key === 'Escape' && !uploading) setUploadDialog(null) }}>
        <div className="customer-import-modal__heading"><div><h2 id="masterdata-upload-title">{uploadDialog.kind === 'carrier' ? 'UTN Daten importieren' : 'KU Daten importieren'}</h2><p>DyCoS-CSV mit Semikolon oder Komma auswählen.</p></div><button type="button" aria-label="Import schließen" disabled={uploading} onClick={() => setUploadDialog(null)}>×</button></div>
        <input ref={inputRef} className="sr-only" type="file" accept=".csv,text/csv" disabled={uploading} onChange={(event) => { chooseUploadFile(event.target.files?.[0]); event.target.value = '' }} />
        <button className={`import-dropzone import-dropzone--button masterdata-upload-modal__dropzone${dragOver ? ' masterdata-upload-modal__dropzone--active' : ''}`} type="button" disabled={uploading} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); if (!uploading) setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); chooseUploadFile(event.dataTransfer.files?.[0]) }}><strong>{uploadDialog.file?.name || 'CSV hierher ziehen oder zur Auswahl klicken'}</strong><span>{uploadDialog.file ? 'Datei ausgewählt. Mit „Import starten“ bestätigen.' : 'UTF-8-CSV auswählen; der Import startet erst nach Bestätigung.'}</span></button>
        {uploadDialog.error && <p className="form-error" role="alert">{uploadDialog.error}</p>}
        {uploading && <p className="masterdata-upload-modal__progress" role="status">Datei wird geprüft und verarbeitet … Bitte warten.</p>}
        <div className="customer-import-modal__actions"><button className="button button--secondary" type="button" disabled={uploading} onClick={() => setUploadDialog(null)}>Abbrechen</button><button className="button" type="button" disabled={uploading || !uploadDialog.file} onClick={() => void confirmUpload()}>{uploading ? 'Import läuft …' : 'Import starten'}</button></div>
      </section>
    </div>}
    {modal && (
      <div className="customer-import-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) void closeModal() }}>
        <section className={'customer-import-modal' + (modal.row.kind === 'merge' ? ' customer-import-modal--merge' : '')} role="dialog" aria-modal="true" aria-labelledby="customer-import-modal-title">
          <div className="customer-import-modal__heading">
            <div><h2 id="customer-import-modal-title">{modal.row.kind === 'merge' ? 'Partner zusammenführen' : carrier ? 'Unternehmer prüfen' : 'Kunde prüfen'}</h2><p>{modal.row[numberKey] || `Ohne ${numberLabel}`} · {modal.row.companyName || 'Ohne Firma'}</p></div>
            <button type="button" aria-label="Prüfung schließen" onClick={() => void closeModal()}>×</button>
          </div>
          {modal.conflictMessage && <p className="form-error">{modal.conflictMessage}</p>}
          {(modal.row.reasons || []).length > 0 && <div className="customer-import-modal__reasons">{modal.row.reasons.map((reason) => <p key={reason}>{reason}</p>)}</div>}
          {modal.row.kind === 'merge' && <PartnerMergeReview merge={modal.row.merge} selectedId={modal.targetPartnerId} onSelect={(partnerId) => setModal((current) => ({ ...current, targetPartnerId: partnerId, mergeComparison: mergeComparison(current.row.merge, partnerId) }))} comparison={modal.mergeComparison} onDecision={(key, decision) => setModal((current) => ({ ...current, mergeComparison: { ...current.mergeComparison, decisions: { ...current.mergeComparison.decisions, [key]: decision } } }))} />}
          {modal.row.kind !== 'merge' && modal.row.comparisons?.length > 0 && <div className="customer-import-comparisons">{modal.row.comparisons.map((item) => <label key={item.path}><span>{item.label}</span><div><output><small>Aktuell</small>{item.current}</output><span className="customer-import-comparisons__arrow">→</span><span><small>Neu aus CSV</small><input value={modal.values[item.path] ?? ''} onChange={(event) => setModal((current) => ({ ...current, conflictMessage: '', values: { ...current.values, [item.path]: event.target.value } }))} /></span></div></label>)}</div>}
          {modal.row.kind === 'error' && <p className="form-error">Diese Zeile bleibt offen. Korrigiere die CSV und importiere sie erneut.</p>}
          <div className="customer-import-modal__actions">
            <button className="button button--secondary" type="button" onClick={() => void closeModal()}>Abbrechen</button>
            {modal.row.kind === 'merge' ? (canEdit('partnerMerges') ? <button className="button" type="button" disabled={savingReview || !modal.targetPartnerId || mergeDecisionSummary(modal.mergeComparison.rows, modal.mergeComparison.decisions).open > 0} onClick={() => void mergePartners()}>{savingReview ? 'Zusammenführung läuft …' : 'Partner zusammenführen'}</button> : <p className="form-error">Für die Zusammenführung fehlt die Berechtigung „Partner zusammenführen“.</p>) : modal.row.kind !== 'error' && <button className="button" type="button" disabled={savingReview} onClick={() => void approve()}>{savingReview ? 'Übernahme läuft …' : 'Übernehmen'}</button>}
          </div>
        </section>
      </div>
    )}
  </div>
}
