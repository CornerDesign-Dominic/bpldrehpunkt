import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { createPersonalNote, updatePersonalNote, watchPersonalNotes } from '../lib/personalNotes.js'
import { formatPersonalNoteCreatedAt, PERSONAL_NOTE_TEXT_MAX_LENGTH, PERSONAL_NOTE_TITLE_MAX_LENGTH, personalNoteValidation } from '../lib/personalNotesPresentation.js'
import '../styles/notes.css'

function NoteModal({ note, onClose, onSave }) {
  const isNew = !note
  const [form, setForm] = useState(() => ({ title: note?.title || '', text: note?.text || '' }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

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

  return <div className="notes-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="notes-modal" role="dialog" aria-modal="true" aria-labelledby="notes-modal-title">
      <div className="notes-modal__heading"><h2 id="notes-modal-title">{isNew ? 'Neue Notiz' : 'Notiz bearbeiten'}</h2><button type="button" onClick={onClose} disabled={saving} aria-label="Notiz schließen">×</button></div>
      <form onSubmit={submit} noValidate>
        <div className="notes-modal__fields">
          <label className="form-field"><span>Titel</span><input autoFocus maxLength={PERSONAL_NOTE_TITLE_MAX_LENGTH} value={form.title} onChange={(event) => { setForm((current) => ({ ...current, title: event.target.value })); setError('') }} /></label>
          <label className="form-field"><span>Text</span><textarea rows="14" maxLength={PERSONAL_NOTE_TEXT_MAX_LENGTH} value={form.text} onChange={(event) => { setForm((current) => ({ ...current, text: event.target.value })); setError('') }} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="notes-modal__actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onClose}>Verwerfen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>
      </form>
    </section>
  </div>
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

  return <div className="notes-page">
    <header className="notes-page__header"><h2>Notizen</h2><button className="button" type="button" onClick={() => setEditingNote({})}>Neue Notiz</button></header>
    {loading ? <p className="notes-page__message">Notizen werden geladen …</p> : loadError ? <p className="form-error">{loadError}</p> : notes.length === 0 ? <div className="notes-page__empty"><h3>Noch keine Notizen</h3><p>Halte persönliche Hinweise, Ideen und Erinnerungen direkt hier fest.</p></div> : <div className="notes-page__grid">{notes.map((note) => <NoteCard key={note.id} note={note} onOpen={setEditingNote} />)}</div>}
    {editingNote && <NoteModal note={editingNote.id ? editingNote : null} onClose={() => setEditingNote(null)} onSave={save} />}
  </div>
}
