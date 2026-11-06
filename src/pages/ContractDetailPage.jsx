import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { getContract, listContractRecords, mutateContract } from '../lib/contracts.js'
import { CONTRACT_CYCLES, CONTRACT_DEADLINE_TYPES, contractCostTotals, contractLabel, contractMutationError, formatContractDate, formatContractMoney, formatContractTimestamp, localContractDate, nextContractCharge } from '../lib/contractPresentation.js'
import { calendarPath, deadlineIdFromHash } from '../lib/recordNavigation.js'
import BackLink from '../components/ui/BackLink.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import ContractRecordModal from '../components/contracts/ContractRecordModal.jsx'
import ContractDocumentsSection from '../components/contracts/ContractDocumentsSection.jsx'
import { EditIcon, TrashIcon } from '../components/icons.jsx'
import '../styles/contracts.css'

const historyLabels = {
  details: ['Vertragsdaten geändert', 'Contract details changed'],
  'position.save': ['Position gespeichert', 'Position saved'], 'position.delete': ['Position gelöscht', 'Position deleted'],
  'deadline.save': ['Termin / Frist gespeichert', 'Appointment / deadline saved'], 'deadline.delete': ['Termin / Frist gelöscht', 'Appointment / deadline deleted'],
  'note.add': ['Notiz hinzugefügt', 'Note added'],
  'document.reserve': ['Dokumentupload vorbereitet', 'Document upload prepared'], 'document.finalize': ['Dokument hochgeladen', 'Document uploaded'],
  'document.update': ['Dokumentdetails geändert', 'Document details changed'], 'document.delete': ['Dokument gelöscht', 'Document deleted'],
}
async function loadFile(id) {
  const contract = await getContract(id)
  if (!contract) return { contract: null, positions: [], deadlines: [], notes: [], history: [] }
  const [positions, deadlines, notes, history] = await Promise.all(['positions', 'deadlines', 'notes', 'history'].map((kind) => listContractRecords(id, kind)))
  return { contract, positions, deadlines, notes, history }
}

