import { useState } from 'react'
import { CheckIcon, CloseIcon, EditIcon, EyeIcon, EyeOffIcon, TrashIcon } from '../icons.jsx'
import { BUSINESS_PARTNER_STATUSES, createEmptyBusinessPartner } from '../../lib/businessPartners.js'
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

function portalNameFromUrl(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function ContactsSection({ contacts, onChange, draft, onDraftChange }) {
  const [editErrors, setEditErrors] = useState({})
  const [newContact, setNewContact] = useState(createContact)
  const [newErrors, setNewErrors] = useState({})

  function startEdit(contact) {
    setEditErrors({})
    onDraftChange({ ...contact, departmentOther: contact.departmentOther ?? '' })
  }

  function updateDraft(field, value) {
    onDraftChange({ ...draft, [field]: value })
    setEditErrors((current) => ({ ...current, [field]: undefined }))
  }

  function saveDraft() {
    const nextErrors = {}
    if (!draft.name.trim()) nextErrors.name = 'Name ist erforderlich.'
    if (!draft.department) nextErrors.department = 'Abteilung ist erforderlich.'
    if (draft.email.trim() && !validateEmail(draft.email)) nextErrors.email = 'Bitte eine gültige E-Mail-Adresse eingeben.'
    setEditErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    onChange(contacts.map((contact) => contact.id === draft.id ? draft : contact))
    onDraftChange(null)
  }

  function updateNewContact(field, value) {
    setNewContact((current) => ({ ...current, [field]: value }))
    setNewErrors((current) => ({ ...current, [field]: undefined }))
  }

  function resetNewContact() {
    setNewContact(createContact())
    setNewErrors({})
  }

  function saveNewContact() {
    const nextErrors = {}
    if (!newContact.name.trim()) nextErrors.name = 'Name ist erforderlich.'
    if (!newContact.department) nextErrors.department = 'Abteilung ist erforderlich.'
    if (newContact.email.trim() && !validateEmail(newContact.email)) nextErrors.email = 'Bitte eine gültige E-Mail-Adresse eingeben.'
    setNewErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    onChange([...contacts, newContact])
    resetNewContact()
  }

  function removeContact(contactId) {
    onChange(contacts.filter((contact) => contact.id !== contactId))
    if (draft?.id === contactId) onDraftChange(null)
  }

  return (
    <section className="form-section contacts-section">
      <div className="contacts-section__header"><h2>Ansprechpartner</h2></div>
      <div className="contacts-table table-frame"><table><thead><tr><th>Name</th><th>Abteilung</th><th>Telefon</th><th>Mobil</th><th>E-Mail</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{contacts.length ? contacts.map((contact) => {
        const isEditing = draft?.id === contact.id
        return <tr key={contact.id} className={isEditing ? 'contacts-table__row--editing' : ''}>
          <td>{isEditing ? <input aria-label="Name" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} aria-invalid={Boolean(editErrors.name)} title={editErrors.name} /> : <strong>{contact.name}</strong>}</td>
          <td>{isEditing ? <select aria-label="Abteilung" value={draft.department} onChange={(event) => updateDraft('department', event.target.value)} aria-invalid={Boolean(editErrors.department)} title={editErrors.department}><option value="">Auswählen</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select> : displayDepartment(contact)}</td>
          <td>{isEditing ? <input aria-label="Telefon" type="tel" value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} /> : contact.phone || '—'}</td>
          <td>{isEditing ? <input aria-label="Mobil" type="tel" value={draft.mobile} onChange={(event) => updateDraft('mobile', event.target.value)} /> : contact.mobile || '—'}</td>
          <td>{isEditing ? <input aria-label="E-Mail" type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} aria-invalid={Boolean(editErrors.email)} title={editErrors.email} /> : contact.email || '—'}</td>
          <td className="contacts-table__action"><div className="contact-actions contact-actions--icons">{isEditing ? <><button className="contact-actions__save" type="button" onClick={saveDraft} title="Speichern" aria-label="Ansprechpartner speichern"><CheckIcon /></button><button type="button" onClick={() => onDraftChange(null)} title="Abbrechen" aria-label="Bearbeitung abbrechen"><CloseIcon /></button></> : <><button type="button" onClick={() => startEdit(contact)} title="Bearbeiten" aria-label="Ansprechpartner bearbeiten"><EditIcon /></button><button type="button" onClick={() => removeContact(contact.id)} title="Entfernen" aria-label="Ansprechpartner entfernen"><TrashIcon /></button></>}</div></td>
        </tr>
      }) : null}<tr className="contacts-table__row--new"><td><input aria-label="Name des neuen Ansprechpartners" value={newContact.name} onChange={(event) => updateNewContact('name', event.target.value)} aria-invalid={Boolean(newErrors.name)} title={newErrors.name} /></td><td><select aria-label="Abteilung des neuen Ansprechpartners" value={newContact.department} onChange={(event) => updateNewContact('department', event.target.value)} aria-invalid={Boolean(newErrors.department)} title={newErrors.department}><option value="">Auswählen</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></td><td><input aria-label="Telefon des neuen Ansprechpartners" type="tel" value={newContact.phone} onChange={(event) => updateNewContact('phone', event.target.value)} /></td><td><input aria-label="Mobil des neuen Ansprechpartners" type="tel" value={newContact.mobile} onChange={(event) => updateNewContact('mobile', event.target.value)} /></td><td><input aria-label="E-Mail des neuen Ansprechpartners" type="email" value={newContact.email} onChange={(event) => updateNewContact('email', event.target.value)} aria-invalid={Boolean(newErrors.email)} title={newErrors.email} /></td><td className="contacts-table__action"><div className="contact-actions contact-actions--icons"><button className="contact-actions__save" type="button" onClick={saveNewContact} title="Speichern" aria-label="Neuen Ansprechpartner speichern"><CheckIcon /></button><button type="button" onClick={resetNewContact} title="Eingaben zurücksetzen" aria-label="Neue Ansprechpartner-Eingaben zurücksetzen"><CloseIcon /></button></div></td></tr></tbody></table></div>
    </section>
  )
}

