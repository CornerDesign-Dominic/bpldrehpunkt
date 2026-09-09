import { useEffect, useState } from 'react'
import { createEmptyDamageMovement, DAMAGE_MOVEMENT_DIRECTIONS, DAMAGE_MOVEMENT_STATUSES } from '../../lib/damages.js'

function Field({ children, label }) {
  return <label className="form-field"><span>{label}</span>{children}</label>
}

export default function DamageMovementModal({ movement, onCancel, onSubmit }) {
  const isNew = !movement
  const [form, setForm] = useState(() => ({ ...(movement || createEmptyDamageMovement()), amount: movement?.amount ?? '' }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel, saving])

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try { await onSubmit(form) } catch (submissionError) { setError(submissionError.message || 'Die Betragsbewegung konnte nicht gespeichert werden.') } finally { setSaving(false) }
  }

  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}>
    <section className="todo-quick-edit-modal damage-movement-modal" role="dialog" aria-modal="true" aria-labelledby="damage-movement-modal-title">
      <form className="todo-quick-editor" onSubmit={save} noValidate>
        <div className="todo-quick-editor__heading"><h2 id="damage-movement-modal-title">{isNew ? 'Betragsbewegung hinzufügen' : 'Betragsbewegung bearbeiten'}</h2></div>
        <div className="todo-quick-editor__grid todo-quick-editor__grid--three">
          <Field label="Datum *"><input autoFocus type="date" value={form.movementDate} required onChange={(event) => update('movementDate', event.target.value)} /></Field>
          <Field label="Richtung *"><select value={form.direction} required onChange={(event) => update('direction', event.target.value)}>{DAMAGE_MOVEMENT_DIRECTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
          <Field label="Betrag *"><input type="number" min="0" step="0.01" value={form.amount} required onChange={(event) => update('amount', event.target.value)} /></Field>
          <Field label="Beteiligter *"><input value={form.participant} maxLength="240" required onChange={(event) => update('participant', event.target.value)} /></Field>
          <Field label="Status *"><select value={form.status} required onChange={(event) => update('status', event.target.value)}>{DAMAGE_MOVEMENT_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
          <Field label="Zweck / Beschreibung"><textarea rows="4" value={form.description} maxLength="1000" onChange={(event) => update('description', event.target.value)} /></Field>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="todo-quick-editor__actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>
      </form>
    </section>
  </div>
}
