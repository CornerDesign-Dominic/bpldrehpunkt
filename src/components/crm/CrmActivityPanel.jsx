import { useState } from 'react'
import Toast from '../ui/Toast.jsx'
import CrmEditModal from './CrmEditModal.jsx'
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
      setError('Bitte gib eine Kurzbeschreibung ein.')
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
      setToast('Eintrag gespeichert.')
      onSaved?.()
    } catch {
      setError('Der Eintrag konnte nicht gespeichert werden. Bitte versuche es erneut.')
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="crm-activities" aria-label="Kontakt & Notizen">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="crm-activities__heading"><h3>Kontakt & Notizen</h3>{canEdit && <button className="button button--secondary" type="button" onClick={() => setOpen(true)}>Kontakt oder Notiz hinzufügen</button>}</div>
    {isOpen && <CrmEditModal title="Kontakt oder Notiz hinzufügen" description="Kontakt oder Vorgang im CRM dokumentieren" onClose={closeForm} onSubmit={handleSubmit} saving={submitting} changed={Boolean(form.text.trim())} error={error} saveLabel="Eintrag speichern" className="crm-edit-modal--activity" fieldsClassName="crm-edit-modal__fields--activity">
      <label className="form-field"><span>Datum</span><input type="date" value={form.date} onChange={(event) => updateField('date', event.target.value)} required disabled={submitting} /></label>
      <label className="form-field"><span>Art</span><select value={form.type} onChange={(event) => updateType(event.target.value)} disabled={submitting}>{ACTIVITY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
      <label className="form-field"><span>Hinweisstufe</span><select value={form.priority} onChange={(event) => updateField('priority', event.target.value)} disabled={submitting}>{ACTIVITY_PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label>
      <label className="form-field crm-activity-modal__text"><span>Kurzbeschreibung</span><textarea value={form.text} onChange={(event) => updateField('text', event.target.value)} rows="4" required disabled={submitting} /></label>
      {contactPersonTypes.has(form.type) && <label className="form-field crm-activity-modal__optional"><span>Ansprechpartner (optional)</span><input value={form.contactPerson} onChange={(event) => updateField('contactPerson', event.target.value)} disabled={submitting} /></label>}
      {referenceTypes.has(form.type) && <label className="form-field crm-activity-modal__optional"><span>{form.type === 'offer' ? 'Angebotsnummer / Referenz (optional)' : 'Referenz / Tournummer (optional)'}</span><input value={form.reference} onChange={(event) => updateField('reference', event.target.value)} disabled={submitting} /></label>}
    </CrmEditModal>}
  </section>
}
