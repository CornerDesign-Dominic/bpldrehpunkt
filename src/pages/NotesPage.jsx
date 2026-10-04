import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { useLanguage } from '../i18n/useLanguage.js'
import PersonalNoteModal from '../components/notes/PersonalNoteModal.jsx'
import { createPersonalNote, deletePersonalNote, updatePersonalNote, watchPersonalNotes } from '../lib/personalNotes.js'
import { formatPersonalNoteCreatedAt, PERSONAL_NOTE_SORT_OPTIONS, sortPersonalNotes } from '../lib/personalNotesPresentation.js'

function NoteCard({ note, onOpen }) {
  const { language, t } = useLanguage()
  const createdAt = note.createdAt ? formatPersonalNoteCreatedAt(note.createdAt, language) : t('notes.statusSaving')
  return <button className="personal-note-card" type="button" onClick={() => onOpen(note)} aria-label={t('notes.open', { title: note.title })}>
    <time className="personal-note-card__date" dateTime={note.createdAt?.toDate?.()?.toISOString()}>{createdAt}</time>
    <h3>{note.title}</h3>
    <p>{note.text}</p>
  </button>
}

export default function NotesPage() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [sort, setSort] = useState('created-desc')

  useEffect(() => {
    if (!user?.uid) return undefined
    return watchPersonalNotes(user.uid, (nextNotes) => {
      setNotes(nextNotes)
      setLoadError(false)
      setLoading(false)
    }, () => {
      setLoadError(true)
      setLoading(false)
    })
  }, [user?.uid])

  async function save(values) {
    if (editingNote?.id) return updatePersonalNote(user.uid, editingNote.id, values)
    return createPersonalNote(user.uid, values)
  }

  const sortedNotes = useMemo(() => sortPersonalNotes(notes, sort), [notes, sort])

  return <div className="notes-page">
    <div className="notes-page__header"><label className="notes-sort"><span>{t('notes.sort')}</span><select value={sort} onChange={(event) => setSort(event.target.value)}>{PERSONAL_NOTE_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t({ 'created-desc': 'notes.sortNewest', 'created-asc': 'notes.sortOldest', eisenhower: 'notes.sortPriority' }[option.value])}</option>)}</select></label><button className="button" type="button" onClick={() => setEditingNote({})}>{t('notes.new')}</button></div>
    {loading ? <p className="notes-page__message">{t('notes.loading')}</p> : loadError ? <p className="form-error">{t('notes.loadError')}</p> : notes.length === 0 ? <div className="notes-page__empty"><h3>{t('notes.emptyTitle')}</h3><p>{t('notes.emptyHint')}</p></div> : <div className="notes-page__grid">{sortedNotes.map((note) => <NoteCard key={note.id} note={note} onOpen={setEditingNote} />)}</div>}
    {editingNote && <PersonalNoteModal note={editingNote.id ? editingNote : null} onClose={() => setEditingNote(null)} onDelete={editingNote.id ? () => deletePersonalNote(user.uid, editingNote.id) : null} onSave={save} />}
  </div>
}
