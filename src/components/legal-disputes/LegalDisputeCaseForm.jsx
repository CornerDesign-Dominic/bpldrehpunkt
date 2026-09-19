import { useMemo, useState } from 'react'
import { createEmptyLegalDispute } from '../../lib/legalDisputes.js'

export default function LegalDisputeCaseForm({ onCancel, onSubmit, partners = [] }) {
  const [form, setForm] = useState(createEmptyLegalDispute)
  const [counterpartySelection, setCounterpartySelection] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const customers = useMemo(() => partners.filter((partner) => partner.debtorNumber?.trim()), [partners])
  const carriers = useMemo(() => partners.filter((partner) => partner.creditorNumber?.trim()), [partners])

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  function selectCounterparty(value) {
    const [, partnerId] = value.split(':')
    const partner = partners.find((entry) => entry.id === partnerId)
    setCounterpartySelection(value)
    update('counterparty', partner?.companyName || '')
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.title.trim()) {
      setError('Bitte einen Betreff für den Fall eingeben.')
      return
    }
    setSubmitting(true)
    setError('')
    try { await onSubmit(form) } catch (submitError) { setError(submitError.message || 'Der Fall konnte nicht angelegt werden.') } finally { setSubmitting(false) }
  }

  return <form className="damage-form legal-dispute-case-form" onSubmit={submit} noValidate>
    <div className="damage-form__heading"><h2>Neuen Fall anlegen</h2></div>
    <section className="damage-form__section"><h3>Grunddaten</h3><div className="damage-form__grid damage-form__grid--context">
      <label className="form-field damage-form__wide"><span>Fall / Betreff *</span><textarea autoFocus rows="3" value={form.title} maxLength="500" onChange={(event) => update('title', event.target.value)} /></label>
      <label className="form-field"><span>Art</span><input value={form.caseType} maxLength="120" onChange={(event) => update('caseType', event.target.value)} placeholder="z. B. Klage, Mahnverfahren" /></label>
      <label className="form-field"><span>Gegenseite</span><select value={counterpartySelection} onChange={(event) => selectCounterparty(event.target.value)}><option value="">Keine Gegenseite ausgewählt</option>{customers.length > 0 && <optgroup label="Kunden">{customers.map((partner) => <option key={`customer-${partner.id}`} value={`customer:${partner.id}`}>{partner.companyName}</option>)}</optgroup>}{carriers.length > 0 && <optgroup label="Unternehmer">{carriers.map((partner) => <option key={`carrier-${partner.id}`} value={`carrier:${partner.id}`}>{partner.companyName}</option>)}</optgroup>}</select></label>
      <label className="form-field"><span>Transportauftragsnummer</span><input value={form.transportReference} maxLength="240" onChange={(event) => update('transportReference', event.target.value)} /></label>
    </div></section>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" disabled={submitting} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird angelegt …' : 'Fall anlegen'}</button></div>
  </form>
}
