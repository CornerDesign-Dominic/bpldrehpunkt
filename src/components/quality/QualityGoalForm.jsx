import { useState } from 'react'
import { QUALITY_GOAL_STATUSES } from '../../lib/qualityManagement.js'

function Field({ label, name, value, onChange, type = 'text', required = false, className = '', error }) {
  return <label className={`form-field ${className}`}><span>{label}{required ? ' *' : ''}</span><input name={name} value={value ?? ''} onChange={onChange} type={type} step={type === 'number' ? 'any' : undefined} aria-invalid={Boolean(error)} />{error && <small className="field-error">{error}</small>}</label>
}

function FormSection({ title, children }) {
  return <section className="form-section quality-goal-form__section"><h3>{title}</h3><div className="form-grid quality-goal-form__grid">{children}</div></section>
}

export default function QualityGoalForm({ formId, initialValue, onSubmit, onDirtyChange }) {
  const [form, setForm] = useState(initialValue)
  const [savedForm, setSavedForm] = useState(initialValue)
  const [errors, setErrors] = useState({})

  function handleChange(event) {
    const { name, value } = event.target
    const next = { ...form, [name]: value }
    setForm(next)
    setErrors((current) => ({ ...current, [name]: undefined }))
    onDirtyChange?.(JSON.stringify(next) !== JSON.stringify(savedForm))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!form.title.trim()) nextErrors.title = 'Der Titel ist erforderlich.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const saved = await onSubmit(form)
    if (saved) {
      setSavedForm(form)
      onDirtyChange?.(false)
    }
  }

  return <form id={formId} className="quality-goal-form" onSubmit={handleSubmit} noValidate>
    <FormSection title="Qualitätsziel">
      <Field label="Titel" name="title" value={form.title} onChange={handleChange} required className="form-grid__wide" error={errors.title} />
      <label className="form-field form-grid__wide"><span>Beschreibung</span><textarea name="description" value={form.description ?? ''} onChange={handleChange} rows="3" /></label>
      <Field label="Zeitraum" name="period" value={form.period} onChange={handleChange} />
      <Field label="Verantwortlicher" name="responsible" value={form.responsible} onChange={handleChange} />
      <label className="form-field"><span>Status</span><select name="status" value={form.status} onChange={handleChange}>{QUALITY_GOAL_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
    </FormSection>
    <FormSection title="Messgröße und Frist">
      <Field label="Startwert" name="startValue" value={form.startValue} onChange={handleChange} type="number" />
      <Field label="Zielwert" name="targetValue" value={form.targetValue} onChange={handleChange} type="number" />
      <Field label="Einheit" name="unit" value={form.unit} onChange={handleChange} />
      <Field label="Aktueller Wert" name="currentValue" value={form.currentValue} onChange={handleChange} type="number" />
      <Field label="Startdatum" name="startDate" value={form.startDate} onChange={handleChange} type="date" />
      <Field label="Zieldatum" name="targetDate" value={form.targetDate} onChange={handleChange} type="date" />
    </FormSection>
    <FormSection title="Bemerkung">
      <label className="form-field form-grid__wide"><span>Bemerkung</span><textarea name="note" value={form.note ?? ''} onChange={handleChange} rows="3" /></label>
    </FormSection>
  </form>
}
