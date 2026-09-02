import { useState } from 'react'
import Toast from '../ui/Toast.jsx'
import { useAuth } from '../../auth/useAuth.js'
import { ACTIVITY_PRIORITIES, ACTIVITY_TYPES } from '../../lib/crmActivities.js'
import { addPartnerHistoryEntry, getHistoryActor } from '../../lib/partnerHistory.js'

const contactPersonTypes = new Set(['phone', 'email', 'visit'])
const referenceTypes = new Set(['offer', 'complaint'])
const today = () => new Date().toISOString().slice(0, 10)
const emptyActivity = () => ({ date: today(), type: 'phone', priority: 'info', text: '', contactPerson: '', reference: '' })

export default function CrmActivityPanel({ partnerId, onSaved, canEdit }) {
  const authState = useAuth()
  const [isOpen, setOpen] = useState(false)
  const [form, setForm] = useState(emptyActivity)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const typeLabel = ACTIVITY_TYPES.find((item) => item.value === form.type)?.label ?? form.type

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateType(type) {
    setForm((current) => ({ ...current, type, contactPerson: contactPersonTypes.has(type) ? current.contactPerson : '', reference: referenceTypes.has(type) ? current.reference : '' }))
  }

  function closeForm() {
    setOpen(false)
    setForm(emptyActivity())
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.text.trim()) {
      setError('Bitte beschreibe die Aktivität.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await addPartnerHistoryEntry(partnerId, {
        category: 'contact',
        action: 'created',
        summary: `${typeLabel}: ${form.text.trim()}`,
        metadata: { date: form.date, type: form.type, priority: form.priority, text: form.text.trim(), contactPerson: form.contactPerson.trim(), reference: form.reference.trim() },
      }, getHistoryActor(authState))
      closeForm()
      setToast('Aktivität gespeichert.')
      onSaved?.()
    } catch {
      setError('Die Aktivität konnte nicht gespeichert werden. Bitte versuche es erneut.')
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="crm-activities" aria-label="Aktivität hinzufügen">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="crm-activities__heading"><h3>Aktivitäten</h3>{canEdit && <button className="button button--secondary" type="button" onClick={() => isOpen ? closeForm() : setOpen(true)}>{isOpen ? 'Abbrechen' : 'Aktivität hinzufügen'}</button>}</div>
    {isOpen && <form className="crm-activity-form" onSubmit={handleSubmit}>
      <label>Datum<input type="date" value={form.date} onChange={(event) => updateField('date', event.target.value)} required /></label>
      <label>Art<select value={form.type} onChange={(event) => updateType(event.target.value)}>{ACTIVITY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
      <label>Hinweisstufe<select value={form.priority} onChange={(event) => updateField('priority', event.target.value)}>{ACTIVITY_PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label>
      <label className="crm-activity-form__text">Kurzbeschreibung<textarea value={form.text} onChange={(event) => updateField('text', event.target.value)} rows="3" required /></label>
      {contactPersonTypes.has(form.type) && <label>Ansprechpartner (optional)<input value={form.contactPerson} onChange={(event) => updateField('contactPerson', event.target.value)} /></label>}
      {referenceTypes.has(form.type) && <label>{form.type === 'offer' ? 'Angebotsnummer / Referenz (optional)' : 'Referenz / Tournummer (optional)'}<input value={form.reference} onChange={(event) => updateField('reference', event.target.value)} /></label>}
      {error && <p className="form-error crm-activity-form__error">{error}</p>}
      <div className="crm-activity-form__actions"><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : 'Aktivität speichern'}</button></div>
    </form>}
  </section>
}