function PortalsSection({ portals, onChange }) {
  const [editDraft, setEditDraft] = useState(null)
  const [editErrors, setEditErrors] = useState({})
  const [newPortal, setNewPortal] = useState(createPortal)
  const [newErrors, setNewErrors] = useState({})
  const [visiblePasswords, setVisiblePasswords] = useState({})

  function togglePassword(id) {
    setVisiblePasswords((current) => ({ ...current, [id]: !current[id] }))
  }

  function startEdit(portal) {
    setEditErrors({})
    setEditDraft({ ...portal })
  }

  function updateEditDraft(field, value) {
    setEditDraft((current) => ({ ...current, [field]: value }))
    setEditErrors((current) => ({ ...current, [field]: undefined }))
  }

  function saveEditDraft() {
    const nextErrors = {}
    if (!editDraft.url.trim()) nextErrors.url = 'Link ist erforderlich.'
    else if (!validateWebsite(editDraft.url)) nextErrors.url = 'Bitte eine vollständige Link-Adresse eingeben.'
    setEditErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    onChange(portals.map((portal) => portal.id === editDraft.id ? editDraft : portal))
    setEditDraft(null)
  }

  function updateNewPortal(field, value) {
    setNewPortal((current) => ({ ...current, [field]: value }))
    setNewErrors((current) => ({ ...current, [field]: undefined }))
  }

  function resetNewPortal() {
    setNewPortal(createPortal())
    setNewErrors({})
    setVisiblePasswords((current) => ({ ...current, new: false }))
  }

  function saveNewPortal() {
    const nextErrors = {}
    if (!newPortal.url.trim()) nextErrors.url = 'Link ist erforderlich.'
    else if (!validateWebsite(newPortal.url)) nextErrors.url = 'Bitte eine vollständige Link-Adresse eingeben.'
    setNewErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    onChange([...portals, { ...newPortal, name: portalNameFromUrl(newPortal.url) || newPortal.name }])
    resetNewPortal()
  }

  function removePortal(portalId) {
    onChange(portals.filter((portal) => portal.id !== portalId))
    if (editDraft?.id === portalId) setEditDraft(null)
  }

  return (
    <section className="form-section portals-section">
      <h2>Zugänge auf Kundenportalen</h2>
      <div className="portals-table table-frame"><table><thead><tr><th>Link</th><th>Benutzer / Mail</th><th>Kennwort</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{portals.length ? portals.map((portal) => {
        const isEditing = editDraft?.id === portal.id
        return <tr key={portal.id} className={isEditing ? 'portals-table__row--editing' : ''}>
          <td>{isEditing ? <input aria-label="Link" value={editDraft.url} onChange={(event) => updateEditDraft('url', event.target.value)} aria-invalid={Boolean(editErrors.url)} title={editErrors.url} placeholder="https://" /> : portal.url ? <a className="portal-link" href={portal.url} target="_blank" rel="noreferrer">{portal.url}</a> : '—'}</td>
          <td>{isEditing ? <input aria-label="Benutzer oder Mail" value={editDraft.username} onChange={(event) => updateEditDraft('username', event.target.value)} autoComplete="username" /> : portal.username || '—'}</td>
          <td>{isEditing ? <div className="portal-password"><input aria-label="Kennwort" value={editDraft.password} onChange={(event) => updateEditDraft('password', event.target.value)} type={visiblePasswords[portal.id] ? 'text' : 'password'} autoComplete="new-password" /><button className="portal-password__toggle" type="button" onClick={() => togglePassword(portal.id)} title={visiblePasswords[portal.id] ? 'Kennwort ausblenden' : 'Kennwort anzeigen'} aria-label={visiblePasswords[portal.id] ? 'Kennwort ausblenden' : 'Kennwort anzeigen'}>{visiblePasswords[portal.id] ? <EyeOffIcon /> : <EyeIcon />}</button></div> : <div className="portal-password"><span>{visiblePasswords[portal.id] ? (portal.password || '—') : portal.password ? '••••••••' : '—'}</span>{portal.password && <button className="portal-password__toggle" type="button" onClick={() => togglePassword(portal.id)} title={visiblePasswords[portal.id] ? 'Kennwort ausblenden' : 'Kennwort anzeigen'} aria-label={visiblePasswords[portal.id] ? 'Kennwort ausblenden' : 'Kennwort anzeigen'}>{visiblePasswords[portal.id] ? <EyeOffIcon /> : <EyeIcon />}</button>}</div>}</td>
          <td className="portals-table__action"><div className="contact-actions contact-actions--icons">{isEditing ? <><button className="contact-actions__save" type="button" onClick={saveEditDraft} title="Speichern" aria-label="Zugang speichern"><CheckIcon /></button><button type="button" onClick={() => setEditDraft(null)} title="Abbrechen" aria-label="Bearbeitung abbrechen"><CloseIcon /></button></> : <><button type="button" onClick={() => startEdit(portal)} title="Bearbeiten" aria-label="Zugang bearbeiten"><EditIcon /></button><button type="button" onClick={() => removePortal(portal.id)} title="Entfernen" aria-label="Zugang entfernen"><TrashIcon /></button></>}</div></td>
        </tr>
      }) : null}<tr className="portals-table__row--new"><td><input aria-label="Link des neuen Zugangs" value={newPortal.url} onChange={(event) => updateNewPortal('url', event.target.value)} aria-invalid={Boolean(newErrors.url)} title={newErrors.url} placeholder="https://" /></td><td><input aria-label="Benutzer oder Mail des neuen Zugangs" value={newPortal.username} onChange={(event) => updateNewPortal('username', event.target.value)} autoComplete="username" /></td><td><div className="portal-password"><input aria-label="Kennwort des neuen Zugangs" value={newPortal.password} onChange={(event) => updateNewPortal('password', event.target.value)} type={visiblePasswords.new ? 'text' : 'password'} autoComplete="new-password" /><button className="portal-password__toggle" type="button" onClick={() => togglePassword('new')} title={visiblePasswords.new ? 'Kennwort ausblenden' : 'Kennwort anzeigen'} aria-label={visiblePasswords.new ? 'Kennwort ausblenden' : 'Kennwort anzeigen'}>{visiblePasswords.new ? <EyeOffIcon /> : <EyeIcon />}</button></div></td><td className="portals-table__action"><div className="contact-actions contact-actions--icons"><button className="contact-actions__save" type="button" onClick={saveNewPortal} title="Speichern" aria-label="Neuen Zugang speichern"><CheckIcon /></button><button type="button" onClick={resetNewPortal} title="Eingaben zurücksetzen" aria-label="Neue Zugangseingaben zurücksetzen"><CloseIcon /></button></div></td></tr></tbody></table></div>
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
        <label className="form-field form-field--status"><span>Status</span><select name="status" value={form.status} onChange={handleChange}>{BUSINESS_PARTNER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        <Field className="form-field--street" label="Straße" name="address.street" value={form.address.street} onChange={handleChange} />
        <Field label="Hausnummer" name="address.houseNumber" value={form.address.houseNumber} onChange={handleChange} />
        <Field label="PLZ" name="address.postalCode" value={form.address.postalCode} onChange={handleChange} />
        <Field label="Ort" name="address.city" value={form.address.city} onChange={handleChange} />
        <Field label="Land" name="address.country" value={form.address.country} onChange={handleChange} />
      </FormSection>

      <div className="masterdata-half-grid">
        <FormSection title="Referenzen & Nummern" className="form-grid--references">
          <Field label="Debitorennummer" name="debtorNumber" value={form.debtorNumber} onChange={handleChange} placeholder="DyCoS-Referenz" />
          <Field label="Kreditorennummer" name="creditorNumber" value={form.creditorNumber} onChange={handleChange} placeholder="DyCoS-Referenz" />
          <Field label="TIMOCOM-Nummer" name="timocomNumber" value={form.timocomNumber} onChange={handleChange} />
          <Field label="Trans.eu-Nummer" name="transeuNumber" value={form.transeuNumber} onChange={handleChange} />
          {errors.references && <p className="form-error form-grid__wide">{errors.references}</p>}
        </FormSection>

        <FormSection title="Allgemeiner Kontakt" className="form-grid--contact">
          <Field className="form-field--contact-phone" label="Telefon" name="contact.phone" value={form.contact.phone} onChange={handleChange} type="tel" />
          <Field className="form-field--contact-fax" label="Fax" name="contact.fax" value={form.contact.fax} onChange={handleChange} type="tel" />
          <Field className="form-field--contact-email" label="E-Mail" name="contact.email" value={form.contact.email} onChange={handleChange} error={errors['contact.email']} type="email" />
          <Field className="form-field--contact-website" label="Website" name="contact.website" value={form.contact.website} onChange={handleChange} error={errors['contact.website']} placeholder="https://" />
        </FormSection>

        <FormSection title="Unternehmensdaten" className="form-grid--company-data">
          <Field className="form-field--company-vat" label="USt-IdNr." name="companyData.vatId" value={form.companyData.vatId} onChange={handleChange} />
          <Field className="form-field--company-tax" label="Steuernummer" name="companyData.taxNumber" value={form.companyData.taxNumber} onChange={handleChange} />
          <Field className="form-field--company-register-number" label="Handelsregisternummer" name="companyData.commercialRegisterNumber" value={form.companyData.commercialRegisterNumber} onChange={handleChange} />
          <Field className="form-field--company-register-court" label="Registergericht" name="companyData.registerCourt" value={form.companyData.registerCourt} onChange={handleChange} />
        </FormSection>

        <FormSection title="Abrechnung" className="form-grid--billing">
          <Field label="Zahlungsziel in Tagen" name="paymentTermDays" value={form.paymentTermDays} onChange={handleChange} error={errors.paymentTermDays} type="number" placeholder="z. B. 30" />
          <label className="form-field"><span>Gutschriftverfahren</span><select name="creditNoteProcedure" value={String(form.creditNoteProcedure)} onChange={handleChange}><option value="false">Nein</option><option value="true">Ja</option></select></label>
        </FormSection>
      </div>

      <ContactsSection contacts={form.contacts} onChange={updateContacts} draft={contactDraft} onDraftChange={setContactDraft} />
      {errors.contacts && <p className="form-error">{errors.contacts}</p>}
      <PortalsSection portals={form.portals} onChange={updatePortals} />
    </form>
  )
}
