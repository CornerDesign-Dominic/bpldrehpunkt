import { useEffect, useMemo, useState } from 'react'
import Toast from '../ui/Toast.jsx'
import {
  ACTIVITY_PRIORITIES,
  ACTIVITY_TYPES,
  createCrmActivity,
  listCrmActivities,
  updateCrmActivity,
} from '../../lib/crmActivities.js'

const contactPersonTypes = new Set(['phone', 'email', 'visit'])
const referenceTypes = new Set(['offer', 'complaint'])

function today() {
  return new Date().toISOString().slice(0, 10)
}

function emptyActivity() {
  return { date: today(), type: 'phone', priority: 'info', text: '', contactPerson: '', reference: '' }
}

function formFromActivity(activity) {
  return {
    date: activity.date || today(),
    type: activity.type || 'phone',
    priority: activity.priority || 'info',
    text: activity.text || '',
    contactPerson: activity.contactPerson || '',
    reference: activity.reference || '',
  }
}

function formatDate(value) {
  if (!value) return 'Ohne Datum'
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

export default function CrmActivityPanel({ partnerId }) {
  const [activities, setActivities] = useState([])
  const [form, setForm] = useState(emptyActivity)
  const [editingActivity, setEditingActivity] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const typeLabels = useMemo(() => new Map(ACTIVITY_TYPES.map(({ value, label }) => [value, label])), [])
  const priorityLabels = useMemo(() => new Map(ACTIVITY_PRIORITIES.map(({ value, label }) => [value, label])), [])

  async function loadActivities() {
    const nextActivities = await listCrmActivities(partnerId)
    setActivities(nextActivities)
  }

  useEffect(() => {
    let current = true
    async function load() {
      setLoading(true)
      try {
        const nextActivities = await listCrmActivities(partnerId)
        if (current) setActivities(nextActivities)
      } catch {
        if (current) setError('Die Aktivitäten konnten nicht geladen werden.')
      } finally {
        if (current) setLoading(false)
      }
    }
    load()
    return () => { current = false }
  }, [partnerId])

  const visibleActivities = activities.filter((activity) => (
    (typeFilter === 'all' || activity.type === typeFilter)
    && (priorityFilter === 'all' || activity.priority === priorityFilter)
  ))
  const showContactPerson = contactPersonTypes.has(form.type)
  const showReference = referenceTypes.has(form.type)
  const referenceLabel = form.type === 'offer' ? 'Angebotsnummer / Referenz (optional)' : 'Referenz / Tournummer (optional)'

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateType(type) {
    setForm((current) => ({
      ...current,
      type,
      contactPerson: contactPersonTypes.has(type) ? current.contactPerson : '',
      reference: referenceTypes.has(type) ? current.reference : '',
    }))
  }

  function startEditing(activity) {
    setEditingActivity(activity)
    setForm(formFromActivity(activity))
    setError('')
  }

  function cancelEditing() {
    setEditingActivity(null)
    setForm(emptyActivity())
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!form.text.trim()) {
      setError('Bitte beschreibe die Aktivität.')
      return
    }
    setSubmitting(true)
    try {
      if (editingActivity) await updateCrmActivity(partnerId, editingActivity.id, form)
      else await createCrmActivity(partnerId, form)
      await loadActivities()
      setToast(editingActivity ? 'Aktivität aktualisiert.' : 'Aktivität gespeichert.')
      setEditingActivity(null)
      setForm(emptyActivity())
    } catch {
      setError('Die Aktivität konnte nicht gespeichert werden. Bitte versuche es erneut.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="crm-activities" aria-label="CRM-Aktivitäten">
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
      <div className="crm-activities__entry">
        <div className="crm-activities__heading">
          <h3>{editingActivity ? 'Aktivität bearbeiten' : 'Aktivität hinzufügen'}</h3>
          {editingActivity && <button className="text-button" type="button" onClick={cancelEditing}>Abbrechen</button>}
        </div>
        <form className="crm-activity-form" onSubmit={handleSubmit}>
          <label>Datum<input type="date" value={form.date} onChange={(event) => updateField('date', event.target.value)} required /></label>
          <label>Art<select value={form.type} onChange={(event) => updateType(event.target.value)}>{ACTIVITY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <label>Hinweisstufe<select value={form.priority} onChange={(event) => updateField('priority', event.target.value)}>{ACTIVITY_PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label>
          <label className="crm-activity-form__text">Kurzbeschreibung<textarea value={form.text} onChange={(event) => updateField('text', event.target.value)} rows="3" required /></label>
          {showContactPerson && <label>Ansprechpartner (optional)<input value={form.contactPerson} onChange={(event) => updateField('contactPerson', event.target.value)} /></label>}
          {showReference && <label>{referenceLabel}<input value={form.reference} onChange={(event) => updateField('reference', event.target.value)} /></label>}
          {error && <p className="form-error crm-activity-form__error">{error}</p>}
          <div className="crm-activity-form__actions"><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : editingActivity ? 'Änderung speichern' : 'Aktivität speichern'}</button></div>
        </form>
      </div>
      <div className="crm-activity-history">
        <div className="crm-activities__heading crm-activity-history__heading">
          <h3>Aktivitätshistorie</h3>
          <div className="crm-activity-history__filters">
            <label><span className="sr-only">Nach Art filtern</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Alle Arten</option>{ACTIVITY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            <label><span className="sr-only">Nach Hinweisstufe filtern</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">Alle Hinweisstufen</option>{ACTIVITY_PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label>
          </div>
        </div>
        <div className="crm-activity-log-list">
          {loading && <p className="crm-activity-log__empty">Aktivitäten werden geladen …</p>}
          {!loading && visibleActivities.length === 0 && <p className="crm-activity-log__empty">Für diese Auswahl gibt es noch keine Aktivitäten.</p>}
          {!loading && visibleActivities.map((activity) => (
            <article className={`crm-activity-log crm-activity-log--${activity.priority || 'info'}`} key={activity.id}>
              <div className="crm-activity-log__date"><time dateTime={activity.date}>{formatDate(activity.date)}</time><span>{typeLabels.get(activity.type) || activity.type}</span></div>
              <div className="crm-activity-log__content">
                <div className="crm-activity-log__meta"><span className={`crm-activity-priority crm-activity-priority--${activity.priority || 'info'}`}>{priorityLabels.get(activity.priority) || 'Allgemeine Information'}</span><button className="text-button" type="button" onClick={() => startEditing(activity)}>Bearbeiten</button></div>
                <p>{activity.text}</p>
                {(activity.contactPerson || activity.reference) && <div className="crm-activity-log__details">{activity.contactPerson && <span>Ansprechpartner: {activity.contactPerson}</span>}{activity.reference && <span>Referenz: {activity.reference}</span>}</div>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
