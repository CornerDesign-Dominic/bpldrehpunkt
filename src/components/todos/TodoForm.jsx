import TodoScheduleFields from './TodoScheduleFields.jsx'
import { TodoPriorityPicker } from './TodoPriority.jsx'
import { todoFormRecipientValues } from '../../lib/todoFormRecipients.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { reminderValidationMessage, todoReminderFields } from '../../lib/reminderForm.js'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useMemo, useRef, useState } from 'react'
import { createEmptyTodo, isSelfTodo } from '../../lib/todos.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'
import TodoTransportOrderPicker from './TodoTransportOrderPicker.jsx'
import { linkedTodoCreationMessage, linkedTodoPartnerChoices } from '../../lib/linkedTodoCreation.js'

function initialFormValues(todo, currentUserId, fixedLink, providedInitialValues) {
  if (!todo) {
    const empty = createEmptyTodo()
    const values = { ...empty, ...(providedInitialValues || {}), ...(fixedLink?.values || {}), ...(fixedLink ? { [fixedLink.field]: fixedLink.id } : {}) }
    return { ...values, dueDate: empty.dueDate, reminderDate: empty.reminderDate, reminderTime: empty.reminderTime, reminderOccurrence: empty.reminderOccurrence, reminderRecipientMode: empty.reminderRecipientMode, reminderRecipientUserIds: empty.reminderRecipientUserIds }
  }
  const isSelf = isSelfTodo(todo, currentUserId)
  const values = {
    title: todo.title || '', description: todo.description || '', dueDate: todo.dueDate || '', reminderDate: todo.reminderDate || '', reminderTime: todo.reminderTime || '', reminderOccurrence: todo.reminderOccurrence || null, reminderRecipientMode: todo.reminderRecipientMode || 'all', reminderRecipientUserIds: todo.reminderRecipientUserIds || [], priority: todo.priority || 'medium',
    customerId: todo.customerId || '', customerName: todo.customerName || '', carrierId: todo.carrierId || '', carrierName: todo.carrierName || '', reference: todo.reference || '', transportOrderLinks: Array.isArray(todo.transportOrderLinks) ? todo.transportOrderLinks : todo.transportOrderId ? [{ id: todo.transportOrderId, number: todo.transportOrderNumber || todo.reference || todo.transportOrderId }] : [], damageCaseId: todo.damageCaseId || '', insolvencyId: todo.insolvencyId || '', legalDisputeId: todo.legalDisputeId || '', inkassoCaseId: todo.inkassoCaseId || '',
    audienceType: isSelf ? 'self' : todo.audienceType === 'department' ? 'department' : todo.audienceType === 'all' ? 'all' : 'people',
    audienceId: todo.audienceType === 'department' ? todo.audienceId || '' : '',
    audienceIds: todo.audienceType === 'people' ? todo.audienceIds || [] : todo.audienceType === 'person' && !isSelf ? [todo.audienceId] : [],
  }
  const mergedValues = { ...values, ...(providedInitialValues || {}) }
  return fixedLink ? { ...mergedValues, ...fixedLink.values, [fixedLink.field]: fixedLink.id } : mergedValues
}

