import { useState } from 'react'
import { createEmptyBusinessPartner } from '../../lib/businessPartners.js'
import '../../styles/businessPartnerExtensions.css'

const departments = ['Geschäftsführung', 'Disposition', 'Einkauf', 'Verkauf', 'Logistik', 'Lager', 'Buchhaltung', 'Finanzbuchhaltung', 'Rechnungswesen', 'Controlling', 'Personal', 'Einkauf / Beschaffung', 'Kundenservice', 'Qualität / QM', 'IT', 'Empfang / Zentrale', 'Sonstiges']

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

function createContact() {
  return { id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: '', department: '', departmentOther: '', phone: '', mobile: '', email: '' }
}

function createPortal() {
  return { id: `portal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: '', url: '', username: '', password: '', purpose: '' }
}

function normalizeForm(value) {
  const defaults = createEmptyBusinessPartner()
  return {
    ...defaults,
    ...(value ?? {}),
    address: { ...defaults.address, ...(value?.address ?? {}) },
    contact: { ...defaults.contact, ...(value?.contact ?? {}) },
    companyData: { ...defaults.companyData, ...(value?.companyData ?? {}) },
    contacts: (value?.contacts ?? []).map((contact) => ({ ...createContact(), ...contact })),
    portals: (value?.portals ?? []).map((portal) => ({ ...createPortal(), ...portal })),
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

function displayDepartment(contact) {
  return contact.department === 'Sonstiges' && contact.departmentOther ? `Sonstiges · ${contact.departmentOther}` : contact.department
}

function ContactsSection({ contacts, onChange, draft, onDraftChange }) {
  const [errors, setErrors] = useState({})

  function startAdd() {
    setErrors({})
    onDraftChange(createContact())
  }

  function startEdit(contact) {
    setErrors({})
    onDraftChange({ ...contact, departmentOther: contact.departmentOther ?? '' })
  }

  function updateDraft(field, value) {
    onDraftChange({ ...draft, [field]: value })
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function saveDraft() {
    const nextErrors = {}
    if (!draft.name.trim()) nextErrors.name = 'Name ist erforderlich.'
    if (!draft.department) nextErrors.department = 'Abteilung ist erforderlich.'
    if (draft.email.trim() && !validateEmail(draft.email)) nextErrors.email = 'Bitte eine gültige E-Mail-Adresse eingeben.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const exists = contacts.some((contact) => contact.id === draft.id)
    onChange(exists ? contacts.map((contact) => contact.id === draft.id ? draft : contact) : [...contacts, draft])
    onDraftChange(null)
  }

  function removeContact(contactId) {
    onChange(contacts.filter((contact) => contact.id !== contactId))
    if (draft?.id === contactId) onDraftChange(null)
  }

  return (
    <section className="form-section contacts-section">
      <div className="contacts-section__header"><div><h2>Ansprechpartner</h2><p>Personenbezogene Kontakte des Geschäftspartners</p></div><button className="button button--secondary" type="button" onClick={startAdd}>Ansprechpartner hinzufügen</button></div>
      <div className="contacts-table table-frame"><table><thead><tr><th>Name</th><th>Abteilung</th><th>Telefon</th><th>Mobil</th><th>E-Mail</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{contacts.length ? contacts.map((contact) => <tr key={contact.id}><td><strong>{contact.name}</strong></td><td>{displayDepartment(contact)}</td><td>{contact.phone || '—'}</td><td>{contact.mobile || '—'}</td><td>{contact.email || '—'}</td><td><div className="contact-actions"><button type="button" onClick={() => startEdit(contact)}>Bearbeiten</button><button type="button" onClick={() => removeContact(contact.id)}>Entfernen</button></div></td></tr>) : <tr><td className="table-state" colSpan="6">Noch keine Ansprechpartner erfasst.</td></tr>}</tbody></table></div>
      {draft && <div className="contact-editor"><div className="contact-editor__header"><h3>{contacts.some((contact) => contact.id === draft.id) ? 'Ansprechpartner bearbeiten' : 'Ansprechpartner hinzufügen'}</h3><button className="button button--secondary" type="button" onClick={() => onDraftChange(null)}>Abbrechen</button></div><div className="contact-editor__grid"><Field label="Name *" name="contact-name" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} error={errors.name} /><label className="form-field"><span>Abteilung *</span><select value={draft.department} onChange={(event) => updateDraft('department', event.target.value)} aria-invalid={Boolean(errors.department)}><option value="">Auswählen</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select>{errors.department && <small className="field-error">{errors.department}</small>}</label><Field label="Telefon" name="contact-phone" value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} type="tel" /><Field label="Mobil" name="contact-mobile" value={draft.mobile} onChange={(event) => updateDraft('mobile', event.target.value)} type="tel" /><Field label="E-Mail" name="contact-email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} error={errors.email} type="email" />{draft.department === 'Sonstiges' && <Field className="contact-editor__wide" label="Abteilung ergänzen" name="contact-department-other" value={draft.departmentOther} onChange={(event) => updateDraft('departmentOther', event.target.value)} />}</div><div className="form-actions"><button className="button" type="button" onClick={saveDraft}>Ansprechpartner übernehmen</button></div></div>}
    </section>
  )
}

function PortalsSection({ portals, onChange }) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(null)
  const [errors, setErrors] = useState({})
  const [visiblePasswords, setVisiblePasswords] = useState({})

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function saveDraft() {
    const nextErrors = {}
    if (!draft.name.trim()) nextErrors.name = 'Portalname ist erforderlich.'
    if (draft.url.trim() && !validateWebsite(draft.url)) nextErrors.url = 'Bitte eine vollständige Link-Adresse eingeben.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const exists = portals.some((portal) => portal.id === draft.id)
    onChange(exists ? portals.map((portal) => portal.id === draft.id ? draft : portal) : [...portals, draft])
    setDraft(null)
  }

  function removePortal(portalId) {
    onChange(portals.filter((portal) => portal.id !== portalId))
    if (draft?.id === portalId) setDraft(null)
  }

  return (
    <section className="form-section portals-section">
      <div className="portals-section__header">
        <div><h2>Portale &amp; Zugänge</h2><p>Optionale Zugänge für diesen Geschäftspartner</p></div>
        <button className="button button--secondary" type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>{expanded ? 'Schließen' : `Zugänge${portals.length ? ` (${portals.length})` : ''}`}</button>
      </div>
      {expanded && <div className="portals-section__content">
        <div className="portals-section__actions"><button className="button button--secondary" type="button" onClick={() => { setErrors({}); setDraft(createPortal()) }}>Zugang hinzufügen</button></div>
        <div className="portals-table table-frame"><table><thead><tr><th>Portal</th><th>Link</th><th>Benutzer / E-Mail</th><th>Passwort</th><th>Zweck</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{portals.length ? portals.map((portal) => <tr key={portal.id}><td><strong>{portal.name}</strong></td><td>{portal.url ? <a className="portal-link" href={portal.url} target="_blank" rel="noreferrer">Öffnen</a> : '—'}</td><td>{portal.username || '—'}</td><td><div className="portal-password"><span>{visiblePasswords[portal.id] ? (portal.password || '—') : portal.password ? '••••••••' : '—'}</span>{portal.password && <button type="button" onClick={() => setVisiblePasswords((current) => ({ ...current, [portal.id]: !current[portal.id] }))}>{visiblePasswords[portal.id] ? 'Ausblenden' : 'Anzeigen'}</button>}</div></td><td>{portal.purpose || '—'}</td><td><div className="contact-actions"><button type="button" onClick={() => { setErrors({}); setDraft({ ...portal }) }}>Bearbeiten</button><button type="button" onClick={() => removePortal(portal.id)}>Entfernen</button></div></td></tr>) : <tr><td className="table-state" colSpan="6">Noch keine Zugänge erfasst.</td></tr>}</tbody></table></div>
        {draft && <div className="portal-editor"><div className="contact-editor__header"><h3>{portals.some((portal) => portal.id === draft.id) ? 'Zugang bearbeiten' : 'Zugang hinzufügen'}</h3><button className="button button--secondary" type="button" onClick={() => setDraft(null)}>Abbrechen</button></div><div className="portal-editor__grid"><Field label="Portalname *" name="portal-name" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} error={errors.name} /><Field label="Link" name="portal-url" value={draft.url} onChange={(event) => updateDraft('url', event.target.value)} error={errors.url} placeholder="https://" /><Field label="Benutzer / E-Mail" name="portal-username" value={draft.username} onChange={(event) => updateDraft('username', event.target.value)} autoComplete="username" /><label className="form-field"><span>Passwort</span><div className="password-input"><input name="portal-password" value={draft.password} onChange={(event) => updateDraft('password', event.target.value)} type={visiblePasswords[draft.id] ? 'text' : 'password'} autoComplete="new-password" /><button type="button" onClick={() => setVisiblePasswords((current) => ({ ...current, [draft.id]: !current[draft.id] }))}>{visiblePasswords[draft.id] ? 'Ausblenden' : 'Anzeigen'}</button></div></label><Field className="portal-editor__wide" label="Zweck" name="portal-purpose" value={draft.purpose} onChange={(event) => updateDraft('purpose', event.target.value)} /></div><div className="form-actions"><button className="button" type="button" onClick={saveDraft}>Zugang übernehmen</button></div></div>}
      </div>}
    </section>
  )
}

export default function BusinessPartnerForm({ initialValue, onSubmit, onDirtyChange, onFormChange, formId }) {
  const [form, setForm] = useState(() => normalizeForm(initialValue))
  const [savedForm, setSavedForm] = useState(() => normalizeForm(initialValue))
  const [contactDraft, setContactDraft] = useState(null)
  const [errors, setErrors] = useState({})

  function updateForm(nextForm) {
    setForm(nextForm)
    onFormChange?.(nextForm)
    onDirtyChange?.(JSON.stringify(nextForm) !== JSON.stringify(savedForm))
  }

  function handleChange(event) {
    const { name, value } = event.target
    const [group, field] = name.split('.')
    const normalizedValue = name === 'creditNoteProcedure' ? value === 'true' : value
    const nextForm = field ? { ...form, [group]: { ...form[group], [field]: normalizedValue } } : { ...form, [name]: normalizedValue }
    updateForm(nextForm)
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  function updateContacts(contacts) {
    updateForm({ ...form, contacts })
    setErrors((current) => ({ ...current, contacts: undefined }))
  }

  function updatePortals(portals) {
    updateForm({ ...form, portals })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!form.companyName.trim()) nextErrors.companyName = 'Firmenname ist erforderlich.'
    if (!form.debtorNumber.trim() && !form.creditorNumber.trim()) nextErrors.references = 'Mindestens eine Debitoren- oder Kreditorennummer ist erforderlich.'
    if (form.contact.email.trim() && !validateEmail(form.contact.email)) nextErrors['contact.email'] = 'Bitte eine gültige E-Mail-Adresse eingeben.'
    if (form.contact.website.trim() && !validateWebsite(form.contact.website)) nextErrors['contact.website'] = 'Bitte eine vollständige Website-Adresse eingeben.'
    if (form.paymentTermDays !== '' && (!Number.isInteger(Number(form.paymentTermDays)) || Number(form.paymentTermDays) < 0)) nextErrors.paymentTermDays = 'Bitte volle Tage ab 0 eingeben.'
    if (form.contacts.some((contact) => !contact.name.trim() || !contact.department || (contact.email.trim() && !validateEmail(contact.email)))) nextErrors.contacts = 'Bitte die Ansprechpartnerangaben prüfen.'
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
      <FormSection title="Unternehmen & Anschrift" className="form-grid--company-address">
        <Field className="form-field--company-address" label="Firmenname *" name="companyName" value={form.companyName} onChange={handleChange} error={errors.companyName} />
        <label className="form-field form-field--status"><span>Status</span><select name="status" value={form.status} onChange={handleChange}><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></select></label>
        <Field className="form-field--street" label="Straße" name="address.street" value={form.address.street} onChange={handleChange} />
        <Field label="Hausnummer" name="address.houseNumber" value={form.address.houseNumber} onChange={handleChange} />
        <Field label="PLZ" name="address.postalCode" value={form.address.postalCode} onChange={handleChange} />
        <Field label="Ort" name="address.city" value={form.address.city} onChange={handleChange} />
        <Field label="Land" name="address.country" value={form.address.country} onChange={handleChange} />
      </FormSection>

      <FormSection title="Referenzen & Nummern" className="form-grid--references">
        <Field label="Debitorennummer" name="debtorNumber" value={form.debtorNumber} onChange={handleChange} placeholder="DyCoS-Referenz" />
        <Field label="Kreditorennummer" name="creditorNumber" value={form.creditorNumber} onChange={handleChange} placeholder="DyCoS-Referenz" />
        <Field label="TIMOCOM-Nummer" name="timocomNumber" value={form.timocomNumber} onChange={handleChange} />
        <Field label="Trans.eu-Nummer" name="transeuNumber" value={form.transeuNumber} onChange={handleChange} />
        {errors.references && <p className="form-error form-grid__wide">{errors.references}</p>}
      </FormSection>

      <FormSection title="Allgemeiner Kontakt" className="form-grid--contact">
        <Field label="Telefon" name="contact.phone" value={form.contact.phone} onChange={handleChange} type="tel" />
        <Field label="Fax" name="contact.fax" value={form.contact.fax} onChange={handleChange} type="tel" />
        <Field label="E-Mail" name="contact.email" value={form.contact.email} onChange={handleChange} error={errors['contact.email']} type="email" />
        <Field label="Website" name="contact.website" value={form.contact.website} onChange={handleChange} error={errors['contact.website']} placeholder="https://" />
      </FormSection>

      <FormSection title="Unternehmensdaten" className="form-grid--company-data">
        <Field label="USt-IdNr." name="companyData.vatId" value={form.companyData.vatId} onChange={handleChange} />
        <Field label="Handelsregisternummer" name="companyData.commercialRegisterNumber" value={form.companyData.commercialRegisterNumber} onChange={handleChange} />
        <Field label="Registergericht" name="companyData.registerCourt" value={form.companyData.registerCourt} onChange={handleChange} />
      </FormSection>

      <FormSection title="Abrechnung" className="form-grid--billing">
        <Field label="Zahlungsziel in Tagen" name="paymentTermDays" value={form.paymentTermDays} onChange={handleChange} error={errors.paymentTermDays} type="number" placeholder="z. B. 30" />
        <label className="form-field"><span>Gutschriftverfahren</span><select name="creditNoteProcedure" value={String(form.creditNoteProcedure)} onChange={handleChange}><option value="false">Nein</option><option value="true">Ja</option></select></label>
      </FormSection>

      <ContactsSection contacts={form.contacts} onChange={updateContacts} draft={contactDraft} onDraftChange={setContactDraft} />
      {errors.contacts && <p className="form-error">{errors.contacts}</p>}
      <PortalsSection portals={form.portals} onChange={updatePortals} />
    </form>
  )
}
