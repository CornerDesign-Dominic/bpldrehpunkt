import TodoScheduleFields from './TodoScheduleFields.jsx'
import { todoFormRecipientValues } from '../../lib/todoFormRecipients.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { reminderValidationMessage, todoReminderFields, validateReminderForm } from '../../lib/reminderForm.js'
import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { isSelfTodo } from '../../lib/todos.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'
import TodoTransportOrderPicker from './TodoTransportOrderPicker.jsx'
import { businessPartnerRoles } from '../../../shared/businessPartnerRoles.js'

function initialValues(todo, currentUserId) {
  const isSelf = isSelfTodo(todo, currentUserId)
  return {
    title: todo.title || '', description: todo.description || '', dueDate: todo.dueDate || '', reminderDate: todo.reminderDate || '', reminderTime: todo.reminderTime || '', reminderOccurrence: todo.reminderOccurrence || null, reminderRecipientMode: todo.reminderRecipientMode || 'all', reminderRecipientUserIds: todo.reminderRecipientUserIds || [], priority: todo.priority || 'medium',
    customerId: todo.customerId || '', customerName: todo.customerName || '', carrierId: todo.carrierId || '', carrierName: todo.carrierName || '', reference: todo.reference || '', transportOrderLinks: Array.isArray(todo.transportOrderLinks) ? todo.transportOrderLinks : todo.transportOrderId ? [{ id: todo.transportOrderId, number: todo.transportOrderNumber || todo.reference || todo.transportOrderId }] : [],
    damageCaseId: todo.damageCaseId || '', insolvencyId: todo.insolvencyId || '', legalDisputeId: todo.legalDisputeId || '', inkassoCaseId: todo.inkassoCaseId || '',
    audienceType: isSelf ? 'self' : todo.audienceType === 'department' ? 'department' : todo.audienceType === 'all' ? 'all' : 'people',
    audienceId: todo.audienceType === 'department' ? todo.audienceId || '' : '',
    audienceIds: todo.audienceType === 'people' ? todo.audienceIds || [] : todo.audienceType === 'person' && !isSelf ? [todo.audienceId] : [],
  }
}

const sectionTitles = { content: 'Inhalt bearbeiten', schedule: 'Terminierung bearbeiten', responsibility: 'Beteiligte ändern', links: 'Verknüpfungen bearbeiten' }

function damageCaseLabel(damageCase) { return [damageCase.caseNumber, damageCase.title].filter(Boolean).join(' · ') || 'Schadenfall' }
function insolvencyLabel(insolvency) { return [insolvency.partnerName, insolvency.courtReference].filter(Boolean).join(' · ') || 'Insolvenzfall' }

