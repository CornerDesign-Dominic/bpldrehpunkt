import { useState } from 'react'
import { createEmptyInsolvency } from '../../lib/insolvencies.js'

function partnerLabel(partner) {
  const numbers = [partner.debtorNumber && `Debitor ${partner.debtorNumber}`, partner.creditorNumber && `Kreditor ${partner.creditorNumber}`].filter(Boolean)
  return numbers.length ? `${partner.companyName} · ${numbers.join(' · ')}` : partner.companyName
}

export default function InsolvencyCaseForm({ onCancel, onSubmit, partners, loadingPartners, partnerError }) {
  const [form, setForm] = useState(createEmptyInsolvency)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  async function submit(event) {
    event.preventDefault()
    const partner = partners.find((entry) => entry.id === form.partnerId)
    if (!partner) {
      setError('Bitte ein betroffenes Unternehmen auswählen.')
      return
    }
    setSubmitting(true)
    setError('')
    try { await onSubmit(form, partner) } catch (submissionError) { setError(submissionError.message || 'Der Insolvenzfall konnte nicht angelegt werden.') } finally { setSubmitting(false) }
  }

  return <form className="damage-form insolvency-case-form" onSubmit={submit} noValidate>
    <div className="damage-form__heading"><h2>Insolvenz hinzufügen</h2></div>
    <section className="damage-form__section"><h3>Grunddaten</h3><div className="damage-form__grid damage-form__grid--context">
      <label className="form-field damage-form__wide"><span>Betroffenes Unternehmen *</span><select autoFocus value={form.partnerId} onChange={(event) => update('partnerId', event.target.value)} disabled={loadingPartners || Boolean(partnerError)}><option value="">{loadingPartners ? 'Unternehmen werden geladen …' : 'Bitte auswählen'}</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partnerLabel(partner)}</option>)}</select></label>
      <label className="form-field"><span>Insolvenzdatum</span><input type="date" value={form.insolvencyDate} onChange={(event) => update('insolvencyDate', event.target.value)} /></label>
      <label className="form-field"><span>Aktenzeichen</span><input value={form.courtReference} maxLength="240" onChange={(event) => update('courtReference', event.target.value)} /></label>
      <label className="form-field"><span>Gerichtsstand</span><input value={form.courtVenue} maxLength="240" onChange={(event) => update('courtVenue', event.target.value)} /></label>
    </div></section>
    {partnerError && <p className="form-error">{partnerError}</p>}{error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" disabled={submitting} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={submitting || loadingPartners || Boolean(partnerError)}>{submitting ? 'Wird angelegt …' : 'Insolvenz anlegen'}</button></div>
  </form>
}
