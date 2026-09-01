import { useState } from 'react'
import { createEmptyBusinessPartner } from '../../lib/businessPartners.js'

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

function Field({ label, name, value, onChange, error, type = 'text', placeholder, className = '' }) {
  return (
    <label className={`form-field ${className}`}>
      <span>{label}</span>
      <input name={name} value={value} onChange={onChange} type={type} placeholder={placeholder} aria-invalid={Boolean(error)} />
      {error && <small className="field-error">{error}</small>}
    </label>
  )
}

function FormSection({ title, className = '', children }) {
  return <section className="form-section"><h2>{title}</h2><div className={`form-grid ${className}`}>{children}</div></section>
}

export default function BusinessPartnerForm({ initialValue, onSubmit, onDirtyChange, onFormChange, formId }) {
  const [form, setForm] = useState(initialValue ?? createEmptyBusinessPartner())
  const [savedForm, setSavedForm] = useState(initialValue ?? createEmptyBusinessPartner())
  const [errors, setErrors] = useState({})

  function handleChange(event) {
    const { name, value } = event.target
    const [group, field] = name.split('.')
    const nextForm = field ? { ...form, [group]: { ...form[group], [field]: value } } : { ...form, [name]: value }
    setForm(nextForm)
    onFormChange?.(nextForm)
    onDirtyChange?.(JSON.stringify(nextForm) !== JSON.stringify(savedForm))
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
    const saved = await onSubmit(form)
    if (saved) {
      setSavedForm(form)
      onDirtyChange?.(false)
    }
  }

  return (
    <form id={formId} className="business-partner-form" onSubmit={handleSubmit} noValidate>
      <FormSection title="Identifikation" className="form-grid--identification">
        <Field className="form-field--company" label="Firmenname *" name="companyName" value={form.companyName} onChange={handleChange} error={errors.companyName} />
        <Field label="Kurzname" name="shortName" value={form.shortName} onChange={handleChange} />
        <Field label="Debitorennummer" name="debtorNumber" value={form.debtorNumber} onChange={handleChange} placeholder="DyCoS-Referenz" />
        <Field label="Kreditorennummer" name="creditorNumber" value={form.creditorNumber} onChange={handleChange} placeholder="DyCoS-Referenz" />
        <Field label="TIMOCOM-Nummer" name="timocomNumber" value={form.timocomNumber} onChange={handleChange} />
        <Field label="Trans.eu-Nummer" name="transeuNumber" value={form.transeuNumber} onChange={handleChange} />
        {errors.references && <p className="form-error form-grid__wide">{errors.references}</p>}
        <label className="form-field"><span>Status</span><select name="status" value={form.status} onChange={handleChange}><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></select></label>
      </FormSection>

      <FormSection title="Anschrift" className="form-grid--address">
        <Field label="Straße" name="address.street" value={form.address.street} onChange={handleChange} />
        <Field label="Hausnummer" name="address.houseNumber" value={form.address.houseNumber} onChange={handleChange} />
        <Field label="PLZ" name="address.postalCode" value={form.address.postalCode} onChange={handleChange} />
        <Field label="Ort" name="address.city" value={form.address.city} onChange={handleChange} />
        <Field label="Land" name="address.country" value={form.address.country} onChange={handleChange} />
      </FormSection>

      <FormSection title="Kontakt" className="form-grid--contact">
        <Field label="Telefon" name="contact.phone" value={form.contact.phone} onChange={handleChange} type="tel" />
        <Field label="E-Mail" name="contact.email" value={form.contact.email} onChange={handleChange} error={errors['contact.email']} type="email" />
        <Field label="Website" name="contact.website" value={form.contact.website} onChange={handleChange} error={errors['contact.website']} placeholder="https://" />
      </FormSection>

      <FormSection title="Unternehmensdaten" className="form-grid--company-data">
        <Field label="USt-IdNr." name="companyData.vatId" value={form.companyData.vatId} onChange={handleChange} />
        <Field label="Handelsregisternummer" name="companyData.commercialRegisterNumber" value={form.companyData.commercialRegisterNumber} onChange={handleChange} />
        <Field label="Registergericht" name="companyData.registerCourt" value={form.companyData.registerCourt} onChange={handleChange} />
      </FormSection>
    </form>
  )
}
