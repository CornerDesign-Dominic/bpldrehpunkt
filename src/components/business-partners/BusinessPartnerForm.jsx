import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createEmptyBusinessPartner, getBusinessPartnerType } from '../../lib/businessPartners.js'

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validateWebsite(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function Field({ label, name, value, onChange, error, type = 'text', placeholder }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input name={name} value={value} onChange={onChange} type={type} placeholder={placeholder} aria-invalid={Boolean(error)} />
      {error && <small className="field-error">{error}</small>}
    </label>
  )
}

function FormSection({ title, children }) {
  return <section className="form-section"><h2>{title}</h2><div className="form-grid">{children}</div></section>
}

export default function BusinessPartnerForm({ initialValue, onSubmit, isSubmitting, submitLabel, cancelTo }) {
  const [form, setForm] = useState(initialValue ?? createEmptyBusinessPartner())
  const [errors, setErrors] = useState({})

  function handleChange(event) {
    const { name, value } = event.target
    const [group, field] = name.split('.')
    setForm((current) => field ? { ...current, [group]: { ...current[group], [field]: value } } : { ...current, [name]: value })
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!form.companyName.trim()) nextErrors.companyName = 'Firmenname ist erforderlich.'
    if (!form.debtorNumber.trim() && !form.creditorNumber.trim()) nextErrors.references = 'Mindestens eine Debitoren- oder Kreditorennummer ist erforderlich.'
    if (form.contact.email.trim() && !validateEmail(form.contact.email)) nextErrors['contact.email'] = 'Bitte eine gültige E-Mail-Adresse eingeben.'
    if (form.contact.website.trim() && !validateWebsite(form.contact.website)) nextErrors['contact.website'] = 'Bitte eine vollständige Website-Adresse eingeben.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    await onSubmit(form)
  }

  const type = getBusinessPartnerType(form)

  return (
    <form className="business-partner-form" onSubmit={handleSubmit} noValidate>
      <FormSection title="Identifikation">
        <Field label="Firmenname *" name="companyName" value={form.companyName} onChange={handleChange} error={errors.companyName} />
        <Field label="Kurzname" name="shortName" value={form.shortName} onChange={handleChange} />
        <Field label="Debitorennummer" name="debtorNumber" value={form.debtorNumber} onChange={handleChange} placeholder="DICOS-Referenz" />
        <Field label="Kreditorennummer" name="creditorNumber" value={form.creditorNumber} onChange={handleChange} placeholder="DICOS-Referenz" />
        {errors.references && <p className="form-error form-grid__wide">{errors.references}</p>}
        <div className="form-field"><span>Geschäftspartner-Typ</span><output className="derived-value">{type}</output></div>
        <label className="form-field"><span>Status</span><select name="status" value={form.status} onChange={handleChange}><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></select></label>
      </FormSection>

      <FormSection title="Anschrift">
        <Field label="Straße" name="address.street" value={form.address.street} onChange={handleChange} />
        <Field label="Hausnummer" name="address.houseNumber" value={form.address.houseNumber} onChange={handleChange} />
        <Field label="PLZ" name="address.postalCode" value={form.address.postalCode} onChange={handleChange} />
        <Field label="Ort" name="address.city" value={form.address.city} onChange={handleChange} />
        <Field label="Land" name="address.country" value={form.address.country} onChange={handleChange} />
      </FormSection>

      <FormSection title="Kontakt">
        <Field label="Telefon" name="contact.phone" value={form.contact.phone} onChange={handleChange} type="tel" />
        <Field label="E-Mail" name="contact.email" value={form.contact.email} onChange={handleChange} error={errors['contact.email']} type="email" />
        <Field label="Website" name="contact.website" value={form.contact.website} onChange={handleChange} error={errors['contact.website']} placeholder="https://" />
      </FormSection>

      <FormSection title="Unternehmensdaten">
        <Field label="USt-IdNr." name="companyData.vatId" value={form.companyData.vatId} onChange={handleChange} />
        <Field label="Handelsregisternummer" name="companyData.commercialRegisterNumber" value={form.companyData.commercialRegisterNumber} onChange={handleChange} />
        <Field label="Registergericht" name="companyData.registerCourt" value={form.companyData.registerCourt} onChange={handleChange} />
      </FormSection>

      <div className="form-actions">
        <Link className="button button--secondary" to={cancelTo}>Abbrechen</Link>
        <button className="button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Wird gespeichert …' : submitLabel}</button>
      </div>
    </form>
  )
}
