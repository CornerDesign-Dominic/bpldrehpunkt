import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import { createPersonalNote, deletePersonalNote, updatePersonalNote, watchPersonalNotes } from '../lib/personalNotes.js'
import { formatPersonalNoteCreatedAt, PERSONAL_NOTE_SORT_OPTIONS, PERSONAL_NOTE_TEXT_MAX_LENGTH, PERSONAL_NOTE_TITLE_MAX_LENGTH, personalNoteValidation, sortPersonalNotes } from '../lib/personalNotesPresentation.js'
import '../styles/notes.css'

function NoteModal({ note, onClose, onDelete, onSave }) {
  const isNew = !note
  const [form, setForm] = useState(() => ({ title: note?.title || '', text: note?.text || '', importance: note?.importance || 'low', urgency: note?.urgency || 'low' }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const hasChanges = form.title !== (note?.title || '') || form.text !== (note?.text || '') || form.importance !== (note?.importance || 'low') || form.urgency !== (note?.urgency || 'low')
  const canSave = hasChanges && Boolean(form.title.trim()) && Boolean(form.text.trim())

  async function submit(event) {
    event.preventDefault()
    const validation = personalNoteValidation(form)
    if (!validation.valid) {
      setError(validation.message)
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(validation.values)
      onClose()
    } catch {
      setError('Die Notiz konnte nicht gespeichert werden. Bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  function levelSlider(field, label) {
    const high = form[field] === 'high'
    return <label className={`notes-level-control notes-level-control--${field}${high ? ' notes-level-control--high' : ''}`}><span className="notes-level-control__title">{label}</span><span className="notes-level-control__choice"><span className={!high ? 'notes-level-control__value notes-level-control__value--active' : 'notes-level-control__value'}>Niedrig</span><input className="sr-only" type="checkbox" role="switch" checked={high} aria-label={`${label}: ${high ? 'Hoch' : 'Niedrig'}`} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.checked ? 'high' : 'low' }))} /><span className={`notes-level-control__switch${high ? ' notes-level-control__switch--high' : ''}`} aria-hidden="true"><span /></span><span className={high ? 'notes-level-control__value notes-level-control__value--active' : 'notes-level-control__value'}>Hoch</span></span></label>
  }

  async function remove() {
    setDeleting(true)
    setError('')
    try {
      await onDelete()
      onClose()
    } catch {
      setDeleteConfirmationOpen(false)
      setError('Die Notiz konnte nicht gelöscht werden. Bitte erneut versuchen.')
    } finally {
      setDeleting(false)
    }
  }

  return <><div className="notes-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !deleting) onClose() }}>
    <section className="notes-modal" role="dialog" aria-modal="true" aria-labelledby="notes-modal-title">
      <div className="notes-modal__heading"><h2 id="notes-modal-title">{isNew ? 'Neue Notiz' : 'Notiz bearbeiten'}</h2><button type="button" onClick={onClose} disabled={saving} aria-label="Notiz schließen">×</button></div>
      <form onSubmit={submit} noValidate>
        <div className="notes-modal__fields">
          <div className="notes-modal__properties">{levelSlider('importance', 'Wichtigkeit')}{levelSlider('urgency', 'Dringlichkeit')}</div>
          <label className="form-field"><span>Titel</span><input autoFocus maxLength={PERSONAL_NOTE_TITLE_MAX_LENGTH} value={form.title} onChange={(event) => { setForm((current) => ({ ...current, title: event.target.value })); setError('') }} /></label>
          <label className="form-field"><span>Text</span><textarea rows="14" maxLength={PERSONAL_NOTE_TEXT_MAX_LENGTH} value={form.text} onChange={(event) => { setForm((current) => ({ ...current, text: event.target.value })); setError('') }} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="notes-modal__actions">{!isNew && <button className="button button--danger" type="button" disabled={saving || deleting} onClick={() => setDeleteConfirmationOpen(true)}>Löschen</button>}<button className="button button--secondary" type="button" disabled={saving || deleting} onClick={onClose}>Verwerfen</button><button className="button" type="submit" disabled={saving || deleting || !canSave}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>
      </form>
    </section>
  </div>{!isNew && <ConfirmDialog open={deleteConfirmationOpen} title="Notiz wirklich löschen?" message="Diese Notiz wird endgültig gelöscht und kann nicht wiederhergestellt werden." confirmLabel="Notiz löschen" submittingLabel="Wird gelöscht …" variant="danger" isSubmitting={deleting} onCancel={() => setDeleteConfirmationOpen(false)} onConfirm={() => void remove()} />}</>
}

function NoteCard({ note, onOpen }) {
  const createdAt = formatPersonalNoteCreatedAt(note.createdAt)
  return <button className="personal-note-card" type="button" onClick={() => onOpen(note)} aria-label={`Notiz öffnen: ${note.title}`}>
    <time className="personal-note-card__date" dateTime={note.createdAt?.toDate?.()?.toISOString()}>{createdAt}</time>
    <h3>{note.title}</h3>
    <p>{note.text}</p>
  </button>
}

export default function NotesPage() {
  const { user } = useAuth()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editingNote, setEditingNote] = useState(null)
  const [sort, setSort] = useState('created-desc')

  useEffect(() => {
    if (!user?.uid) return undefined
    return watchPersonalNotes(user.uid, (nextNotes) => {
      setNotes(nextNotes)
      setLoadError('')
      setLoading(false)
    }, () => {
      setLoadError('Die persönlichen Notizen konnten nicht geladen werden.')
      setLoading(false)
    })
  }, [user?.uid])

  async function save(values) {
    if (editingNote?.id) return updatePersonalNote(user.uid, editingNote.id, values)
    return createPersonalNote(user.uid, values)
  }

  const sortedNotes = useMemo(() => sortPersonalNotes(notes, sort), [notes, sort])

  return <div className="notes-page">
    <div className="notes-page__header"><label className="notes-sort"><span>Sortieren nach</span><select value={sort} onChange={(event) => setSort(event.target.value)}>{PERSONAL_NOTE_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button className="button" type="button" onClick={() => setEditingNote({})}>Neue Notiz</button></div>
    {loading ? <p className="notes-page__message">Notizen werden geladen …</p> : loadError ? <p className="form-error">{loadError}</p> : notes.length === 0 ? <div className="notes-page__empty"><h3>Noch keine Notizen</h3><p>Halte persönliche Hinweise, Ideen und Erinnerungen direkt hier fest.</p></div> : <div className="notes-page__grid">{sortedNotes.map((note) => <NoteCard key={note.id} note={note} onOpen={setEditingNote} />)}</div>}
    {editingNote && <NoteModal note={editingNote.id ? editingNote : null} onClose={() => setEditingNote(null)} onDelete={editingNote.id ? () => deletePersonalNote(user.uid, editingNote.id) : null} onSave={save} />}
  </div>
}
