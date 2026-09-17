import { useEffect, useState } from 'react'
import { createEmptyInsolvencyDeadline, insolvencyDeadlinePresentation } from '../../lib/insolvencies.js'
import { EditIcon } from '../icons.jsx'

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function formatTimestamp(value) {
  const date = value?.toDate?.()
  return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—'
}

function deadlineClass(deadline) {
  const kind = insolvencyDeadlinePresentation(deadline).kind
  return kind === 'overdue' ? 'damage-deadlines__date damage-deadlines__date--overdue' : kind === 'today' ? 'damage-deadlines__date damage-deadlines__date--today' : kind === 'urgent' ? 'damage-deadlines__date damage-deadlines__date--urgent' : kind === 'warning' ? 'damage-deadlines__date damage-deadlines__date--warning' : 'damage-deadlines__date'
}

function deadlineDisplay(deadline) {
  return `${insolvencyDeadlinePresentation(deadline).label} · ${formatDate(deadline.date)}`
}

function DeadlineModal({ canEdit, deadline, mode, onClose, onSave }) {
  const [editing, setEditing] = useState(mode === 'new')
  const [values, setValues] = useState(() => ({ date: deadline?.date || createEmptyInsolvencyDeadline().date, reminderEnabled: Boolean(deadline?.reminderEnabled), note: deadline?.note || '' }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, saving])

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setError('')
  }

  function beginEditing() {
    setValues({ date: deadline.date, reminderEnabled: Boolean(deadline.reminderEnabled), note: deadline.note || '' })
    setError('')
    setEditing(true)
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(mode === 'new' ? null : deadline, values)
      onClose()
    } catch (saveError) {
      setError(saveError.message || 'Der Termin konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  const title = mode === 'new' ? 'Termin hinzufügen' : editing ? 'Termin bearbeiten' : 'Termindetails'
  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="todo-quick-edit-modal damage-deadline-modal" role="dialog" aria-modal="true" aria-labelledby="insolvency-deadline-modal-title">
      <form className="todo-quick-editor" onSubmit={submit} noValidate>
        <div className="todo-quick-editor__heading damage-deadline-modal__heading"><h2 id="insolvency-deadline-modal-title">{title}</h2>{canEdit && mode !== 'new' && !editing && <button className="todo-detail-section-edit" type="button" onClick={beginEditing} title="Termin bearbeiten" aria-label="Termin bearbeiten"><EditIcon size={14} /></button>}</div>
        {editing ? <div className="todo-quick-editor__grid damage-deadline-modal__fields">
          <label className="form-field"><span>Datum *</span><input autoFocus type="date" value={values.date} required onChange={(event) => update('date', event.target.value)} /></label>
          <label className="form-field"><span>Erinnerung</span><select value={values.reminderEnabled ? 'on' : 'off'} onChange={(event) => update('reminderEnabled', event.target.value === 'on')}><option value="off">Aus</option><option value="on">An</option></select></label>
          <label className="form-field damage-deadline-modal__note"><span>Bemerkung</span><textarea rows="5" value={values.note} maxLength="4000" onChange={(event) => update('note', event.target.value)} /></label>
        </div> : <div className="damage-deadline-modal__details">
          <section><h3>Termininformationen</h3><dl><div><dt>Datum</dt><dd><span className={deadlineClass(deadline)}>{deadlineDisplay(deadline)}</span></dd></div><div><dt>Erinnerung</dt><dd><span className={deadline.reminderEnabled ? 'damage-deadlines__reminder damage-deadlines__reminder--on' : 'damage-deadlines__reminder'}>{deadline.reminderEnabled ? 'An' : 'Aus'}</span></dd></div><div><dt>Bemerkung</dt><dd className="damage-deadline-modal__note-value">{deadline.note || '—'}</dd></div></dl></section>
          <section><h3>Systeminformationen</h3><dl><div><dt>Erstellt von</dt><dd>{deadline.createdByName || '—'}</dd></div><div><dt>Erstellt am</dt><dd>{formatTimestamp(deadline.createdAt)}</dd></div><div><dt>Zuletzt aktualisiert von</dt><dd>{deadline.updatedByName || '—'}</dd></div><div><dt>Zuletzt aktualisiert am</dt><dd>{formatTimestamp(deadline.updatedAt)}</dd></div></dl></section>
        </div>}
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">{editing ? <><button className="button button--secondary" type="button" disabled={saving} onClick={mode === 'new' ? onClose : () => setEditing(false)}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></> : <button className="button button--secondary" type="button" onClick={onClose}>Schließen</button>}</div>
      </form>
    </section>
  </div>
}

export default function InsolvencyDeadlinesCard({ canEdit, deadlines, loading, onSave }) {
  const [modal, setModal] = useState(null)
  function openDetails(deadline) { setModal({ mode: 'details', deadline }) }
  function handleRowKeyDown(event, deadline) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openDetails(deadline)
    }
  }

  return <section className="todo-detail-content damage-deadlines" aria-labelledby="insolvency-deadlines-title">
    {modal && <DeadlineModal canEdit={canEdit} deadline={modal.deadline} mode={modal.mode === 'new' ? 'new' : 'details'} onClose={() => setModal(null)} onSave={onSave} />}
    <div className="todo-detail-section-heading"><h3 id="insolvency-deadlines-title">Termine &amp; Fristen</h3>{canEdit && <button className="button damage-deadlines__add" type="button" onClick={() => setModal({ mode: 'new', deadline: null })}>Termin hinzufügen</button>}</div>
    <div className="todos-table-frame damage-deadlines__table-frame"><table className="data-table todos-table damage-deadlines__table"><thead><tr><th>Datum</th><th>Erinnerung</th><th>Bemerkung</th></tr></thead><tbody>
      {loading ? <tr><td className="table-state" colSpan="3">Termine werden geladen …</td></tr> : !deadlines.length ? <tr><td className="table-state" colSpan="3">Noch keine Termine oder Fristen hinterlegt.</td></tr> : deadlines.map((deadline) => <tr key={deadline.id} className="damage-deadlines__row" tabIndex="0" role="button" onClick={() => openDetails(deadline)} onKeyDown={(event) => handleRowKeyDown(event, deadline)} aria-label={`Termin vom ${formatDate(deadline.date)} öffnen`}><td><span className={deadlineClass(deadline)}>{deadlineDisplay(deadline)}</span></td><td><span className={deadline.reminderEnabled ? 'damage-deadlines__reminder damage-deadlines__reminder--on' : 'damage-deadlines__reminder'}>{deadline.reminderEnabled ? 'An' : 'Aus'}</span></td><td className="damage-deadlines__note" title={deadline.note || ''}>{deadline.note || '—'}</td></tr>)}
    </tbody></table></div>
  </section>
}
