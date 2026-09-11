import { useState } from 'react'

export default function InsolvencyEditModal({ insolvency, section = 'general', onCancel, onSubmit }) {
  const description = section === 'description'
  const [form, setForm] = useState(() => description ? { description: insolvency.description || '' } : { insolvencyDate: insolvency.insolvencyDate || '', courtReference: insolvency.courtReference || '', courtVenue: insolvency.courtVenue || '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try { await onSubmit(form) } catch (submissionError) { setError(submissionError.message || 'Die Insolvenz konnte nicht aktualisiert werden.') } finally { setSubmitting(false) }
  }

  return <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}><section className="damage-form-modal" role="dialog" aria-modal="true" aria-label={description ? 'Beschreibung bearbeiten' : 'Insolvenz bearbeiten'}><form className="damage-form" onSubmit={submit} noValidate><div className="damage-form__heading"><h2>{description ? 'Beschreibung bearbeiten' : 'Insolvenz bearbeiten'}</h2></div>{description ? <section className="damage-form__section"><label className="form-field"><span>Beschreibung</span><textarea rows="8" maxLength="4000" value={form.description} onChange={(event) => update('description', event.target.value)} autoFocus /></label></section> : <section className="damage-form__section"><h3>Falldaten</h3><div className="damage-form__grid damage-form__grid--context"><label className="form-field"><span>Insolvenzdatum</span><input type="date" value={form.insolvencyDate} onChange={(event) => update('insolvencyDate', event.target.value)} /></label><label className="form-field"><span>Aktenzeichen</span><input value={form.courtReference} maxLength="240" onChange={(event) => update('courtReference', event.target.value)} /></label><label className="form-field"><span>Gerichtsstand</span><input value={form.courtVenue} maxLength="240" onChange={(event) => update('courtVenue', event.target.value)} /></label></div></section>}{error && <p className="form-error">{error}</p>}<div className="form-actions"><button className="button button--secondary" type="button" disabled={submitting} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : 'Änderungen speichern'}</button></div></form></section></div>
}
