import { useMemo, useState } from 'react'
import { createEmptyDamageCase, DAMAGE_CASE_STATUSES } from '../../lib/damages.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'

function initialValues(damageCase) {
  if (!damageCase) return createEmptyDamageCase()
  return {
    damageDate: damageCase.damageDate || '', title: damageCase.title || '', description: damageCase.description || '', damageType: damageCase.damageType || '', status: damageCase.status || 'new',
    transportReference: damageCase.transportReference || '', claimant: damageCase.claimant || '', contractor: damageCase.contractor || '', responsibleUserId: damageCase.responsibleUserId || '', dueDate: damageCase.dueDate || '', damageAmount: damageCase.damageAmount ?? '',
  }
}

export default function DamageCaseForm({ damageCase, onCancel, onSubmit, users = [] }) {
  const [form, setForm] = useState(() => initialValues(damageCase))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const activeUsers = useMemo(() => users.filter((user) => user.active !== false).sort((left, right) => getUserDisplayName(left, left).localeCompare(getUserDisplayName(right, right), 'de')), [users])
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  async function submit(event) {
    event.preventDefault()
    if (!form.damageDate || !form.title.trim() || !form.damageType.trim()) {
      setError('Bitte Schadendatum, Kurzbezeichnung und Schadenart erfassen.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(form)
    } catch (submissionError) {
      setError(submissionError.message || 'Der Fall konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  return <form className="damage-form" onSubmit={submit} noValidate>
    <div className="damage-form__heading"><h2>{damageCase ? 'Fall bearbeiten' : 'Neuen Fall anlegen'}</h2>{damageCase?.caseNumber && <span>{damageCase.caseNumber}</span>}</div>
    <section className="damage-form__section"><h3>Falldaten</h3><div className="damage-form__grid damage-form__grid--core">
      <label className="form-field"><span>Schadendatum *</span><input type="date" value={form.damageDate} onChange={(event) => update('damageDate', event.target.value)} /></label>
      <label className="form-field"><span>Schadenart *</span><input value={form.damageType} maxLength="120" onChange={(event) => update('damageType', event.target.value)} placeholder="z. B. Transportschaden" /></label>
      <label className="form-field"><span>Status *</span><select value={form.status} onChange={(event) => update('status', event.target.value)}>{DAMAGE_CASE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
      <label className="form-field damage-form__wide"><span>Kurzbezeichnung / Beschreibung *</span><textarea rows="3" value={form.title} maxLength="500" onChange={(event) => update('title', event.target.value)} /></label>
    </div></section>
    <section className="damage-form__section"><h3>Zuordnung &amp; Frist</h3><div className="damage-form__grid damage-form__grid--context">
      <label className="form-field"><span>Auftrag-/Tourreferenz</span><input value={form.transportReference} maxLength="240" onChange={(event) => update('transportReference', event.target.value)} /></label>
      <label className="form-field"><span>Kunde / Anspruchsteller</span><input value={form.claimant} maxLength="240" onChange={(event) => update('claimant', event.target.value)} /></label>
      <label className="form-field"><span>Unternehmer</span><input value={form.contractor} maxLength="240" onChange={(event) => update('contractor', event.target.value)} /></label>
      <label className="form-field"><span>Verantwortliche Person</span><select value={form.responsibleUserId} onChange={(event) => update('responsibleUserId', event.target.value)}><option value="">Nicht zugeordnet</option>{form.responsibleUserId && !activeUsers.some((user) => user.id === form.responsibleUserId) && <option value={form.responsibleUserId}>Bisher zugeordnet</option>}{activeUsers.map((user) => <option key={user.id} value={user.id}>{getUserDisplayName(user, user)}</option>)}</select></label>
      <label className="form-field"><span>Nächste Frist</span><input type="date" value={form.dueDate} onChange={(event) => update('dueDate', event.target.value)} /></label>
      <label className="form-field"><span>Schadenhöhe</span><input type="number" min="0" step="0.01" inputMode="decimal" value={form.damageAmount} onChange={(event) => update('damageAmount', event.target.value)} placeholder="0,00" /></label>
    </div></section>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" onClick={onCancel} disabled={submitting}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : damageCase ? 'Änderungen speichern' : 'Fall anlegen'}</button></div>
  </form>
}
