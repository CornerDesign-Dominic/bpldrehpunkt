import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import BackLink from '../components/ui/BackLink.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import { approveCustomerImportRow, claimCustomerImportRow, listCustomerImportQueue, mergeCustomerImportPartners, releaseCustomerImportRow } from '../lib/customerImports.js'
import { approveCarrierImportRow, claimCarrierImportRow, listCarrierImportQueue, mergeCarrierImportPartners, releaseCarrierImportRow } from '../lib/carrierImports.js'
import { customerImportResultView } from '../lib/customerImportPresentation.js'
import { mergeComparison, mergeDecisionSummary } from '../lib/partnerMergeDecisions.js'
import PartnerMergeReview from '../components/business-partners/PartnerMergeReview.jsx'
import CustomerImportHistory from '../components/imports/CustomerImportHistory.jsx'
import DycosPartnerFetchForm from '../components/business-partners/DycosPartnerFetchForm.jsx'

const statusLabel = (row) => row.kind === 'error' ? 'Fehlerhaft' : row.kind === 'merge' ? 'Zusammenführung erforderlich' : 'Prüfung erforderlich'
const approvalLabel = (row) => row.approval?.type === 'reviewed' ? 'geprüft übernommen' : 'automatisch übernommen'
const activeLock = (row) => row.lock?.expiresAt?.toMillis?.() > Date.now()
const editableComparisonValue = (value) => value === true || String(value).toLowerCase() === 'true' ? 'Ja' : value === false || String(value).toLowerCase() === 'false' ? 'Nein' : String(value ?? '')
const comparisonValues = (row) => Object.fromEntries((row.comparisons || []).map((item) => [item.path, editableComparisonValue(item.incomingValue)]))
const importApis = {
  customer: { list: listCustomerImportQueue, claim: claimCustomerImportRow, release: releaseCustomerImportRow, approve: approveCustomerImportRow, merge: mergeCustomerImportPartners },
  carrier: { list: listCarrierImportQueue, claim: claimCarrierImportRow, release: releaseCarrierImportRow, approve: approveCarrierImportRow, merge: mergeCarrierImportPartners },
}
const importPath = (kind) => kind === 'carrier' ? '/kunden-unternehmer/import/unternehmer' : '/kunden-unternehmer/import'

function AcceptedRowsTable({ rows, emptyMessage, carrier = false }) {
  if (!rows.length) return <div className="import-empty-state">{emptyMessage}</div>
  return <div className="transport-orders-table-frame import-preview-table"><table className="data-table transport-orders-table customer-import-accepted-table"><thead><tr><th>CSV-{<StaticText source={carrier ? 'Kreditorennummer' : 'Debitor'} />}</th><th><StaticText source={"Ergebnis"} /></th><th><StaticText source={"Betroffener Partner"} /></th><th><StaticText source={"Zuordnung durch"} /></th><th><StaticText source={"Übernahmeart"} /></th><th><StaticText source={"Importdatei"} /></th></tr></thead><tbody>{rows.map((row) => {
    const view = customerImportResultView(row)
    return <tr key={row.id}><td>{carrier ? row.creditorNumber || '—' : row.debtorNumber || '—'}</td><td><div className="customer-import-result-labels">{view.labels.map((label) => <span key={label}>{label}</span>)}</div></td><td><strong>{view.partnerName}</strong><small className="customer-import-partner-id" title={view.partnerId}>ID: {view.partnerId || '—'}</small>{view.partnerPath && <Link to={view.partnerPath}><StaticText source={"Stammdatenblatt öffnen"} /></Link>}</td><td>{view.match}</td><td>{approvalLabel(row)}</td><td>{row.fileName || '—'}</td></tr>
  })}</tbody></table></div>
}

