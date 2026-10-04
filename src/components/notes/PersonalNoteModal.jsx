import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { PERSONAL_NOTE_TEXT_MAX_LENGTH, PERSONAL_NOTE_TITLE_MAX_LENGTH, personalNoteValidation } from '../../lib/personalNotesPresentation.js'
import '../../styles/notes.css'

export default function PersonalNoteModal({ note, onClose, onDelete, onSave }) {
  const { t } = useLanguage()
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
      setError(t(validation.message === 'Bitte einen Titel eingeben.' ? 'notes.titleRequired' : 'notes.textRequired'))
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(validation.values)
      onClose()
    } catch {
      setError(t('notes.saveError'))
    } finally {
      setSaving(false)
    }
  }

  function levelSlider(field, label) {
    const high = form[field] === 'high'
    return <label className={`notes-level-control notes-level-control--${field}${high ? ' notes-level-control--high' : ''}`}><span className="notes-level-control__title">{label}</span><span className="notes-level-control__choice"><span className={!high ? 'notes-level-control__value notes-level-control__value--active' : 'notes-level-control__value'}>{t('notes.low')}</span><input className="sr-only" type="checkbox" role="switch" checked={high} aria-label={`${label}: ${t(high ? 'notes.high' : 'notes.low')}`} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.checked ? 'high' : 'low' }))} /><span className={`notes-level-control__switch${high ? ' notes-level-control__switch--high' : ''}`} aria-hidden="true"><span /></span><span className={high ? 'notes-level-control__value notes-level-control__value--active' : 'notes-level-control__value'}>{t('notes.high')}</span></span></label>
  }

  async function remove() {
    setDeleting(true)
    setError('')
    try {
      await onDelete()
      onClose()
    } catch {
      setDeleteConfirmationOpen(false)
      setError(t('notes.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  return <><div className="notes-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !deleting) onClose() }}>
    <section className="notes-modal" role="dialog" aria-modal="true" aria-labelledby="notes-modal-title">
      <div className="notes-modal__heading"><h2 id="notes-modal-title">{t(isNew ? 'notes.new' : 'notes.edit')}</h2><button type="button" onClick={onClose} disabled={saving} aria-label={t('notes.close')}>×</button></div>
      <form onSubmit={submit} noValidate>
        <div className="notes-modal__fields">
          <div className="notes-modal__properties">{levelSlider('importance', t('notes.importance'))}{levelSlider('urgency', t('notes.urgency'))}</div>
          <label className="form-field"><span>{t('notes.title')}</span><input autoFocus maxLength={PERSONAL_NOTE_TITLE_MAX_LENGTH} value={form.title} onChange={(event) => { setForm((current) => ({ ...current, title: event.target.value })); setError('') }} /></label>
          <label className="form-field"><span>{t('notes.text')}</span><textarea rows="14" maxLength={PERSONAL_NOTE_TEXT_MAX_LENGTH} value={form.text} onChange={(event) => { setForm((current) => ({ ...current, text: event.target.value })); setError('') }} /></label>
        </div>
        {error && <p className="form-error"><StaticText source={error} /></p>}
        <div className="notes-modal__actions">{!isNew && <button className="button button--danger" type="button" disabled={saving || deleting} onClick={() => setDeleteConfirmationOpen(true)}>{t('notes.delete')}</button>}<button className="button button--secondary" type="button" disabled={saving || deleting} onClick={onClose}>{t('notes.discard')}</button><button className="button" type="submit" disabled={saving || deleting || !canSave}>{t(saving ? 'notes.saving' : 'notes.save')}</button></div>
      </form>
    </section>
  </div>{!isNew && <ConfirmDialog open={deleteConfirmationOpen} title={t('notes.deleteQuestion')} message={t('notes.deleteWarning')} confirmLabel={t('notes.deleteNote')} submittingLabel={t('notes.deleting')} variant="danger" isSubmitting={deleting} onCancel={() => setDeleteConfirmationOpen(false)} onConfirm={() => void remove()} />}</>
}
