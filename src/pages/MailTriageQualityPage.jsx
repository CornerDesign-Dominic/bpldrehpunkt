import { mailTriageSourceName } from '../lib/mailTriagePresentation.js'
import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useLanguage } from '../i18n/useLanguage.js'
import { usePermissions } from '../auth/usePermissions.js'
import { functions, waitForAppCheckToken } from '../lib/firebase.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { MAIL_TRIAGE_ACTIONS, MAIL_TRIAGE_QUESTIONS, MAIL_TRIAGE_REJECTION_REASONS, MAIL_TRIAGE_REVIEW_STATUSES } from '../../shared/mailboxTriage.js'
import { mailTriageActionName, mailTriageOutcomeName, mailTriageChoiceName, mailTriageDate, mailTriageFilterPayload, mailTriageDeletionItems } from '../lib/mailTriageQuality.js'
import KnowledgeDialog from '../components/quality/KnowledgeDialog.jsx'
import '../styles/quality.css'
import '../styles/mailTriageQuality.css'

async function qualityCall(action, data, stage) {
  try {
    await waitForAppCheckToken()
    return (await httpsCallable(functions, action)(data)).data
  } catch (error) {
    if (error.code !== 'functions/aborted') void reportTechnicalFailure({ module: 'mailTriageQuality', stage, error, ...(data.id ? { recordId: data.id } : {}) })
    throw error
  }
}
const blankFilters = { status: '', outcome: '', kind: '', mailbox: '', dateFrom: '', dateUntil: '' }

function DecisionDetails({ decision, language }) {
  const en = language === 'en', text = (de, english) => en ? english : de
  if (!decision) return <p className="mail-triage-quality-muted">{text('Für diese Rückmeldung liegt noch keine strukturierte Maileinordnung vor.', 'No structured mail classification is available for this feedback.')}</p>
  const attachmentNames = { not_present: text('Keine Anhänge', 'No attachments'), not_read: text('Anhänge nicht gelesen', 'Attachments not read'), partial: text('Anhänge teilweise gelesen', 'Attachments partially read'), read: text('Anhänge gelesen', 'Attachments read') }
  return <>
    <dl className="mail-triage-quality-answers">{MAIL_TRIAGE_QUESTIONS.map(question => {
      const answer = (decision.answers || []).find(item => item.key === question.key)
      return <div key={question.key}><dt>{question[en ? 'en' : 'de']}</dt><dd>{answer?.value || text('Nicht erkannt', 'Not identified')}{answer?.quote && <details><summary>{text('Fundstelle', 'Source evidence')}</summary><small>{mailTriageSourceName(answer.sourceId, decision.coverage, language)}</small><blockquote>{answer.quote}</blockquote></details>}</dd></div>
    })}</dl>
    {(decision.actions || []).length > 0 && <section><h3>{text('Vorgeschlagene Aktionen', 'Suggested actions')}</h3><ul className="mail-triage-quality-proposals">{decision.actions.map((action, index) => <li key={`${action.kind}-${index}`}><strong>{mailTriageActionName(action.kind, language)}</strong><small>{({ high: text('Hohe Sicherheit', 'High confidence'), medium: text('Mittlere Sicherheit', 'Medium confidence'), low: text('Geringe Sicherheit', 'Low confidence') })[action.confidence] || '—'}</small>{action.reason && <p>{action.reason}</p>}{action.quote && <details><summary>{text('Fundstelle', 'Source evidence')}</summary><small>{mailTriageSourceName(action.sourceId, decision.coverage, language)}</small><blockquote>{action.quote}</blockquote></details>}</li>)}</ul></section>}
    <section><h3>{text('Berücksichtigte Quellen', 'Sources considered')}</h3><p>{decision.coverage?.mail ? decision.coverage?.mailTruncated ? text('Mailtext auszugsweise berücksichtigt', 'Message considered in part') : text('Aktuelle Mail gelesen', 'Current mail read') : text('Leseumfang nicht bekannt', 'Reading coverage unknown')}{decision.coverage?.forwarded && ` · ${text('Weitergeleitete Nachricht berücksichtigt', 'Forwarded message included')}`} · {attachmentNames[decision.coverage?.attachments] || text('Anhangsprüfung nicht bekannt', 'Attachment coverage unknown')}</p>{decision.coverage?.documentNames?.length > 0 && <ul>{decision.coverage.documentNames.map((name, index) => <li key={index}>{name}</li>)}</ul>}{decision.coverage?.unreadable?.length > 0 && <p className="mail-triage-quality-warning">{text('Nicht lesbar:', 'Unreadable:')} {decision.coverage.unreadable.join(', ')}</p>}<small>{text('Auswertungsversion', 'Classification version')}: {decision.version || '—'}{decision.promptVersion && ` · ${decision.promptVersion}`}{decision.model && ` · ${decision.model}`} · {text('Ergebnis', 'Outcome')}: {({ actionable: text('Handlung erkannt', 'Action identified'), information: text('Nur Information', 'Information only'), unclear: text('Unklar', 'Unclear'), incomplete: text('Unvollständig', 'Incomplete') })[decision.status] || '—'}</small></section>
  </>
}

