import { useState } from 'react'
import { CASE_MODULES } from '../../lib/cases.js'

function Field({ label, name, value, onChange, type = 'text', required = false, className = '', placeholder, error }) {
  return <label className={`form-field ${className}`}><span>{label}{required ? ' *' : ''}</span><input name={name} value={value ?? ''} onChange={onChange} type={type} step={type === 'number' ? '0.01' : undefined} placeholder={placeholder} aria-invalid={Boolean(error)} />{error && <small className="field-error">{error}</small>}</label>
}

function SelectField({ label, name, value, onChange, children, required = false }) {
  return <label className="form-field"><span>{label}{required ? ' *' : ''}</span><select name={name} value={value ?? ''} onChange={onChange}>{children}</select></label>
}

function FormSection({ title, children }) {
  return <section className="form-section case-form-section"><h2>{title}</h2><div className="form-grid case-form-grid">{children}</div></section>
}

export default function CaseForm({ moduleKey, initialValue, partners, onSubmit, onDirtyChange, formId }) {
  const module = CASE_MODULES[moduleKey]
  const [form, setForm] = useState(initialValue)
  const [savedForm, setSavedForm] = useState(initialValue)
  const [errors, setErrors] = useState({})

  function update(next) {
    setForm(next)
    onDirtyChange?.(JSON.stringify(next) !== JSON.stringify(savedForm))
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    const [group, field] = name.split('.')
    const nextValue = type === 'checkbox' ? checked : value
    update(field ? { ...form, [group]: { ...form[group], [field]: nextValue } } : { ...form, [name]: nextValue })
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!form.internalReference.trim()) nextErrors.internalReference = 'Interne Referenz ist erforderlich.'
    if (!form.title.trim()) nextErrors.title = 'Bezeichnung ist erforderlich.'
    if (moduleKey === 'debtCollection' && !form.debtor.trim()) nextErrors.debtor = 'Schuldner ist erforderlich.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const saved = await onSubmit(form)
    if (saved) { setSavedForm(form); onDirtyChange?.(false) }
  }

  const financial = form.financial
  return <form id={formId} className="case-form" onSubmit={handleSubmit} noValidate>
    <FormSection title="Fallakte">
      <Field label="Interne Referenz" name="internalReference" value={form.internalReference} onChange={handleChange} required error={errors.internalReference} />
      <Field label="Bezeichnung" name="title" value={form.title} onChange={handleChange} required className="case-form-grid__wide" error={errors.title} />
      <SelectField label="Status" name="status" value={form.status} onChange={handleChange}>{module.statuses.map((status) => <option key={status}>{status}</option>)}</SelectField>
      <SelectField label="Geschäftspartner" name="partnerId" value={form.partnerId} onChange={handleChange}><option value="">Nicht verknüpft</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</SelectField>
      {moduleKey === 'legal' && <><SelectField label="Art" name="caseType" value={form.caseType} onChange={handleChange}>{module.types.map((type) => <option key={type}>{type}</option>)}</SelectField><Field label="Gegenpartei" name="opponent" value={form.opponent} onChange={handleChange} /><Field label="Gerichtliches Aktenzeichen" name="courtReference" value={form.courtReference} onChange={handleChange} /><Field label="Anwalt / Kanzlei" name="lawyer" value={form.lawyer} onChange={handleChange} /></>}
      {moduleKey === 'debtCollection' && <><Field label="Schuldner" name="debtor" value={form.debtor} onChange={handleChange} required error={errors.debtor} /><Field label="DyCoS-Debitor" name="debtorReference" value={form.debtorReference} onChange={handleChange} /><Field label="Inkassodienstleister" name="collectionAgency" value={form.collectionAgency} onChange={handleChange} /></>}
      {moduleKey === 'insurance' && <><Field label="Schadendatum" name="damageDate" value={form.damageDate} onChange={handleChange} type="date" /><Field label="Tour / DyCoS-Referenz" name="tourReference" value={form.tourReference} onChange={handleChange} /><Field label="Schadensart" name="damageType" value={form.damageType} onChange={handleChange} /></>}
    </FormSection>

    <FormSection title="Finanzen">
      {moduleKey === 'legal' && <><Field label="Streitwert" name="financial.disputeValue" value={financial.disputeValue} onChange={handleChange} type="number" /><Field label="Eigene Forderung" name="financial.ownClaim" value={financial.ownClaim} onChange={handleChange} type="number" /><Field label="Gegnerische Forderung" name="financial.opposingClaim" value={financial.opposingClaim} onChange={handleChange} type="number" /><Field label="Anwaltskosten" name="financial.lawyerCosts" value={financial.lawyerCosts} onChange={handleChange} type="number" /><Field label="Gerichtskosten" name="financial.courtCosts" value={financial.courtCosts} onChange={handleChange} type="number" /><Field label="Sonstige Kosten" name="financial.otherCosts" value={financial.otherCosts} onChange={handleChange} type="number" /></>}
      {moduleKey === 'debtCollection' && <><Field label="Ursprüngliche Hauptforderung" name="financial.principalAmount" value={financial.principalAmount} onChange={handleChange} type="number" /><Field label="Nebenforderungen" name="financial.additionalClaims" value={financial.additionalClaims} onChange={handleChange} type="number" /><Field label="Inkassokosten" name="financial.collectionCosts" value={financial.collectionCosts} onChange={handleChange} type="number" /><Field label="Bisherige Zahlungen" name="financial.paidAmount" value={financial.paidAmount} onChange={handleChange} type="number" /></>}
      {moduleKey === 'insurance' && <><Field label="Geltend gemachte Schadenhöhe" name="financial.claimedAmount" value={financial.claimedAmount} onChange={handleChange} type="number" /><Field label="Anerkannter Betrag" name="financial.recognizedAmount" value={financial.recognizedAmount} onChange={handleChange} type="number" /><Field label="Regulierter Betrag" name="financial.settledAmount" value={financial.settledAmount} onChange={handleChange} type="number" /><Field label="Selbstbehalt" name="financial.deductible" value={financial.deductible} onChange={handleChange} type="number" /></>}
    </FormSection>

    {moduleKey === 'insurance' && <FormSection title="Schadensdaten und Versicherung"><label className="form-field case-form-grid__wide"><span>Kurze Schadenbeschreibung</span><textarea name="description" value={form.description} onChange={handleChange} rows="3" /></label><Field label="Versicherung / Versicherer" name="insurer" value={form.insurer} onChange={handleChange} /><Field label="Versicherungsnummer" name="policyNumber" value={form.policyNumber} onChange={handleChange} /><Field label="Externe Schadennummer" name="externalReference" value={form.externalReference} onChange={handleChange} /><Field label="Ansprechpartner" name="contactPerson" value={form.contactPerson} onChange={handleChange} /></FormSection>}

    <FormSection title="Frist"><Field label="Nächste Frist" name="deadline.dueDate" value={form.deadline.dueDate} onChange={handleChange} type="date" /><Field label="Art der Frist" name="deadline.type" value={form.deadline.type} onChange={handleChange} /><label className="form-field case-form-grid__wide"><span>Bemerkung</span><input name="deadline.note" value={form.deadline.note} onChange={handleChange} /></label><label className="checkbox-field"><input name="deadline.completed" checked={Boolean(form.deadline.completed)} onChange={handleChange} type="checkbox" /> Frist erledigt</label></FormSection>
    <FormSection title="Sachstand"><label className="form-field case-form-grid__wide"><span>Aktueller Sachstand</span><textarea name="progress" value={form.progress} onChange={handleChange} rows="4" /></label></FormSection>
  </form>
}
