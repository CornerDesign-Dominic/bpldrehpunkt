import { useMemo, useState } from 'react'
import { createEmptyTodo } from '../../lib/todos.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'

export default function TodoForm({ initialTodo, onCancel, onSubmit, users }) {
  const [form, setForm] = useState(() => initialTodo ? {
    title: initialTodo.title || '', description: initialTodo.description || '', dueDate: initialTodo.dueDate || '', audienceType: initialTodo.audienceType || 'all', audienceId: initialTodo.audienceId || '',
  } : createEmptyTodo())
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const departments = useMemo(() => [...new Set(users.map((user) => user.department?.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'de')), [users])

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function changeAudienceType(audienceType) {
    setForm((current) => ({ ...current, audienceType, audienceId: '' }))
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.title.trim() || (form.audienceType !== 'all' && !form.audienceId)) {
      setError('Bitte Titel und Zielgruppe erfassen.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(form)
      onCancel()
    } catch (submissionError) {
      setError(submissionError.message || 'Das To-do konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  return <form className="todo-form" onSubmit={submit} noValidate>
    <div className="todo-form__heading"><h2>{initialTodo ? 'To-do bearbeiten / neu zuweisen' : 'To-do anlegen'}</h2><button className="text-button" type="button" onClick={onCancel}>Abbrechen</button></div>
    <div className="todo-form__grid">
      <label className="form-field todo-form__title"><span>Titel *</span><input value={form.title} onChange={(event) => update('title', event.target.value)} autoFocus /></label>
      <label className="form-field"><span>Fälligkeit</span><input type="date" value={form.dueDate} onChange={(event) => update('dueDate', event.target.value)} /></label>
      <label className="form-field"><span>Zielgruppe</span><select value={form.audienceType} onChange={(event) => changeAudienceType(event.target.value)}><option value="all">Alle</option><option value="department">Bestimmte Abteilung</option><option value="person">Bestimmte Person</option></select></label>
      {form.audienceType === 'department' && <label className="form-field"><span>Abteilung</span><select value={form.audienceId} onChange={(event) => update('audienceId', event.target.value)}><option value="">Bitte wählen</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>}
      {form.audienceType === 'person' && <label className="form-field"><span>Person</span><select value={form.audienceId} onChange={(event) => update('audienceId', event.target.value)}><option value="">Bitte wählen</option>{users.map((user) => <option key={user.id} value={user.id}>{getUserDisplayName(user, user)}</option>)}</select></label>}
      <label className="form-field todo-form__note"><span>Beschreibung / Notiz</span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} rows="2" /></label>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : initialTodo ? 'Änderungen speichern' : 'To-do speichern'}</button></div>
  </form>
}
