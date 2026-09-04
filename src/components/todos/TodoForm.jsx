import { useMemo, useState } from 'react'
import { createEmptyTodo, isSelfTodo, TODO_PRIORITY } from '../../lib/todos.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'

function initialValues(todo, currentUserId) {
  if (!todo) return createEmptyTodo()
  const isSelf = isSelfTodo(todo, currentUserId)
  return {
    title: todo.title || '', description: todo.description || '', dueDate: todo.dueDate || '', reminderDate: todo.reminderDate || '', priority: todo.priority || 'medium',
    customerId: todo.customerId || '', customerName: todo.customerName || '', carrierId: todo.carrierId || '', carrierName: todo.carrierName || '', reference: todo.reference || '',
    audienceType: isSelf ? 'self' : todo.audienceType === 'department' ? 'department' : todo.audienceType === 'all' ? 'all' : 'people',
    audienceId: todo.audienceType === 'department' ? todo.audienceId || '' : '',
    audienceIds: todo.audienceType === 'people' ? todo.audienceIds || [] : todo.audienceType === 'person' && !isSelf ? [todo.audienceId] : [],
  }
}

export default function TodoForm({ currentUserId, initialTodo, onCancel, onSubmit, partners = [], users }) {
  const [form, setForm] = useState(() => initialValues(initialTodo, currentUserId))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const departments = useMemo(() => [...new Set(users.map((user) => user.department?.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'de')), [users])

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  function changeAudienceType(audienceType) { setForm((current) => ({ ...current, audienceType, audienceId: '', audienceIds: [] })) }
  function togglePerson(userId) {
    setForm((current) => ({
      ...current,
      audienceIds: current.audienceIds.includes(userId)
        ? current.audienceIds.filter((id) => id !== userId)
        : [...current.audienceIds, userId],
    }))
  }
  function changePartner(kind, event) {
    const partner = partners.find((item) => item.id === event.target.value)
    if (kind === 'customer') setForm((current) => ({ ...current, customerId: partner?.id || '', customerName: partner?.companyName || '' }))
    else setForm((current) => ({ ...current, carrierId: partner?.id || '', carrierName: partner?.companyName || '' }))
  }

  const customers = useMemo(() => partners.filter((partner) => partner.debtorNumber?.trim()), [partners])
  const carriers = useMemo(() => partners.filter((partner) => partner.creditorNumber?.trim()), [partners])

  async function submit(event) {
    event.preventDefault()
    if (!form.title.trim() || (form.audienceType === 'department' && !form.audienceId) || (form.audienceType === 'people' && !form.audienceIds.length)) {
      setError('Bitte Titel und Zielgruppe erfassen.')
      return
    }
    setSubmitting(true)
    setError('')
    try { await onSubmit(form); onCancel() } catch (submissionError) { setError(submissionError.message || 'Das To-do konnte nicht gespeichert werden.') } finally { setSubmitting(false) }
  }

  return <form className="todo-form" onSubmit={submit} noValidate>
    <div className="todo-form__heading"><h2>{initialTodo ? 'To-do bearbeiten / neu zuweisen' : 'To-do anlegen'}</h2></div>
    <section className="todo-form__section"><h3>Inhalt</h3><div className="todo-form__section-grid todo-form__section-grid--content"><label className="form-field todo-form__wide"><span>Titel *</span><input value={form.title} onChange={(event) => update('title', event.target.value)} autoFocus /></label><label className="form-field todo-form__wide"><span>Beschreibung</span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} rows="4" /></label></div></section>
    <section className="todo-form__section"><h3>Terminierung</h3><div className="todo-form__section-grid todo-form__section-grid--schedule"><label className="form-field"><span>Wichtigkeit</span><select value={form.priority} onChange={(event) => update('priority', event.target.value)}>{Object.entries(TODO_PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>Fällig am</span><input type="date" value={form.dueDate} onChange={(event) => update('dueDate', event.target.value)} /></label><label className="form-field"><span>Erinnerung am</span><input type="date" value={form.reminderDate} onChange={(event) => update('reminderDate', event.target.value)} /></label></div></section>
    <section className="todo-form__section"><h3>Zuweisung</h3><div className="todo-form__section-grid todo-form__section-grid--assignment"><label className="form-field"><span>Aufgabe für</span><select value={form.audienceType} onChange={(event) => changeAudienceType(event.target.value)}><option value="self">Für mich</option><option value="department">Abteilung</option><option value="all">Alle</option><option value="people">Person/en</option></select></label>{form.audienceType === 'department' && <label className="form-field"><span>Abteilung</span><select value={form.audienceId} onChange={(event) => update('audienceId', event.target.value)}><option value="">Bitte wählen</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>}{form.audienceType === 'people' && <fieldset className="todo-form__people"><legend>Person/en *</legend><div className="todo-form__people-options">{users.filter((user) => user.id !== currentUserId).map((user) => <label className={`todo-form__person-option${form.audienceIds.includes(user.id) ? ' todo-form__person-option--selected' : ''}`} key={user.id}><input type="checkbox" checked={form.audienceIds.includes(user.id)} onChange={() => togglePerson(user.id)} /><span>{getUserDisplayName(user, user)}</span></label>)}</div><small>Mehrere Personen können ausgewählt werden.</small></fieldset>}{form.audienceType === 'self' && <p className="todo-form__selection-hint">Die Aufgabe wird Ihnen direkt zugewiesen.</p>}{form.audienceType === 'all' && <p className="todo-form__selection-hint">Alle aktiven Nutzer können die Aufgabe sehen und übernehmen.</p>}</div></section>
    <section className="todo-form__section"><h3>Verknüpfungen</h3><div className="todo-form__section-grid todo-form__section-grid--links"><label className="form-field"><span>Kunde</span><select value={form.customerId} onChange={(event) => changePartner('customer', event)}><option value="">Kein Kunde verknüpft</option>{form.customerId && !customers.some((partner) => partner.id === form.customerId) && <option value={form.customerId}>{form.customerName || 'Verknüpfter Kunde'}</option>}{customers.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></label><label className="form-field"><span>Unternehmer</span><select value={form.carrierId} onChange={(event) => changePartner('carrier', event)}><option value="">Kein Unternehmer verknüpft</option>{form.carrierId && !carriers.some((partner) => partner.id === form.carrierId) && <option value={form.carrierId}>{form.carrierName || 'Verknüpfter Unternehmer'}</option>}{carriers.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></label><label className="form-field"><span>Referenz</span><input value={form.reference} maxLength="240" onChange={(event) => update('reference', event.target.value)} placeholder="Auftrags-, Tour- oder Rechnungsnummer" /></label></div></section>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : initialTodo ? 'Änderungen speichern' : 'To-do anlegen'}</button></div>
  </form>
}