export default function TodoForm({ canViewTransportOrders = false, currentUserId, fixedLink = null, initialTodo, initialValues: providedInitialValues = null, onCancel, onSubmit, onSubmittingChange, partners = [], users }) {
  const { language } = useLanguage()
  const [form, setForm] = useState(() => initialFormValues(initialTodo, currentUserId, fixedLink, providedInitialValues))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const departments = useMemo(() => [...new Set(users.map((user) => user.department?.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'de')), [users])
  const partnerOrigin = useMemo(() => fixedLink || { values: { ...initialTodo, ...providedInitialValues } }, [fixedLink, initialTodo, providedInitialValues])
  const customers = useMemo(() => linkedTodoPartnerChoices(partners, 'customer', partnerOrigin), [partners, partnerOrigin])
  const carriers = useMemo(() => linkedTodoPartnerChoices(partners, 'carrier', partnerOrigin), [partners, partnerOrigin])

  function update(field, value) { setForm((current) => field === 'audienceId' ? todoFormRecipientValues({ ...current, [field]: value }, users, currentUserId) : { ...current, [field]: value }) }
  function changeAudienceType(audienceType) { setForm((current) => todoFormRecipientValues({ ...current, audienceType, audienceId: '', audienceIds: [] }, users, currentUserId)) }
  function togglePerson(userId) {
    setForm((current) => todoFormRecipientValues({
      ...current,
      audienceIds: current.audienceIds.includes(userId)
        ? current.audienceIds.filter((id) => id !== userId)
        : [...current.audienceIds, userId],
    }, users, currentUserId))
  }
  function changePartner(kind, event) {
    const partner = (kind === 'customer' ? customers : carriers).find((item) => item.id === event.target.value)
    if (kind === 'customer') setForm((current) => ({ ...current, customerId: partner?.id || '', customerName: partner?.companyName || '' }))
    else setForm((current) => ({ ...current, carrierId: partner?.id || '', carrierName: partner?.companyName || '' }))
  }
  function selectTransportOrder(order) { setForm((current) => current.transportOrderLinks.some((link) => link.id === order.id) ? current : { ...current, transportOrderLinks: [...current.transportOrderLinks, order], reference: current.reference || order.number }) }
  function removeTransportOrder(orderId) { setForm((current) => ({ ...current, transportOrderLinks: current.transportOrderLinks.filter((link) => link.id !== orderId), reference: current.transportOrderLinks.filter((link) => link.id !== orderId)[0]?.number || '' })) }

  async function submit(event) {
    event.preventDefault()
    if (submittingRef.current) return
    if (!form.title.trim() || (form.audienceType === 'department' && !form.audienceId) || (form.audienceType === 'people' && !form.audienceIds.length)) {
      setError('Bitte Titel und Beteiligte vollständig erfassen.')
      return
    }
    try { todoReminderFields(form, initialTodo) } catch (validationError) { setError(reminderValidationMessage(validationError, language)); return }
    setSubmitting(true)
    submittingRef.current = true
    onSubmittingChange?.(true)
    setError('')
    let saved = false
    try { const outcome = await onSubmit(todoFormRecipientValues(form, users, currentUserId)); saved = !outcome?.pendingConfirmation } catch (submissionError) { setError(submissionError?.reminderCode ? reminderValidationMessage(submissionError, language) : linkedTodoCreationMessage(submissionError)) } finally { submittingRef.current = false; setSubmitting(false); onSubmittingChange?.(false) }
    if (saved) onCancel()
  }

  return <form className="todo-form" onSubmit={submit} aria-busy={submitting} noValidate>
    <div className="todo-form__heading"><h2>{<StaticText source={initialTodo ? 'To-do bearbeiten' : 'To-do anlegen'} />}</h2></div>
    <fieldset disabled={submitting} style={{ display: 'contents' }}>
    <section className="todo-form__section"><h3><StaticText source={"Inhalt"} /></h3><div className="todo-form__section-grid todo-form__section-grid--content"><label className="form-field todo-form__wide"><span><StaticText source={"Titel *"} /></span><input value={form.title} onChange={(event) => update('title', event.target.value)} autoFocus /></label><label className="form-field todo-form__wide"><span><StaticText source={"Beschreibung"} /></span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} rows="4" /></label>{!initialTodo && <TodoPriorityPicker value={form.priority} disabled={submitting} onChange={value => update('priority', value)} />}</div></section>
    {initialTodo && <section className="todo-form__section"><h3><StaticText source="Terminierung" /></h3><TodoScheduleFields values={form} users={users} currentUserId={currentUserId} disabled={submitting} onChange={changes => setForm(current => ({ ...current, ...changes }))} /></section>}
    <section className="todo-form__section"><h3><StaticText source="Beteiligte" /></h3><div className="todo-form__section-grid todo-form__section-grid--assignment"><label className="form-field"><span><StaticText source={"Aufgabe für"} /></span><select value={form.audienceType} onChange={(event) => changeAudienceType(event.target.value)}><option value="self"><StaticText source={"Für mich"} /></option><option value="department"><StaticText source={"Abteilung"} /></option><option value="all"><StaticText source={"Alle"} /></option><option value="people"><StaticText source={"Personen"} /></option></select></label>{form.audienceType === 'department' && <label className="form-field"><span><StaticText source={"Abteilung"} /></span><select value={form.audienceId} onChange={(event) => update('audienceId', event.target.value)}><option value=""><StaticText source={"Bitte wählen"} /></option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>}{form.audienceType === 'people' && <fieldset className="todo-form__people"><legend><StaticText source={"Personen *"} /></legend><div className="todo-form__people-options">{users.map((user) => <label className={`todo-form__person-option${form.audienceIds.includes(user.id) ? ' todo-form__person-option--selected' : ''}`} key={user.id}><input type="checkbox" checked={form.audienceIds.includes(user.id)} onChange={() => togglePerson(user.id)} /><span>{getUserDisplayName(user, user)}</span></label>)}</div><small><StaticText source={"Mehrere Personen können ausgewählt werden."} /></small></fieldset>}</div></section>
    <section className="todo-form__section"><h3><StaticText source={"Verknüpfungen"} /></h3><div className="todo-form__section-grid todo-form__section-grid--links">{fixedLink && <label className="form-field"><span>{fixedLink.label}</span><input value={fixedLink.value} readOnly aria-readonly="true" /></label>}<label className="form-field"><span><StaticText source={"Kunde"} /></span><select value={form.customerId} onChange={(event) => changePartner('customer', event)}><option value=""><StaticText source={"Kein Kunde verknüpft"} /></option>{form.customerId && !customers.some((partner) => partner.id === form.customerId) && <option value={form.customerId}>{form.customerName || <StaticText source={"Verknüpfter Kunde"} />}</option>}{customers.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}{partner.inheritedTodoOrigin && <> · <StaticText source="Ursprüngliche Verknüpfung" /></>}</option>)}</select></label><label className="form-field"><span><StaticText source={"Unternehmer"} /></span><select value={form.carrierId} onChange={(event) => changePartner('carrier', event)}><option value=""><StaticText source={"Kein Unternehmer verknüpft"} /></option>{form.carrierId && !carriers.some((partner) => partner.id === form.carrierId) && <option value={form.carrierId}>{form.carrierName || <StaticText source={"Verknüpfter Unternehmer"} />}</option>}{carriers.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}{partner.inheritedTodoOrigin && <> · <StaticText source="Ursprüngliche Verknüpfung" /></>}</option>)}</select></label><TodoTransportOrderPicker canViewTransportOrders={canViewTransportOrders} disabled={submitting} transportOrderLinks={form.transportOrderLinks} onRemove={removeTransportOrder} onSelect={selectTransportOrder} /></div></section>
    </fieldset>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" disabled={submitting} onClick={() => { if (!submittingRef.current) onCancel() }}><StaticText source={"Abbrechen"} /></button><button className="button" type="submit" disabled={submitting}>{<StaticText source={submitting ? 'Wird gespeichert …' : initialTodo ? 'Änderungen speichern' : 'To-do anlegen'} />}</button></div>
  </form>
}