export default function MasterDataImportPage({ kind = 'customer' }) {
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
  const [queue, setQueue] = useState({ open: [], accepted: [], currentAccepted: [], runs: {} })
  const [loading, setLoading] = useState(true)
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

  if (!allowed) return <div className="import-page customer-import-page"><div className="import-page__navigation"><BackLink to="/kunden-unternehmer" /></div><div className="import-page__heading"><h2>{subject} <StaticText source={"importieren"} /></h2><p><StaticText source={"Für die gemeinsame Importwarteschlange werden Datenimport- und Stammdaten-Bearbeitungsrechte benötigt."} /></p></div></div>

  return <div className="import-page customer-import-page">
    <div className="import-page__navigation"><BackLink to="/kunden-unternehmer" /></div>
    <div className="import-page__heading"><h2>{<StaticText source={showingResults ? `${subject}: Prüfungen & Importverlauf` : 'Stammdaten importieren'} />}</h2><p><StaticText source={showingResults ? "Bisherige Importe und offene Prüfungen bleiben hier verfügbar." : "Kunden und Unternehmer über ihre Debitoren- oder Kreditornummer direkt aus DyCoS übernehmen."} /></p></div>
    {!showingResults && <>
      <DycosPartnerFetchForm />
      <div className="masterdata-import-actions"><Link className="masterdata-import-actions__history" to={`${importPath(kind)}?view=results`}><StaticText source="Prüfungen & Importverlauf anzeigen" /></Link></div>
    </>}
    {showingResults && <>
    <p className="masterdata-import-switch"><Link to={`${importPath(carrier ? 'customer' : 'carrier')}?view=results`} onClick={() => setLoading(true)}>{<StaticText source={carrier ? 'Kundenprüfungen und -verlauf anzeigen' : 'Unternehmerprüfungen und -verlauf anzeigen'} />}</Link></p>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}{(notice || location.state?.importNotice) && <div className="import-result">{notice || location.state.importNotice}</div>}
    <section className="import-preparation__section"><div className="import-preparation__heading"><h2><StaticText source={"Noch zu prüfen"} /></h2><p><StaticText source={"Gemeinsame Warteschlange aller offenen"} /> {subject}<StaticText source={"prüfungen. Ein Klick öffnet den Vergleich."} /></p></div>{loading ? <div className="import-empty-state">{subject}<StaticText source={"prüfungen werden geladen …"} /></div> : !queue.open.length ? <div className="import-empty-state"><StaticText source={"Keine offenen"} /> {subject}<StaticText source={"prüfungen vorhanden."} /></div> : <div className="transport-orders-table-frame import-preview-table"><table className="data-table transport-orders-table"><thead><tr><th>{numberLabel}</th><th><StaticText source={"Firma"} /></th><th>Status</th><th><StaticText source={"Grund"} /></th><th><StaticText source={"Importdatei"} /></th></tr></thead><tbody>{queue.open.map((row) => <tr className="customer-import-queue-row" key={row.id} role="button" tabIndex="0" onClick={() => void openRow(row)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openRow(row) } }}><td>{row[numberKey] || '—'}</td><td>{row.companyName || '—'}</td><td><span className={`import-status import-status--${row.kind === 'error' ? 'fehlerhaft' : 'prüfung-erforderlich'}`}>{statusLabel(row)}</span>{activeLock(row) && <div className="import-table-note"><StaticText source={"wird geprüft von"} /> {row.lock.userName}</div>}</td><td>{(row.reasons || []).join(' ') || <StaticText source={"Abweichende Daten prüfen."} />}</td><td>{row.fileName || '—'}</td></tr>)}</tbody></table></div>}</section>
    {selectedRunId && <section className="import-preparation__section import-preparation__section--muted"><div className="import-preparation__heading"><h2><StaticText source={"Ergebnis dieses Imports"} /></h2><p><StaticText source={"Bereits übernommene Zeilen des aktuellen Importlaufs."} /></p></div>{loading ? null : <AcceptedRowsTable carrier={carrier} rows={queue.currentAccepted || []} emptyMessage="In diesem Importlauf wurde noch keine Zeile übernommen." />}</section>}
    <section className="import-preparation__section import-preparation__section--muted"><div className="import-preparation__heading"><h2><StaticText source={"Importverlauf"} /></h2><p><StaticText source={"Alle automatisch oder geprüft übernommenen Zeilen, nach Importlauf gruppiert."} /></p></div>{loading ? null : <CustomerImportHistory identityLabel={carrier ? 'Kreditor' : 'Debitor'} rows={queue.accepted} runs={queue.runs} />}</section>
    </>}
    {modal && (
      <div className="customer-import-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) void closeModal() }}>
        <section className={'customer-import-modal' + (modal.row.kind === 'merge' ? ' customer-import-modal--merge' : '')} role="dialog" aria-modal="true" aria-labelledby="customer-import-modal-title">
          <div className="customer-import-modal__heading">
            <div><h2 id="customer-import-modal-title">{<StaticText source={modal.row.kind === 'merge' ? 'Partner zusammenführen' : carrier ? 'Unternehmer prüfen' : 'Kunde prüfen'} />}</h2><p>{modal.row[numberKey] || `Ohne ${numberLabel}`} · {modal.row.companyName || <StaticText source={"Ohne Firma"} />}</p></div>
            <TranslatedProps sources={{"aria-label":"Prüfung schließen"}}><button type="button" aria-label="Prüfung schließen" onClick={() => void closeModal()}>×</button></TranslatedProps>
          </div>
          {modal.conflictMessage && <p className="form-error">{modal.conflictMessage}</p>}
          {(modal.row.reasons || []).length > 0 && <div className="customer-import-modal__reasons">{modal.row.reasons.map((reason) => <p key={reason}>{reason}</p>)}</div>}
          {modal.row.kind === 'merge' && <PartnerMergeReview merge={modal.row.merge} selectedId={modal.targetPartnerId} onSelect={(partnerId) => setModal((current) => ({ ...current, targetPartnerId: partnerId, mergeComparison: mergeComparison(current.row.merge, partnerId) }))} comparison={modal.mergeComparison} onDecision={(key, decision) => setModal((current) => ({ ...current, mergeComparison: { ...current.mergeComparison, decisions: { ...current.mergeComparison.decisions, [key]: decision } } }))} />}
          {modal.row.kind !== 'merge' && modal.row.comparisons?.length > 0 && <div className="customer-import-comparisons">{modal.row.comparisons.map((item) => <label key={item.path}><span>{item.label}</span><div><output><small><StaticText source={"Aktuell"} /></small>{item.current}</output><span className="customer-import-comparisons__arrow">→</span><span><small><StaticText source={"Neu aus CSV"} /></small><input value={modal.values[item.path] ?? ''} onChange={(event) => setModal((current) => ({ ...current, conflictMessage: '', values: { ...current.values, [item.path]: event.target.value } }))} /></span></div></label>)}</div>}
          {modal.row.kind === 'error' && <p className="form-error"><StaticText source={"Diese frühere Importzeile bleibt offen. Prüfe die Quelldaten und rufe den Partner über den DyCoS-Stammdatenabruf ab."} /></p>}
          <div className="customer-import-modal__actions">
            <button className="button button--secondary" type="button" onClick={() => void closeModal()}><StaticText source={"Abbrechen"} /></button>
            {modal.row.kind === 'merge' ? (canEdit('partnerMerges') ? <button className="button" type="button" disabled={savingReview || !modal.targetPartnerId || mergeDecisionSummary(modal.mergeComparison.rows, modal.mergeComparison.decisions).open > 0} onClick={() => void mergePartners()}>{<StaticText source={savingReview ? 'Zusammenführung läuft …' : 'Partner zusammenführen'} />}</button> : <p className="form-error"><StaticText source={"Für die Zusammenführung fehlt die Berechtigung „Partner zusammenführen“."} /></p>) : modal.row.kind !== 'error' && <button className="button" type="button" disabled={savingReview} onClick={() => void approve()}>{<StaticText source={savingReview ? 'Übernahme läuft …' : 'Übernehmen'} />}</button>}
          </div>
        </section>
      </div>
    )}
  </div>
}
