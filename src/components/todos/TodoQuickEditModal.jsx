import { useEffect, useMemo, useState } from 'react'
import { isSelfTodo, TODO_PRIORITY } from '../../lib/todos.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'

function initialValues(todo, currentUserId) {
  const isSelf = isSelfTodo(todo, currentUserId)
  return {
    title: todo.title || '', description: todo.description || '', dueDate: todo.dueDate || '', reminderDate: todo.reminderDate || '', priority: todo.priority || 'medium',
    customerId: todo.customerId || '', customerName: todo.customerName || '', carrierId: todo.carrierId || '', carrierName: todo.carrierName || '', reference: todo.reference || '',
    audienceType: isSelf ? 'self' : todo.audienceType === 'department' ? 'department' : todo.audienceType === 'all' ? 'all' : 'people',
    audienceId: todo.audienceType === 'department' ? todo.audienceId || '' : '',
    audienceIds: todo.audienceType === 'people' ? todo.audienceIds || [] : todo.audienceType === 'person' && !isSelf ? [todo.audienceId] : [],
  }
}

const sectionTitles = { content: 'Inhalt bearbeiten', schedule: 'Priorität & Termine bearbeiten', responsibility: 'Zuständigkeit ändern', links: 'Verknüpfungen bearbeiten' }

export default function TodoQuickEditModal({ currentUserId, onCancel, onSubmit, partners = [], section, todo, users = [] }) {
  const [form, setForm] = useState(() => initialValues(todo, currentUserId))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const departments = useMemo(() => [...new Set(users.map((user) => user.department?.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'de')), [users])
  const customers = useMemo(() => partners.filter((partner) => partner.debtorNumber?.trim()), [partners])
  const carriers = useMemo(() => partners.filter((partner) => partner.creditorNumber?.trim()), [partners])

  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  function changeAudienceType(audienceType) { setForm((current) => ({ ...current, audienceType, audienceId: '', audienceIds: [] })) }
  function togglePerson(userId) { setForm((current) => ({ ...current, audienceIds: current.audienceIds.includes(userId) ? current.audienceIds.filter((id) => id !== userId) : [...current.audienceIds, userId] })) }
  function changePartner(kind, event) {
    const partner = partners.find((item) => item.id === event.target.value)
    if (kind === 'customer') setForm((current) => ({ ...current, customerId: partner?.id || '', customerName: partner?.companyName || '' }))
    else setForm((current) => ({ ...current, carrierId: partner?.id || '', carrierName: partner?.companyName || '' }))
  }

  async function save(event) {
    event.preventDefault()
    if (!form.title.trim() || (form.audienceType === 'department' && !form.audienceId) || (form.audienceType === 'people' && !form.audienceIds.length)) {
      setError('Bitte Titel und Zuständigkeit vollständig erfassen.')
      return
    }
    setSaving(true)
    setError('')
    try { await onSubmit(form) } catch (submissionError) { setError(submissionError.message || 'Die Änderung konnte nicht gespeichert werden.') } finally { setSaving(false) }
  }

  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}><section className="todo-quick-edit-modal" role="dialog" aria-modal="true" aria-labelledby="todo-quick-edit-title"><form className="todo-quick-editor" onSubmit={save} noValidate><div className="todo-quick-editor__heading"><h2 id="todo-quick-edit-title">{sectionTitles[section]}</h2></div>{section === 'content' && <div className="todo-quick-editor__grid"><label className="form-field"><span>Titel *</span><input value={form.title} onChange={(event) => update('title', event.target.value)} autoFocus /></label><label className="form-field"><span>Beschreibung</span><textarea rows="6" value={form.description} onChange={(event) => update('description', event.target.value)} /></label></div>}{section === 'schedule' && <div className="todo-quick-editor__grid todo-quick-editor__grid--three"><label className="form-field"><span>Wichtigkeit</span><select value={form.priority} onChange={(event) => update('priority', event.target.value)}>{Object.entries(TODO_PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>Fällig am</span><input type="date" value={form.dueDate} onChange={(event) => update('dueDate', event.target.value)} /></label><label className="form-field"><span>Erinnerung am</span><input type="date" value={form.reminderDate} onChange={(event) => update('reminderDate', event.target.value)} /></label></div>}{section === 'responsibility' && <div className="todo-quick-editor__grid"><label className="form-field"><span>Aufgabe für</span><select value={form.audienceType} onChange={(event) => changeAudienceType(event.target.value)}><option value="self">Für mich</option><option value="department">Abteilung</option><option value="all">Alle</option><option value="people">Person/en</option></select></label>{form.audienceType === 'department' && <label className="form-field"><span>Abteilung</span><select value={form.audienceId} onChange={(event) => update('audienceId', event.target.value)}><option value="">Bitte wählen</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>}{form.audienceType === 'people' && <fieldset className="todo-quick-editor__people"><legend>Person/en *</legend><div>{users.filter((user) => user.id !== currentUserId).map((user) => <label className={`todo-quick-editor__person${form.audienceIds.includes(user.id) ? ' todo-quick-editor__person--selected' : ''}`} key={user.id}><input type="checkbox" checked={form.audienceIds.includes(user.id)} onChange={() => togglePerson(user.id)} /><span>{getUserDisplayName(user, user)}</span></label>)}</div></fieldset>}{form.audienceType === 'self' && <p className="todo-quick-editor__hint">Die Aufgabe wird Ihnen direkt zugewiesen.</p>}{form.audienceType === 'all' && <p className="todo-quick-editor__hint">Alle aktiven Nutzer können die Aufgabe sehen und übernehmen.</p>}</div>}{section === 'links' && <div className="todo-quick-editor__grid"><label className="form-field"><span>Kunde</span><select value={form.customerId} onChange={(event) => changePartner('customer', event)}><option value="">Kein Kunde verknüpft</option>{form.customerId && !customers.some((partner) => partner.id === form.customerId) && <option value={form.customerId}>{form.customerName || 'Verknüpfter Kunde'}</option>}{customers.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></label><label className="form-field"><span>Unternehmer</span><select value={form.carrierId} onChange={(event) => changePartner('carrier', event)}><option value="">Kein Unternehmer verknüpft</option>{form.carrierId && !carriers.some((partner) => partner.id === form.carrierId) && <option value={form.carrierId}>{form.carrierName || 'Verknüpfter Unternehmer'}</option>}{carriers.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></label><label className="form-field"><span>Referenz</span><input value={form.reference} maxLength="240" onChange={(event) => update('reference', event.target.value)} placeholder="Auftrags-, Tour- oder Rechnungsnummer" /></label></div>}{error && <p className="form-error">{error}</p>}<div className="form-actions"><button className="button button--secondary" type="button" onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div></form></section></div>
}
