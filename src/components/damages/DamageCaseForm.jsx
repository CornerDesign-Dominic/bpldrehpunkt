import { useMemo, useState } from 'react'
import { createEmptyDamageCase, DAMAGE_CASE_TYPES } from '../../lib/damages.js'

function initialValues(damageCase) {
  if (!damageCase) return createEmptyDamageCase()
  return {
    damageDate: damageCase.damageDate || '', title: damageCase.title || '', description: damageCase.description || '', damageType: damageCase.damageType || '',
    transportReference: damageCase.transportReference || '', claimant: damageCase.claimant || '', claimantPartnerId: damageCase.claimantPartnerId || '', contractor: damageCase.contractor || '', contractorPartnerId: damageCase.contractorPartnerId || '', damageAmount: damageCase.damageAmount ?? '',
  }
}

export default function DamageCaseForm({ damageCase, onCancel, onSubmit, partners = [] }) {
  const [form, setForm] = useState(() => initialValues(damageCase))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const customers = useMemo(() => partners.filter((partner) => partner.debtorNumber?.trim()), [partners])
  const contractors = useMemo(() => partners.filter((partner) => partner.creditorNumber?.trim()), [partners])
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  function selectPartner(kind, partnerId) {
    const partner = partners.find((entry) => entry.id === partnerId)
    if (kind === 'claimant') setForm((current) => ({ ...current, claimantPartnerId: partner?.id || '', claimant: partner?.companyName || '' }))
    else setForm((current) => ({ ...current, contractorPartnerId: partner?.id || '', contractor: partner?.companyName || '' }))
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.damageDate || !form.title.trim() || !form.damageType.trim() || form.damageAmount === '') {
      setError('Bitte Schadendatum, Kurzbezeichnung, Schadenart und Schadenhöhe erfassen.')
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
      <label className="form-field"><span>Schadenart *</span><select value={form.damageType} onChange={(event) => update('damageType', event.target.value)}><option value="">Bitte wählen</option>{DAMAGE_CASE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
      <label className="form-field"><span>Schadenhöhe *</span><input required type="number" min="0" step="0.01" inputMode="decimal" value={form.damageAmount} onChange={(event) => update('damageAmount', event.target.value)} placeholder="0,00" /></label>
      <label className="form-field damage-form__wide"><span>Kurzbezeichnung / Beschreibung *</span><textarea rows="3" value={form.title} maxLength="500" onChange={(event) => update('title', event.target.value)} /></label>
    </div></section>
    <section className="damage-form__section"><h3>Verknüpfung</h3><div className="damage-form__grid damage-form__grid--context">
      <label className="form-field"><span>Auftrag-/Tourreferenz</span><input value={form.transportReference} maxLength="240" onChange={(event) => update('transportReference', event.target.value)} /></label>
      <label className="form-field"><span>Kunde / Anspruchsteller</span><select value={form.claimantPartnerId} onChange={(event) => selectPartner('claimant', event.target.value)}><option value="">Kein Kunde verknüpft</option>{form.claimantPartnerId && !customers.some((partner) => partner.id === form.claimantPartnerId) && <option value={form.claimantPartnerId}>{form.claimant || 'Verknüpfter Kunde'}</option>}{customers.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></label>
      <label className="form-field"><span>Unternehmer</span><select value={form.contractorPartnerId} onChange={(event) => selectPartner('contractor', event.target.value)}><option value="">Kein Unternehmer verknüpft</option>{form.contractorPartnerId && !contractors.some((partner) => partner.id === form.contractorPartnerId) && <option value={form.contractorPartnerId}>{form.contractor || 'Verknüpfter Unternehmer'}</option>}{contractors.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></label>
    </div></section>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" onClick={onCancel} disabled={submitting}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : damageCase ? 'Änderungen speichern' : 'Fall anlegen'}</button></div>
  </form>
}