function FeedbackReview({ item, language, editable, deletable, onClose, onSaved, onDelete }) {
  const en = language === 'en', text = (de, english) => en ? english : de
  const [status, setStatus] = useState(item.status || 'new'), [note, setNote] = useState(item.reviewNote || '')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false)
  const dirty = status !== (item.status || 'new') || note !== (item.reviewNote || '')
  useEffect(() => {
    if (!dirty) return undefined
    const prevent = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  function close() { if (!busy) { if (dirty) setDiscard(true); else onClose() } }
  async function save(event) {
    event.preventDefault()
    if (busy || !editable) return
    setBusy(true); setError('')
    try { const result = await qualityCall('updateMailboxTriageFeedback', { id: item.id, revision: item.revision, status, reviewNote: note }, 'save'); onSaved(result.item) }
    catch (failure) { setError(failure.code === 'functions/aborted' ? text('Dieser Eintrag wurde inzwischen geändert. Bitte schließen, neu laden und erneut prüfen.', 'This entry changed. Close, reload and review it again.') : text('Die Auswertung konnte nicht gespeichert werden. Bitte erneut versuchen.', 'Could not save the review. Please try again.')) }
    finally { setBusy(false) }
  }
  return <KnowledgeDialog title={text('Maileinordnung auswerten', 'Review mail classification')} large onClose={close}>
    <p className="mail-triage-quality-subject">{item.subject || text('Ohne Betreff', 'No subject')}</p>
    <div className="mail-triage-quality-meta"><strong>{mailTriageOutcomeName(item.outcome, language)}</strong><span>{item.mailboxEmail || '—'}</span><span>{mailTriageDate(item.createdAtMillis, language)}</span></div>
    <section className="mail-triage-quality-feedback"><h3>{text('Nutzerkorrektur', 'User feedback')}</h3><dl className="mail-triage-quality-answers"><div><dt>{text('Aktion', 'Action')}</dt><dd>{mailTriageActionName(item.kind, language)}</dd></div><div><dt>{text('Grund', 'Reason')}</dt><dd>{mailTriageChoiceName(MAIL_TRIAGE_REJECTION_REASONS, item.reason, language)}</dd></div>{item.correctKind && <div><dt>{text('Richtige Aktion', 'Correct action')}</dt><dd>{mailTriageActionName(item.correctKind, language)}</dd></div>}{item.comment && <div><dt>{text('Kommentar', 'Comment')}</dt><dd>{item.comment}</dd></div>}<div><dt>{text('Gemeldet von', 'Reported by')}</dt><dd>{item.createdByName || item.createdBy || '—'}</dd></div></dl></section>
    <DecisionDetails decision={item.decision} language={language} />
    {error && <p className="form-error" role="alert">{error}</p>}
    {discard && <div className="quality-discard" role="alert"><p>{text('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?')}</p><button className="button button--secondary" onClick={() => setDiscard(false)}>{text('Weiter bearbeiten', 'Keep editing')}</button> <button className="button button--danger" onClick={onClose}>{text('Verwerfen', 'Discard')}</button></div>}
    <form onSubmit={save}><fieldset className="quality-fields" disabled={!editable || busy}><label className="form-field"><span>{text('Bearbeitungsstand', 'Review status')}</span><select value={status} onChange={event => setStatus(event.target.value)}>{MAIL_TRIAGE_REVIEW_STATUSES.map(choice => <option value={choice.id} key={choice.id}>{choice[en ? 'en' : 'de']}</option>)}</select></label><label className="form-field"><span>{text('Auswertung / abgeleitete Verbesserung', 'Review / resulting improvement')}</span><textarea rows={4} maxLength={4000} value={note} onChange={event => setNote(event.target.value)} /></label></fieldset><div className="quality-inline quality-actions mail-triage-quality-detail-actions">{deletable && <button className="button button--danger" type="button" disabled={busy || dirty} onClick={() => onDelete([item])}>{text('Rückmeldung löschen', 'Delete feedback')}</button>}{editable && <button className="button" type="submit" disabled={busy || !dirty}>{busy ? text('Wird gespeichert …', 'Saving …') : text('Speichern', 'Save')}</button>}</div></form>
  </KnowledgeDialog>
}

export default function MailTriageQualityPage() {
  const { language } = useLanguage(), { canEdit } = usePermissions()
  const en = language === 'en', text = (de, english) => en ? english : de
  const editable = canEdit('mailTriageQuality'), deletable = canEdit('mailTriageCleanup')
  const [draft, setDraft] = useState(blankFilters), [filters, setFilters] = useState({})
  const [cursors, setCursors] = useState([null]), [page, setPage] = useState(0), [retry, setRetry] = useState(0)
  const [loaded, setState] = useState({ key: '', items: [], nextCursor: null, error: '' })
  const [selection, setSelection] = useState({ key: '', ids: [] }), [review, setReview] = useState(null), [deleting, setDeleting] = useState(null), [deleteBusy, setDeleteBusy] = useState(false), [deleteError, setDeleteError] = useState('')
  const cursor = cursors[page]
  const requestKey = JSON.stringify([filters, cursor, retry])
  const state = loaded.key === requestKey ? loaded : { loading: true, items: [], nextCursor: null, error: '' }
  const selected = selection.key === requestKey ? selection.ids : []
  const setSelected = value => setSelection(previous => ({ key: requestKey, ids: typeof value === 'function' ? value(previous.key === requestKey ? previous.ids : []) : value }))
  useEffect(() => {
    let active = true
    qualityCall('listMailboxTriageFeedback', { ...filters, ...(cursor ? { cursor } : {}) }, 'load').then(result => {
      if (active) setState({ key: requestKey, loading: false, items: result.items || [], nextCursor: result.nextCursor || null, error: '' })
    }).catch(() => { if (active) setState({ key: requestKey, loading: false, items: [], nextCursor: null, error: true }) })
    return () => { active = false }
  }, [filters, cursor, retry, requestKey])
  function applyFilters(event) { event.preventDefault(); setFilters(mailTriageFilterPayload(draft)); setCursors([null]); setPage(0) }
  function reload() { setRetry(value => value + 1) }
  function saved(item) { setState(previous => ({ ...previous, items: previous.items.map(record => record.id === item.id ? item : record) })); setReview(item) }
  function requestDelete(items) { if (deletable && items.length) { setDeleting(items); setDeleteError('') } }
  async function remove() {
    if (deleteBusy || !deleting?.length || !deletable) return
    setDeleteBusy(true); setDeleteError('')
    try {
      const result = await qualityCall('deleteMailboxTriageFeedback', { items: mailTriageDeletionItems(deleting, deleting.map(item => item.id)) }, 'delete')
      const deletedIds = new Set(result.deletedIds || [])
      if (review && deletedIds.has(review.id)) setReview(null)
      setDeleting(null); setSelected([]); reload()
    } catch (failure) { setDeleteError(failure.code === 'functions/aborted' ? text('Mindestens ein Eintrag wurde inzwischen geändert. Bitte abbrechen und neu laden.', 'At least one entry changed. Cancel and reload.') : text('Die Rückmeldungen konnten nicht gelöscht werden. Bitte erneut versuchen.', 'Could not delete the feedback. Please try again.')) }
    finally { setDeleteBusy(false) }
  }
  const field = key => ({ value: draft[key], onChange: event => setDraft(previous => ({ ...previous, [key]: event.target.value })) })
  return <div className="quality-page mail-triage-quality-page">
    <form className="mail-triage-quality-filters" onSubmit={applyFilters}>
      <label className="form-field"><span>{text('Von', 'From')}</span><input type="date" {...field('dateFrom')} /></label><label className="form-field"><span>{text('Bis', 'Until')}</span><input type="date" min={draft.dateFrom || undefined} {...field('dateUntil')} /></label>
      <label className="form-field"><span>{text('Postfach', 'Mailbox')}</span><input type="email" placeholder={text('Alle Postfächer', 'All mailboxes')} {...field('mailbox')} /></label>
      <label className="form-field"><span>{text('Aktion', 'Action')}</span><select {...field('kind')}><option value="">{text('Alle', 'All')}</option>{MAIL_TRIAGE_ACTIONS.map(kind => <option value={kind} key={kind}>{mailTriageActionName(kind, language)}</option>)}</select></label>
      <label className="form-field"><span>{text('Rückmeldung', 'Feedback')}</span><select {...field('outcome')}><option value="">{text('Alle', 'All')}</option>{['rejected', 'missed'].map(outcome => <option value={outcome} key={outcome}>{mailTriageOutcomeName(outcome, language)}</option>)}</select></label>
      <label className="form-field"><span>{text('Stand', 'Status')}</span><select {...field('status')}><option value="">{text('Alle', 'All')}</option>{MAIL_TRIAGE_REVIEW_STATUSES.map(choice => <option value={choice.id} key={choice.id}>{choice[en ? 'en' : 'de']}</option>)}</select></label>
      <button className="button button--secondary" type="submit" disabled={deleteBusy}>{text('Filtern', 'Filter')}</button>
    </form>
    <div className="mail-triage-quality-list-tools"><span>{text('Geladene Rückmeldungen', 'Loaded feedback')}: {state.items.length}</span><button className="button button--secondary" disabled={state.loading || deleteBusy} onClick={reload}>{text('Neu laden', 'Reload')}</button>{deletable && <button className="button button--danger" disabled={!selected.length || deleteBusy || state.loading} onClick={() => requestDelete(state.items.filter(item => selected.includes(item.id)))}>{text('Auswahl löschen', 'Delete selected')} ({selected.length})</button>}</div>
    {state.loading ? <p role="status">{text('Maileinordnungen werden geladen …', 'Loading mail classifications …')}</p> : state.error ? <p role="alert" className="form-error">{text('Die Rückmeldungen konnten nicht geladen werden. Bitte erneut laden.', 'Could not load feedback. Please reload.')}</p> : !state.items.length ? <p className="quality-empty">{state.nextCursor ? text('Auf dieser Seite keine passenden Rückmeldungen. Weitere Seite prüfen.', 'No matching feedback on this page. Check the next page.') : text('Keine passenden Rückmeldungen vorhanden.', 'No matching feedback available.')}</p> : <div className="mail-triage-quality-table-wrap"><table className="mail-triage-quality-table"><thead><tr>{deletable && <th><input type="checkbox" aria-label={text('Alle geladenen Rückmeldungen auswählen', 'Select all loaded feedback')} checked={state.items.length > 0 && selected.length === state.items.length} onChange={event => setSelected(event.target.checked ? state.items.map(item => item.id) : [])} /></th>}<th>{text('Eingang', 'Created')}</th><th>{text('Postfach', 'Mailbox')}</th><th>{text('Betreff', 'Subject')}</th><th>{text('Aktion', 'Action')}</th><th>{text('Rückmeldung', 'Feedback')}</th><th>{text('Grund', 'Reason')}</th><th>{text('Stand', 'Status')}</th><th><span className="sr-only">{text('Öffnen', 'Open')}</span></th></tr></thead><tbody>{state.items.map(item => <tr key={item.id}>{deletable && <td><input type="checkbox" aria-label={`${text('Auswählen', 'Select')}: ${mailTriageActionName(item.kind, language)} · ${mailTriageDate(item.createdAtMillis, language)}`} checked={selected.includes(item.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} /></td>}<td>{mailTriageDate(item.createdAtMillis, language)}</td><td>{item.mailboxEmail || '—'}</td><td>{item.subject || text('Ohne Betreff', 'No subject')}</td><td>{mailTriageActionName(item.kind, language)}</td><td>{mailTriageOutcomeName(item.outcome, language)}</td><td>{mailTriageChoiceName(MAIL_TRIAGE_REJECTION_REASONS, item.reason, language)}</td><td>{mailTriageChoiceName(MAIL_TRIAGE_REVIEW_STATUSES, item.status, language)}</td><td><button className="button button--secondary" onClick={() => setReview(item)}>{text('Auswerten', 'Review')}</button></td></tr>)}</tbody></table></div>}
    <nav className="mail-triage-quality-pagination" aria-label={text('Ergebnisseiten', 'Result pages')}><button className="button button--secondary" disabled={page === 0 || state.loading || deleteBusy} onClick={() => setPage(value => value - 1)}>{text('Zurück', 'Previous')}</button><span>{text('Seite', 'Page')} {page + 1}</span><button className="button button--secondary" disabled={!state.nextCursor || state.loading || deleteBusy} onClick={() => { setCursors(previous => [...previous.slice(0, page + 1), state.nextCursor]); setPage(value => value + 1) }}>{text('Weitere', 'Next')}</button></nav>
    {review && <FeedbackReview key={`${review.id}:${review.revision}`} item={review} language={language} editable={editable} deletable={deletable} onClose={() => setReview(null)} onSaved={saved} onDelete={requestDelete} />}
    {deleting && <KnowledgeDialog title={text('Rückmeldungen löschen', 'Delete feedback')} compact onClose={() => { if (!deleteBusy) setDeleting(null) }}><p>{text(`${deleting.length} ausgewählte Rückmeldungen dauerhaft löschen?`, `Permanently delete ${deleting.length} selected feedback entries?`)}</p><p>{text('Die Verwerfung einer Empfehlung bleibt erhalten. Mails, Akten und übernommene Verbesserungen werden nicht gelöscht.', 'Rejected recommendations stay dismissed. Mails, cases and adopted improvements are retained.')}</p>{deleteError && <p role="alert" className="form-error">{deleteError}</p>}<div className="quality-inline quality-actions"><button className="button button--secondary" disabled={deleteBusy} onClick={() => setDeleting(null)}>{text('Abbrechen', 'Cancel')}</button><button className="button button--danger" disabled={deleteBusy} onClick={() => void remove()}>{deleteBusy ? text('Wird gelöscht …', 'Deleting …') : text('Dauerhaft löschen', 'Delete permanently')}</button></div></KnowledgeDialog>}
  </div>
}
