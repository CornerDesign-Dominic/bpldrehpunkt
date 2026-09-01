import { useState } from 'react'
import { createEmptyTodo, TODO_DEPARTMENTS, TODO_USERS } from '../../lib/todos.js'

export default function TodoForm({ onCancel, onSubmit }) {
  const [form, setForm] = useState(createEmptyTodo)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function changeRecipientType(type) {
    setForm((current) => ({
      ...current,
      recipientType: type,
      recipientUserId: type === 'personal' ? current.recipientUserId || TODO_USERS[0].id : '',
      recipientDepartment: type === 'department' ? current.recipientDepartment || TODO_DEPARTMENTS[0].value : '',
    }))
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.title.trim() || (form.recipientType === 'personal' && !form.recipientUserId) || (form.recipientType === 'department' && !form.recipientDepartment)) {
      setError('Bitte Titel und Empfänger erfassen.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(form)
      setForm(createEmptyTodo())
      onCancel()
    } catch {
      setError('Das To-do konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  return <form className="todo-form" onSubmit={submit} noValidate>
    <div className="todo-form__heading"><h2>To-do anlegen</h2><button className="text-button" type="button" onClick={onCancel}>Abbrechen</button></div>
    <div className="todo-form__grid">
      <label className="form-field todo-form__title"><span>Titel *</span><input value={form.title} onChange={(event) => update('title', event.target.value)} autoFocus /></label>
      <label className="form-field"><span>Fälligkeit</span><input type="date" value={form.dueDate} onChange={(event) => update('dueDate', event.target.value)} /></label>
      <label className="form-field"><span>Empfängerart</span><select value={form.recipientType} onChange={(event) => changeRecipientType(event.target.value)}><option value="personal">Persönlich</option><option value="department">Abteilung</option></select></label>
      {form.recipientType === 'personal' && <label className="form-field"><span>Empfänger</span><select value={form.recipientUserId} onChange={(event) => update('recipientUserId', event.target.value)}>{TODO_USERS.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>}
      {form.recipientType === 'department' && <label className="form-field"><span>Abteilung</span><select value={form.recipientDepartment} onChange={(event) => update('recipientDepartment', event.target.value)}>{TODO_DEPARTMENTS.map((department) => <option key={department.value} value={department.value}>{department.label}</option>)}</select></label>}
      <label className="form-field todo-form__note"><span>Beschreibung / Notiz</span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} rows="2" /></label>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : 'To-do speichern'}</button></div>
  </form>
}
