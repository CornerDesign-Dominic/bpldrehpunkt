import { useMemo, useState } from 'react'
import { createEmptyInkassoCase } from '../../lib/inkasso.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'

export default function InkassoCaseForm({ users = [], onCancel, onSubmit }) {
  const [form, setForm] = useState(createEmptyInkassoCase)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const activeUsers = useMemo(() => users.filter((entry) => entry.active !== false).sort((left, right) => getUserDisplayName(left, left).localeCompare(getUserDisplayName(right, right), 'de')), [users])
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  async function submit(event) {
    event.preventDefault()
    if (!form.title.trim()) {
      setError('Bitte eine Fallbezeichnung eingeben.')
      return
    }
    setSubmitting(true)
    setError('')
    try { await onSubmit(form) } catch (submitError) { setError(submitError.message || 'Der Inkassofall konnte nicht angelegt werden.') } finally { setSubmitting(false) }
  }

  return <form className="damage-form" onSubmit={submit} noValidate>
    <div className="damage-form__heading"><h2>Inkasso hinzufügen</h2></div>
    <section className="damage-form__section"><h3>Grunddaten</h3><div className="damage-form__grid damage-form__grid--context">
      <label className="form-field damage-form__wide"><span>Fallbezeichnung *</span><textarea autoFocus rows="3" value={form.title} maxLength="500" onChange={(event) => update('title', event.target.value)} /></label>
      <label className="form-field"><span>Schuldner / Unternehmen</span><input value={form.debtorName} maxLength="240" onChange={(event) => update('debtorName', event.target.value)} /></label>
      <label className="form-field"><span>Rechnungsnummer(n)</span><input value={form.invoiceNumbers} maxLength="1000" onChange={(event) => update('invoiceNumbers', event.target.value)} /></label>
      <label className="form-field"><span>Ursprüngliche Fälligkeit</span><input type="date" value={form.originalDueDate} onChange={(event) => update('originalDueDate', event.target.value)} /></label>
      <label className="form-field"><span>Zuständige Person</span><select value={form.responsibleUserId} onChange={(event) => update('responsibleUserId', event.target.value)}><option value="">Nicht zugeordnet</option>{activeUsers.map((entry) => <option key={entry.id} value={entry.id}>{getUserDisplayName(entry, entry)}</option>)}</select></label>
    </div></section>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" disabled={submitting} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird angelegt …' : 'Inkassofall anlegen'}</button></div>
  </form>
}