export default function ContractDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const { canEdit } = usePermissions()
  const editable = canEdit('contracts')
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(0)
  const [editor, setEditor] = useState(null)
  const [deletion, setDeletion] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [note, setNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const noteAttempt = useRef(null)
  const refreshSequence = useRef(0)
  const mounted = useRef(true)
  const selectedDeadline = deadlineIdFromHash(location.hash)

  useEffect(() => {
    let active = true
    mounted.current = true
    const sequence = ++refreshSequence.current
    loadFile(id).then((loaded) => { if (active && sequence === refreshSequence.current) { setData(loaded); setError('') } })
      .catch(() => { if (active) setError('load') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; mounted.current = false }
  }, [id, retry])
  useEffect(() => {
    if (selectedDeadline && data?.deadlines.some((entry) => entry.id === selectedDeadline)) document.getElementById(`contract-deadline-${selectedDeadline}`)?.scrollIntoView({ block: 'center' })
  }, [data?.deadlines, selectedDeadline])

  async function refresh(afterSave = false) {
    const sequence = ++refreshSequence.current
    try {
      const loaded = await loadFile(id)
      if (mounted.current && sequence === refreshSequence.current) { setData(loaded); setError('') }
      return true
    } catch {
      if (mounted.current) setError(afterSave ? 'saved-refresh' : 'load')
      return false
    }
  }
  async function saveRecord(values, options) {
    setError(''); setMessage('')
    await mutateContract(id, { ...options, action: editor.kind === 'details' ? 'details' : `${editor.kind}.save`, values })
    setEditor(null)
    setMessage(text('Änderung gespeichert.', 'Change saved.'))
    await refresh(true)
  }
  function askDelete(kind, entry) { setDeleteError(''); setDeletion({ kind, entry, mutationId: crypto.randomUUID() }) }
  async function deleteRecord() {
    if (deleting) return
    setDeleting(true)
    setMessage(''); setDeleteError('')
    try {
      await mutateContract(id, { action: `${deletion.kind}.delete`, recordId: deletion.entry.id, expectedRevision: deletion.entry.revision || 0, mutationId: deletion.mutationId })
      setDeletion(null); setMessage(text('Eintrag gelöscht.', 'Entry deleted.'))
      await refresh(true)
    } catch (failure) { setDeleteError(contractMutationError(failure, language)) }
    finally { setDeleting(false) }
  }
  async function addNote(event) {
    event.preventDefault()
    if (noteSaving || !note.trim()) return
    const value = note.trim()
    if (noteAttempt.current?.text !== value) noteAttempt.current = { text: value, recordId: crypto.randomUUID(), mutationId: crypto.randomUUID() }
    setNoteSaving(true)
    setError(''); setMessage('')
    try {
      const { recordId, mutationId } = noteAttempt.current
      await mutateContract(id, { action: 'note.add', recordId, mutationId, expectedRevision: 0, values: { text: value } })
      setNote(''); noteAttempt.current = null; setMessage(text('Notiz hinzugefügt.', 'Note added.'))
      await refresh(true)
    } catch (failure) { setError(contractMutationError(failure, language)) }
    finally { setNoteSaving(false) }
  }
  function actions(kind, entry) {
    return editable ? <div className="contract-row-actions"><button type="button" className="button button--secondary" onClick={() => setEditor({ kind, entry })} aria-label={`${text('Bearbeiten', 'Edit')}: ${entry.title}`} title={text('Bearbeiten', 'Edit')}><EditIcon size={16} /></button><button type="button" className="button button--secondary" onClick={() => askDelete(kind, entry)} aria-label={`${text('Löschen', 'Delete')}: ${entry.title}`} title={text('Löschen', 'Delete')}><TrashIcon size={16} /></button></div> : null
  }
  const errorText = error === 'load' ? text('Die Vertragsakte konnte nicht vollständig geladen werden. Bitte erneut versuchen.', 'The contract file could not be fully loaded. Please retry.') : error === 'saved-refresh' ? text('Gespeichert. Die Ansicht konnte anschließend nicht aktualisiert werden. Bitte neu laden, bevor du weiter bearbeitest.', 'Saved. The view could not be refreshed afterwards. Reload before making further changes.') : error
  if (loading) return <p role="status">{text('Vertragsakte wird geladen …', 'Loading contract file …')}</p>
  if (!data?.contract) return <div className="contracts-page"><BackLink to="/vertragsmanagement/vertraege" /><p role={error ? 'alert' : undefined}>{error ? errorText : text('Dieser Vertrag wurde nicht gefunden.', 'This contract was not found.')}</p>{error && <button className="button" onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>{text('Erneut versuchen', 'Retry')}</button>}</div>
  const { contract, positions, deadlines, notes, history } = data
  const orderedPositions = [...positions].sort((left, right) => left.title.localeCompare(right.title, language))
  const orderedDeadlines = [...deadlines].sort((left, right) => Number(left.completed) - Number(right.completed) || `${left.date}${left.time}`.localeCompare(`${right.date}${right.time}`))
  const nextDeadline = orderedDeadlines.find((entry) => !entry.completed)
  const totals = contractCostTotals(positions)
  return <div className="contracts-page contract-file">
    <BackLink to="/vertragsmanagement/vertraege" />
    <header className="detail-header"><div><p>{text('Vertragsakte', 'Contract file')}{contract.contractNumber ? ` · ${contract.contractNumber}` : ''}</p><h2>{contract.partnerName}</h2></div></header>
    {message && <p className="contract-save-message" role="status">{message}</p>}
    {error && <div className="form-error" role="alert"><p>{errorText}</p><button className="button button--secondary" onClick={() => refresh()}>{text('Akte neu laden', 'Reload file')}</button></div>}
    <div className="todo-detail-layout contract-file__grid"><main className="todo-detail-main">
      <section className="todo-detail-content" aria-labelledby="contract-positions-title">
        <div className="todo-detail-section-heading"><h3 id="contract-positions-title">{text('Vertragspositionen', 'Contract positions')}</h3>{editable && <button className="button" onClick={() => setEditor({ kind: 'position', entry: null })}>{text('Position hinzufügen', 'Add position')}</button>}</div>
        <div className="contracts-table-frame"><table className="data-table contract-positions-table"><thead><tr><th scope="col">{text('Position', 'Position')}</th><th scope="col">{text('Bruttobetrag', 'Gross amount')}</th><th scope="col">{text('Rhythmus', 'Billing cycle')}</th><th scope="col">{text('Bezugsdatum', 'Anchor date')}</th>{editable && <th scope="col" className="contract-actions-column"><span className="sr-only">{text('Aktionen', 'Actions')}</span></th>}</tr></thead><tbody>
          {orderedPositions.map((entry) => <tr key={entry.id}><td><strong>{entry.title}</strong>{entry.note && <span className="table-subline">{entry.note}</span>}</td><td>{formatContractMoney(entry.grossAmountCents, language)}</td><td>{contractLabel(CONTRACT_CYCLES, entry.billingCycle, language)}</td><td>{formatContractDate(entry.anchorDate, language)}<small className="table-subline">{text('Nächste Fälligkeit: ', 'Next due: ')}{formatContractDate(nextContractCharge(entry.anchorDate, entry.billingCycle), language)}</small></td>{editable && <td className="contract-actions-column">{actions('position', entry)}</td>}</tr>)}
          {!positions.length && <tr><td className="table-state" colSpan={editable ? 5 : 4}>{text('Noch keine Vertragspositionen hinterlegt.', 'No contract positions yet.')}</td></tr>}
        </tbody></table></div>
        {positions.length > 0 && <dl className="contract-cost-summary">{Object.entries(totals).filter(([cycle]) => positions.some((entry) => entry.billingCycle === cycle)).map(([cycle, amount]) => <div key={cycle}><dt>{contractLabel(CONTRACT_CYCLES, cycle, language)} · {text('brutto', 'gross')}</dt><dd>{formatContractMoney(amount, language)}</dd></div>)}</dl>}
      </section>
      <section className="todo-detail-content" aria-labelledby="contract-deadlines-title">
        <div className="todo-detail-section-heading"><h3 id="contract-deadlines-title">{text('Termine & Fristen', 'Appointments & deadlines')}</h3>{editable && <button className="button" onClick={() => setEditor({ kind: 'deadline', entry: null })}>{text('Termin / Frist hinzufügen', 'Add appointment / deadline')}</button>}</div>
        {selectedDeadline && !deadlines.some((entry) => entry.id === selectedDeadline) && <p role="status">{text('Der verlinkte Termin ist nicht mehr vorhanden.', 'The linked appointment is no longer available.')}</p>}
        <div className="contracts-table-frame"><table className="data-table"><thead><tr><th scope="col">{text('Bezeichnung / Art', 'Description / type')}</th><th scope="col">{text('Datum / Uhrzeit', 'Date / time')}</th><th scope="col">Status</th>{editable && <th scope="col" className="contract-actions-column"><span className="sr-only">{text('Aktionen', 'Actions')}</span></th>}</tr></thead><tbody>
          {orderedDeadlines.map((entry) => <tr key={entry.id} id={`contract-deadline-${entry.id}`} className={selectedDeadline === entry.id ? 'contract-deadline--selected' : ''}><td><strong>{entry.title}</strong><span className="table-subline">{contractLabel(CONTRACT_DEADLINE_TYPES, entry.type, language)}</span>{entry.note && <span className="table-subline">{entry.note}</span>}</td><td><Link to={calendarPath({ date: entry.date, calendarId: 'system-contracts', eventId: `contract:${id}:deadline:${entry.id}` })}>{formatContractDate(entry.date, language)}{entry.time ? ` · ${entry.time}` : ''}</Link></td><td><span className={`contract-deadline-status${!entry.completed && entry.date < localContractDate() ? ' contract-deadline-status--overdue' : ''}`}>{entry.completed ? text('Erledigt', 'Completed') : entry.date < localContractDate() ? text('Überfällig', 'Overdue') : text('Offen', 'Open')}</span></td>{editable && <td className="contract-actions-column">{actions('deadline', entry)}</td>}</tr>)}
          {!deadlines.length && <tr><td className="table-state" colSpan={editable ? 4 : 3}>{text('Noch keine Termine oder Fristen hinterlegt.', 'No appointments or deadlines yet.')}</td></tr>}
        </tbody></table></div>
      </section>
      <ContractDocumentsSection key={id} contractId={id} canEdit={editable} onChanged={() => refresh(true)} />
      <section className="todo-updates" aria-labelledby="contract-notes-title"><div className="todo-updates__heading"><h3 id="contract-notes-title">{text('Notizen', 'Notes')}</h3></div>
        {editable && <form className="todo-updates__form" onSubmit={addNote}><label className="form-field contract-note-input"><span className="sr-only">{text('Neue Notiz', 'New note')}</span><textarea rows={3} maxLength={4000} value={note} disabled={noteSaving} onChange={(event) => setNote(event.target.value)} /></label><button className="button" type="submit" disabled={noteSaving || !note.trim()}>{noteSaving ? text('Wird gespeichert …', 'Saving …') : text('Notiz hinzufügen', 'Add note')}</button></form>}
        {!notes.length ? <p className="todo-updates__empty">{text('Noch keine Notizen vorhanden.', 'No notes yet.')}</p> : <ol className="todo-updates__list">{notes.map((entry) => <li key={entry.id} className="todo-updates__item todo-updates__item--note"><div><strong>{entry.createdByName}</strong><span>{formatContractTimestamp(entry.createdAt, language)}</span></div><p>{entry.text}</p></li>)}</ol>}
        {notes.length === 50 && <p className="contract-muted">{text('Die letzten 50 Notizen werden angezeigt.', 'Showing the latest 50 notes.')}</p>}
      </section>
      <section className="todo-updates todo-history" aria-labelledby="contract-history-title"><div className="todo-updates__heading"><h3 id="contract-history-title">{text('Historie', 'History')}</h3></div>
        <ol className="todo-updates__list">{history.map((entry) => <li key={entry.id} className="todo-updates__item todo-updates__item--system"><div><strong>{entry.createdByName}</strong><span>{formatContractTimestamp(entry.createdAt, language)}</span></div><p>{contractLabel(historyLabels, entry.action, language)}{entry.targetLabel ? ` · ${entry.targetLabel}` : ''}</p></li>)}<li className="todo-updates__item todo-updates__item--system"><div><strong>{text('Vertragsakte angelegt', 'Contract file created')}</strong><span>{formatContractTimestamp(contract.createdAt, language)}</span></div></li></ol>
        {history.length === 50 && <p className="contract-muted">{text('Die letzten 50 Änderungen werden angezeigt.', 'Showing the latest 50 changes.')}</p>}
      </section>
    </main><aside className="todo-detail-sidebar">
      <section><div className="todo-detail-section-heading"><h3>{text('Vertragsdaten', 'Contract details')}</h3>{editable && <button className="button button--secondary" onClick={() => setEditor({ kind: 'details', entry: contract })}>{text('Bearbeiten', 'Edit')}</button>}</div><dl><div><dt>{text('Vertragspartner', 'Contract partner')}</dt><dd>{contract.partnerName}</dd></div><div><dt>{text('Vertragsnummer', 'Contract number')}</dt><dd>{contract.contractNumber || '—'}</dd></div><div><dt>{text('Kundennummer', 'Customer number')}</dt><dd>{contract.customerNumber || '—'}</dd></div></dl>{contract.description && <p className="contract-description">{contract.description}</p>}</section>
      <section><h3>{text('Nächster Termin / Frist', 'Next appointment / deadline')}</h3>{nextDeadline ? <><strong>{nextDeadline.title}</strong><p>{formatContractDate(nextDeadline.date, language)}{nextDeadline.time ? ` · ${nextDeadline.time}` : ''}</p></> : <p>{text('Keine offenen Termine oder Fristen.', 'No open appointments or deadlines.')}</p>}</section>
      <section><h3>{text('Systeminformationen', 'System information')}</h3><dl><div><dt>{text('Angelegt am', 'Created on')}</dt><dd>{formatContractTimestamp(contract.createdAt, language)}</dd></div>{contract.updatedAt && <><div><dt>{text('Zuletzt geändert am', 'Last changed on')}</dt><dd>{formatContractTimestamp(contract.updatedAt, language)}</dd></div><div><dt>{text('Zuletzt geändert von', 'Last changed by')}</dt><dd>{contract.updatedByName || '—'}</dd></div></>}</dl></section>
    </aside></div>
    {editor && editable && <ContractRecordModal kind={editor.kind} entry={editor.entry} onClose={() => setEditor(null)} onSave={saveRecord} />}
    <ConfirmDialog open={Boolean(deletion)} isSubmitting={deleting} title={text('Eintrag löschen?', 'Delete entry?')} message={deleteError || `${deletion?.entry.title || ''} · ${text('Dieser Eintrag wird gelöscht. Die Änderung bleibt in der Historie nachvollziehbar.', 'This entry will be deleted. The change remains recorded in history.')}`} confirmLabel={deleteError ? text('Erneut versuchen', 'Retry') : text('Löschen', 'Delete')} onCancel={() => { if (!deleting) { setDeletion(null); setDeleteError('') } }} onConfirm={deleteRecord} variant="danger" />
  </div>
}