export default function TodoQuickEditModal({ canViewDamageCases = false, canViewInsolvencies = false, canViewTransportOrders = false, currentUserId, damageCases = [], insolvencies = [], onCancel, onSubmit, partners = [], recipientsAvailable = true, section, suspended = false, todo, users = [] }) {
  const { language } = useLanguage()
  const [form, setForm] = useState(() => initialValues(todo, currentUserId))
  const [damageCaseSearch, setDamageCaseSearch] = useState('')
  const [insolvencySearch, setInsolvencySearch] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const dialogRef = useRef(null)
  const cancelRef = useRef(onCancel)
  const departments = useMemo(() => [...new Set(users.map((user) => user.department?.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'de')), [users])
  const customers = useMemo(() => partners.filter((partner) => !partner.mergedIntoPartnerId && businessPartnerRoles(partner).customer), [partners])
  const carriers = useMemo(() => partners.filter((partner) => !partner.mergedIntoPartnerId && businessPartnerRoles(partner).carrier), [partners])
  const matchingDamageCases = useMemo(() => {
    const needle = damageCaseSearch.trim().toLocaleLowerCase('de-DE')
    return damageCases.filter((damageCase) => !needle || [damageCase.caseNumber, damageCase.title, damageCase.transportReference, damageCase.bplInsuranceCaseNumber, damageCase.customerInsuranceNumber, damageCase.contractorInsuranceCaseNumber].filter(Boolean).join(' ').toLocaleLowerCase('de-DE').includes(needle)).sort((left, right) => damageCaseLabel(left).localeCompare(damageCaseLabel(right), 'de'))
  }, [damageCaseSearch, damageCases])
  const matchingInsolvencies = useMemo(() => {
    const needle = insolvencySearch.trim().toLocaleLowerCase('de-DE')
    return insolvencies.filter((insolvency) => !needle || [insolvency.partnerName, insolvency.courtReference, insolvency.courtVenue, insolvency.administratorName, insolvency.insolvencyAdministrator].filter(Boolean).join(' ').toLocaleLowerCase('de-DE').includes(needle)).sort((left, right) => insolvencyLabel(left).localeCompare(insolvencyLabel(right), 'de'))
  }, [insolvencies, insolvencySearch])

  useEffect(() => { cancelRef.current = onCancel }, [onCancel])
  useEffect(() => {
    const previousFocus = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.querySelector('input:checked,input:not([type="radio"]),select,textarea,button')?.focus()
    return () => { document.body.style.overflow = overflow; previousFocus?.focus?.() }
  }, [])
  useEffect(() => {
    if (suspended) return undefined
    function keys(event) {
      if (event.key === 'Escape' && !savingRef.current) cancelRef.current()
      if (event.key !== 'Tab') return
      const candidates = [...(dialogRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[href]') || [])]
      const controls = candidates.filter(item => item.type !== 'radio' || !item.name || item.checked || !candidates.some(other => other.type === 'radio' && other.name === item.name && other.checked))
      if (!controls?.length) { event.preventDefault(); return }
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [suspended])

  function update(field, value) { setForm((current) => field === 'audienceId' ? todoFormRecipientValues({ ...current, [field]: value }, users, currentUserId) : { ...current, [field]: value }) }
  function changeAudienceType(audienceType) { setForm((current) => todoFormRecipientValues({ ...current, audienceType, audienceId: '', audienceIds: [] }, users, currentUserId)) }
  function togglePerson(userId) { setForm((current) => todoFormRecipientValues({ ...current, audienceIds: current.audienceIds.includes(userId) ? current.audienceIds.filter((id) => id !== userId) : [...current.audienceIds, userId] }, users, currentUserId)) }
  function changePartner(kind, event) {
    const partner = partners.find((item) => item.id === event.target.value)
    if (kind === 'customer') setForm((current) => ({ ...current, customerId: partner?.id || '', customerName: partner?.companyName || '' }))
    else setForm((current) => ({ ...current, carrierId: partner?.id || '', carrierName: partner?.companyName || '' }))
  }
  function selectTransportOrder(order) { setForm((current) => current.transportOrderLinks.some((link) => link.id === order.id) ? current : { ...current, transportOrderLinks: [...current.transportOrderLinks, order], reference: current.reference || order.number }) }
  function removeTransportOrder(orderId) { setForm((current) => ({ ...current, transportOrderLinks: current.transportOrderLinks.filter((link) => link.id !== orderId), reference: current.transportOrderLinks.filter((link) => link.id !== orderId)[0]?.number || '' })) }

  async function save(event) {
    event.preventDefault()
    if (savingRef.current || suspended) return
    if (['schedule', 'responsibility'].includes(section) && !recipientsAvailable) {
      setError('Die Mitarbeiterliste konnte nicht geladen werden. Bitte erneut laden, bevor Kalender oder Empfänger geändert werden.')
      return
    }
    if (!form.title.trim() || (form.audienceType === 'department' && !form.audienceId) || (form.audienceType === 'people' && !form.audienceIds.length)) {
      setError('Bitte Titel und Beteiligte vollständig erfassen.')
      return
    }
    try { section === 'schedule' && form.reminderDate ? validateReminderForm({ date: form.reminderDate, time: form.reminderTime, occurrence: form.reminderOccurrence }) : todoReminderFields(form, todo) } catch (validationError) { setError(reminderValidationMessage(validationError, language)); return }
    savingRef.current = true
    setSaving(true)
    setError('')
    try { await onSubmit(['schedule', 'responsibility'].includes(section) ? todoFormRecipientValues(form, users, currentUserId) : form) } catch (submissionError) { setError(reminderValidationMessage(submissionError, language)) } finally { savingRef.current = false; setSaving(false) }
  }

  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingRef.current && !suspended) onCancel() }}>
    <section ref={dialogRef} className="todo-quick-edit-modal" role="dialog" aria-modal="true" aria-labelledby="todo-quick-edit-title" inert={suspended || undefined}>
      <form className="todo-quick-editor" onSubmit={save} noValidate aria-busy={saving}>
        <div className="todo-quick-editor__heading"><h2 id="todo-quick-edit-title">{sectionTitles[section]}</h2></div>
        <fieldset disabled={saving} style={{ display: 'contents' }}>
        {section === 'content' && <div className="todo-quick-editor__grid"><label className="form-field"><span><StaticText source={"Titel *"} /></span><input value={form.title} onChange={(event) => update('title', event.target.value)} autoFocus /></label><label className="form-field"><span><StaticText source={"Beschreibung"} /></span><textarea rows="6" value={form.description} onChange={(event) => update('description', event.target.value)} /></label></div>}
        {section === 'schedule' && <TodoScheduleFields values={form} users={users} currentUserId={currentUserId} disabled={saving} onChange={changes => setForm(current => ({ ...current, ...changes }))} />}
        {section === 'responsibility' && <div className="todo-quick-editor__grid"><label className="form-field"><span><StaticText source={"Aufgabe für"} /></span><select value={form.audienceType} onChange={(event) => changeAudienceType(event.target.value)}><option value="self"><StaticText source={"Für mich"} /></option><option value="department"><StaticText source={"Abteilung"} /></option><option value="all"><StaticText source={"Alle"} /></option><option value="people"><StaticText source={"Personen"} /></option></select></label>{form.audienceType === 'department' && <label className="form-field"><span><StaticText source={"Abteilung"} /></span><select value={form.audienceId} onChange={(event) => update('audienceId', event.target.value)}><option value=""><StaticText source={"Bitte wählen"} /></option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>}{form.audienceType === 'people' && <fieldset className="todo-quick-editor__people"><legend><StaticText source={"Personen *"} /></legend><div>{users.map((user) => <label className={`todo-quick-editor__person${form.audienceIds.includes(user.id) ? ' todo-quick-editor__person--selected' : ''}`} key={user.id}><input type="checkbox" checked={form.audienceIds.includes(user.id)} onChange={() => togglePerson(user.id)} /><span>{getUserDisplayName(user, user)}</span></label>)}</div></fieldset>}</div>}
        {section === 'links' && <div className="todo-quick-editor__grid">
          <label className="form-field"><span><StaticText source={"Kunde"} /></span><select value={form.customerId} onChange={(event) => changePartner('customer', event)}><option value=""><StaticText source={"Kein Kunde verknüpft"} /></option>{form.customerId && !customers.some((partner) => partner.id === form.customerId) && <option value={form.customerId}>{form.customerName || <StaticText source={"Verknüpfter Kunde"} />}</option>}{customers.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></label>
          <label className="form-field"><span><StaticText source={"Unternehmer"} /></span><select value={form.carrierId} onChange={(event) => changePartner('carrier', event)}><option value=""><StaticText source={"Kein Unternehmer verknüpft"} /></option>{form.carrierId && !carriers.some((partner) => partner.id === form.carrierId) && <option value={form.carrierId}>{form.carrierName || <StaticText source={"Verknüpfter Unternehmer"} />}</option>}{carriers.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></label>
          <TodoTransportOrderPicker canViewTransportOrders={canViewTransportOrders} transportOrderLinks={form.transportOrderLinks} onRemove={removeTransportOrder} onSelect={selectTransportOrder} />
          {canViewDamageCases && <label className="form-field"><span><StaticText source={"Schadenfall suchen"} /></span><TranslatedProps sources={{"placeholder":"Nummer, Titel oder Referenz"}}><input value={damageCaseSearch} onChange={(event) => setDamageCaseSearch(event.target.value)} placeholder="Nummer, Titel oder Referenz" /></TranslatedProps></label>}
          <label className="form-field"><span><StaticText source={"Schadenfall"} /></span><select value={form.damageCaseId} onChange={(event) => update('damageCaseId', event.target.value)}><option value=""><StaticText source={"Kein Schadenfall verknüpft"} /></option>{form.damageCaseId && !damageCases.some((damageCase) => damageCase.id === form.damageCaseId) && <option value={form.damageCaseId}><StaticText source={"Schadenfall nicht verfügbar"} /></option>}{canViewDamageCases && form.damageCaseId && !matchingDamageCases.some((damageCase) => damageCase.id === form.damageCaseId) && damageCases.find((damageCase) => damageCase.id === form.damageCaseId) && <option value={form.damageCaseId}>{damageCaseLabel(damageCases.find((damageCase) => damageCase.id === form.damageCaseId))}</option>}{canViewDamageCases && matchingDamageCases.map((damageCase) => <option key={damageCase.id} value={damageCase.id}>{damageCaseLabel(damageCase)}{damageCase.transportReference ? ` · ${damageCase.transportReference}` : ''}</option>)}</select></label>
          {canViewDamageCases && damageCaseSearch.trim() && !matchingDamageCases.length && <p className="todo-quick-editor__hint"><StaticText source={"Kein passender Schadenfall gefunden."} /></p>}
          {canViewInsolvencies && <label className="form-field"><span><StaticText source={"Insolvenz suchen"} /></span><TranslatedProps sources={{"placeholder":"Unternehmen, Aktenzeichen oder Verwalter"}}><input value={insolvencySearch} onChange={(event) => setInsolvencySearch(event.target.value)} placeholder="Unternehmen, Aktenzeichen oder Verwalter" /></TranslatedProps></label>}
          <label className="form-field"><span><StaticText source={"Insolvenzfall"} /></span><select value={form.insolvencyId} onChange={(event) => update('insolvencyId', event.target.value)}><option value=""><StaticText source={"Keine Insolvenz verknüpft"} /></option>{form.insolvencyId && !insolvencies.some((insolvency) => insolvency.id === form.insolvencyId) && <option value={form.insolvencyId}><StaticText source={"Insolvenz nicht verfügbar"} /></option>}{canViewInsolvencies && form.insolvencyId && !matchingInsolvencies.some((insolvency) => insolvency.id === form.insolvencyId) && insolvencies.find((insolvency) => insolvency.id === form.insolvencyId) && <option value={form.insolvencyId}>{insolvencyLabel(insolvencies.find((insolvency) => insolvency.id === form.insolvencyId))}</option>}{canViewInsolvencies && matchingInsolvencies.map((insolvency) => <option key={insolvency.id} value={insolvency.id}>{insolvencyLabel(insolvency)}{insolvency.courtVenue ? ` · ${insolvency.courtVenue}` : ''}</option>)}</select></label>
          {canViewInsolvencies && insolvencySearch.trim() && !matchingInsolvencies.length && <p className="todo-quick-editor__hint"><StaticText source={"Kein passender Insolvenzfall gefunden."} /></p>}
        </div>}
        </fieldset>
        {error && <p className="form-error" role="alert">{<StaticText source={error} />}</p>}
        <div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onCancel}><StaticText source={"Abbrechen"} /></button><button className="button" type="submit" disabled={saving}>{<StaticText source={saving ? 'Wird gespeichert …' : 'Speichern'} />}</button></div>
      </form>
    </section>
  </div>
}
