import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, CloseIcon, CopyIcon, EditIcon, TrashIcon } from '../icons.jsx'
import { BUSINESS_PARTNER_STATUSES, createEmptyBusinessPartner, normalizePartnerPortal } from '../../lib/businessPartners.js'
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

function createPartnerPortal() {
  return { id: `portal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: '', url: '', username: '', accessNumber: '', purpose: '' }
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
    portals: (value?.portals ?? []).map((portal) => ({ ...createPartnerPortal(), ...normalizePartnerPortal(portal) })),
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

const masterDataSections = {
  company: { title: 'Unternehmen & Anschrift', className: 'form-grid--company-address' },
  contact: { title: 'Allgemeiner Kontakt', className: 'form-grid--contact' },
  references: { title: 'Referenzen & Nummern', className: 'form-grid--references' },
  companyData: { title: 'Unternehmensdaten', className: 'form-grid--company-data' },
  billing: { title: 'Abrechnung', className: 'form-grid--billing' },
}

function statusLabel(value) {
  return BUSINESS_PARTNER_STATUSES.find((status) => status.value === value)?.label ?? '—'
}

async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const temporaryInput = document.createElement('textarea')
  temporaryInput.value = value
  temporaryInput.setAttribute('readonly', '')
  temporaryInput.style.position = 'fixed'
  temporaryInput.style.opacity = '0'
  document.body.appendChild(temporaryInput)
  temporaryInput.select()
  document.execCommand('copy')
  temporaryInput.remove()
}

function CopyValueButton({ value, label }) {
  const [copied, setCopied] = useState(false)

  async function copyValue() {
    try {
      await copyToClipboard(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    copyValue()
  }

  return <span className="copy-email-button" role="button" tabIndex="0" onClick={copyValue} onKeyDown={handleKeyDown} title={copied ? 'Kopiert' : `${label} kopieren`} aria-label={copied ? `${label} kopiert` : `${label} kopieren`}><CopyIcon /></span>
}

function ReadOnlyField({ label, value, className = '', status, copyable = false }) {
  const displayValue = value === '' || value === null || value === undefined ? '—' : value
  const hasCopyAction = copyable && displayValue !== '—'
  return <div className={`masterdata-readonly-field ${className}`}><dt>{label}</dt><dd className={status ? `masterdata-readonly-field__value masterdata-readonly-field__value--status masterdata-readonly-field__value--status-${status}` : `masterdata-readonly-field__value${hasCopyAction ? ' masterdata-readonly-field__value--copyable' : ''}`}><span>{displayValue}</span>{hasCopyAction && <CopyValueButton value={displayValue} label={label} />}</dd></div>
}

function ReadOnlySection({ section, form, onEdit }) {
  const { title, className } = masterDataSections[section]
  let fields

  if (section === 'company') fields = <><ReadOnlyField className="form-field--company-address" label="Firmenname" value={form.companyName} /><ReadOnlyField className="form-field--status" label="Status" value={statusLabel(form.status)} status={form.status} /><ReadOnlyField className="form-field--street" label="Straße" value={form.address.street} /><ReadOnlyField className="form-field--house-number" label="Hausnummer" value={form.address.houseNumber} /><ReadOnlyField className="form-field--postal-code" label="PLZ" value={form.address.postalCode} /><ReadOnlyField className="form-field--city" label="Ort" value={form.address.city} /><ReadOnlyField className="form-field--country" label="Land" value={form.address.country} /></>
  if (section === 'contact') fields = <><ReadOnlyField className="form-field--contact-phone" label="Telefon" value={form.contact.phone} /><ReadOnlyField className="form-field--contact-fax" label="Fax" value={form.contact.fax} /><ReadOnlyField className="form-field--contact-email" label="E-Mail" value={form.contact.email} copyable /><ReadOnlyField className="form-field--contact-website" label="Website" value={form.contact.website} /></>
  if (section === 'references') fields = <><ReadOnlyField label="Debitorennummer" value={form.debtorNumber} copyable /><ReadOnlyField label="Kreditorennummer" value={form.creditorNumber} copyable /><ReadOnlyField label="TIMOCOM-Nummer" value={form.timocomNumber} copyable /><ReadOnlyField label="Trans.eu-Nummer" value={form.transeuNumber} copyable /><ReadOnlyField label="DPL-Nummer" value={form.dplNumber} copyable /><ReadOnlyField label="Paki-Nummer" value={form.pakiNumber} copyable /></>
  if (section === 'companyData') fields = <><ReadOnlyField className="form-field--company-vat" label="USt-IdNr." value={form.companyData.vatId} /><ReadOnlyField className="form-field--company-tax" label="Steuernummer" value={form.companyData.taxNumber} /><ReadOnlyField className="form-field--company-register-number" label="Handelsregisternummer" value={form.companyData.commercialRegisterNumber} /><ReadOnlyField className="form-field--company-register-court" label="Registergericht" value={form.companyData.registerCourt} /></>
  if (section === 'billing') fields = <><ReadOnlyField label="Zahlungsziel in Tagen" value={form.paymentTermDays} /><ReadOnlyField label="Gutschriftverfahren" value={form.creditNoteProcedure ? 'Ja' : 'Nein'} /></>

  return <section className="form-section masterdata-readonly-section"><div className="masterdata-readonly-section__header"><h2>{title}</h2>{onEdit && <button className="masterdata-readonly-section__edit" type="button" onClick={onEdit} title={`${title} bearbeiten`} aria-label={`${title} bearbeiten`}><EditIcon /></button>}</div><dl className={`form-grid masterdata-readonly-grid ${className}`}>{fields}</dl></section>
}

function MasterDataFields({ section, form, onChange, errors }) {
  if (section === 'company') return <><Field className="form-field--company-address" label="Firmenname *" name="companyName" value={form.companyName} onChange={onChange} error={errors.companyName} /><label className={`form-field form-field--status form-field--status-${form.status}`}><span>Status</span><select name="status" value={form.status} onChange={onChange}>{BUSINESS_PARTNER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label><Field className="form-field--street" label="Straße" name="address.street" value={form.address.street} onChange={onChange} /><Field label="Hausnummer" name="address.houseNumber" value={form.address.houseNumber} onChange={onChange} /><Field label="PLZ" name="address.postalCode" value={form.address.postalCode} onChange={onChange} /><Field label="Ort" name="address.city" value={form.address.city} onChange={onChange} /><Field label="Land" name="address.country" value={form.address.country} onChange={onChange} /></>
  if (section === 'contact') return <><Field className="form-field--contact-phone" label="Telefon" name="contact.phone" value={form.contact.phone} onChange={onChange} type="tel" /><Field className="form-field--contact-fax" label="Fax" name="contact.fax" value={form.contact.fax} onChange={onChange} type="tel" /><Field className="form-field--contact-email" label="E-Mail" name="contact.email" value={form.contact.email} onChange={onChange} error={errors['contact.email']} type="email" /><Field className="form-field--contact-website" label="Website" name="contact.website" value={form.contact.website} onChange={onChange} error={errors['contact.website']} placeholder="https://" /></>
  if (section === 'references') return <><Field label="Debitorennummer" name="debtorNumber" value={form.debtorNumber} onChange={onChange} placeholder="DyCoS-Referenz" /><Field label="Kreditorennummer" name="creditorNumber" value={form.creditorNumber} onChange={onChange} placeholder="DyCoS-Referenz" /><Field label="TIMOCOM-Nummer" name="timocomNumber" value={form.timocomNumber} onChange={onChange} /><Field label="Trans.eu-Nummer" name="transeuNumber" value={form.transeuNumber} onChange={onChange} /><Field label="DPL-Nummer" name="dplNumber" value={form.dplNumber} onChange={onChange} /><Field label="Paki-Nummer" name="pakiNumber" value={form.pakiNumber} onChange={onChange} />{errors.references && <p className="form-error form-grid__wide">{errors.references}</p>}</>
  if (section === 'companyData') return <><Field className="form-field--company-vat" label="USt-IdNr." name="companyData.vatId" value={form.companyData.vatId} onChange={onChange} /><Field className="form-field--company-tax" label="Steuernummer" name="companyData.taxNumber" value={form.companyData.taxNumber} onChange={onChange} /><Field className="form-field--company-register-number" label="Handelsregisternummer" name="companyData.commercialRegisterNumber" value={form.companyData.commercialRegisterNumber} onChange={onChange} /><Field className="form-field--company-register-court" label="Registergericht" name="companyData.registerCourt" value={form.companyData.registerCourt} onChange={onChange} /></>
  return <><Field label="Zahlungsziel in Tagen" name="paymentTermDays" value={form.paymentTermDays} onChange={onChange} error={errors.paymentTermDays} type="number" placeholder="z. B. 30" /><label className="form-field"><span>Gutschriftverfahren</span><select name="creditNoteProcedure" value={String(form.creditNoteProcedure)} onChange={onChange}><option value="false">Nein</option><option value="true">Ja</option></select></label></>
}

function MasterDataEditModal({ section, form, errors, onChange, onClose, onApply, saving }) {
  const { title, className } = masterDataSections[section]
  return createPortal(<div className="masterdata-edit-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}><section className="masterdata-edit-modal" role="dialog" aria-modal="true" aria-labelledby="masterdata-edit-modal-title"><div className="masterdata-edit-modal__heading"><h2 id="masterdata-edit-modal-title">{title} bearbeiten</h2><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={saving}><CloseIcon /></button></div><div className={`form-grid masterdata-edit-modal__fields ${className}`}><MasterDataFields section={section} form={form} onChange={onChange} errors={errors} /></div><div className="masterdata-edit-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}>Abbrechen</button><button className="button" type="button" onClick={onApply} disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div></section></div>, document.body)
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

function ContactsSection({ contacts, onChange, draft, onDraftChange, saving }) {
  const [editErrors, setEditErrors] = useState({})
  const [newContact, setNewContact] = useState(createContact)
  const [newErrors, setNewErrors] = useState({})
  const [adding, setAdding] = useState(false)

  function startEdit(contact) {
    setEditErrors({})
    onDraftChange({ ...contact, departmentOther: contact.departmentOther ?? '' })
  }

  function updateDraft(field, value) {
    onDraftChange({ ...draft, [field]: value })
    setEditErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function saveDraft() {
    const nextErrors = {}
    if (!draft.name.trim()) nextErrors.name = 'Name ist erforderlich.'
    if (!draft.department) nextErrors.department = 'Abteilung ist erforderlich.'
    if (draft.email.trim() && !validateEmail(draft.email)) nextErrors.email = 'Bitte eine gültige E-Mail-Adresse eingeben.'
    setEditErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const saved = await onChange(contacts.map((contact) => contact.id === draft.id ? draft : contact))
    if (saved) onDraftChange(null)
  }

  function updateNewContact(field, value) {
    setNewContact((current) => ({ ...current, [field]: value }))
    setNewErrors((current) => ({ ...current, [field]: undefined }))
  }

  function resetNewContact() {
    setNewContact(createContact())
    setNewErrors({})
  }

  function startNewContact() {
    resetNewContact()
    setAdding(true)
  }

  function cancelNewContact() {
    resetNewContact()
    setAdding(false)
  }

  async function saveNewContact() {
    const nextErrors = {}
    if (!newContact.name.trim()) nextErrors.name = 'Name ist erforderlich.'
    if (!newContact.department) nextErrors.department = 'Abteilung ist erforderlich.'
    if (newContact.email.trim() && !validateEmail(newContact.email)) nextErrors.email = 'Bitte eine gültige E-Mail-Adresse eingeben.'
    setNewErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const saved = await onChange([...contacts, newContact])
    if (saved) {
      resetNewContact()
      setAdding(false)
    }
  }

  async function removeContact(contactId) {
    const saved = await onChange(contacts.filter((contact) => contact.id !== contactId))
    if (saved && draft?.id === contactId) onDraftChange(null)
  }

  return (
    <section className="form-section contacts-section">
      <div className="contacts-section__header"><h2>Ansprechpartner</h2>{!adding && <button className="button button--secondary" type="button" onClick={startNewContact} disabled={saving}>Hinzufügen</button>}</div>
      <div className="contacts-table table-frame"><table className="data-table"><thead><tr><th>Name</th><th>Abteilung</th><th>Telefon</th><th>Mobil</th><th>E-Mail</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{contacts.length ? contacts.map((contact) => {
        const isEditing = draft?.id === contact.id
        return <tr key={contact.id} className={isEditing ? 'contacts-table__row--editing' : ''}>
          <td>{isEditing ? <input aria-label="Name" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} aria-invalid={Boolean(editErrors.name)} title={editErrors.name} /> : <strong>{contact.name}</strong>}</td>
          <td>{isEditing ? <select aria-label="Abteilung" value={draft.department} onChange={(event) => updateDraft('department', event.target.value)} aria-invalid={Boolean(editErrors.department)} title={editErrors.department}><option value="">Auswählen</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select> : displayDepartment(contact)}</td>
          <td>{isEditing ? <input aria-label="Telefon" type="tel" value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} /> : contact.phone || '—'}</td>
          <td>{isEditing ? <input aria-label="Mobil" type="tel" value={draft.mobile} onChange={(event) => updateDraft('mobile', event.target.value)} /> : contact.mobile || '—'}</td>
          <td>{isEditing ? <input aria-label="E-Mail" type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} aria-invalid={Boolean(editErrors.email)} title={editErrors.email} /> : contact.email ? <span className="copy-email-value"><span>{contact.email}</span><CopyValueButton value={contact.email} label="E-Mail" /></span> : '—'}</td>
          <td className="contacts-table__action"><div className="contact-actions contact-actions--icons">{isEditing ? <><button className="contact-actions__save" type="button" onClick={saveDraft} title="Speichern" aria-label="Ansprechpartner speichern" disabled={saving}><CheckIcon /></button><button type="button" onClick={() => onDraftChange(null)} title="Abbrechen" aria-label="Bearbeitung abbrechen" disabled={saving}><CloseIcon /></button></> : <><button type="button" onClick={() => startEdit(contact)} title="Bearbeiten" aria-label="Ansprechpartner bearbeiten" disabled={saving}><EditIcon /></button><button type="button" onClick={() => removeContact(contact.id)} title="Entfernen" aria-label="Ansprechpartner entfernen" disabled={saving}><TrashIcon /></button></>}</div></td>
        </tr>
      }) : null}{adding && <tr className="contacts-table__row--new"><td><input aria-label="Name des neuen Ansprechpartners" value={newContact.name} onChange={(event) => updateNewContact('name', event.target.value)} aria-invalid={Boolean(newErrors.name)} title={newErrors.name} disabled={saving} /></td><td><select aria-label="Abteilung des neuen Ansprechpartners" value={newContact.department} onChange={(event) => updateNewContact('department', event.target.value)} aria-invalid={Boolean(newErrors.department)} title={newErrors.department} disabled={saving}><option value="">Auswählen</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></td><td><input aria-label="Telefon des neuen Ansprechpartners" type="tel" value={newContact.phone} onChange={(event) => updateNewContact('phone', event.target.value)} disabled={saving} /></td><td><input aria-label="Mobil des neuen Ansprechpartners" type="tel" value={newContact.mobile} onChange={(event) => updateNewContact('mobile', event.target.value)} disabled={saving} /></td><td><input aria-label="E-Mail des neuen Ansprechpartners" type="email" value={newContact.email} onChange={(event) => updateNewContact('email', event.target.value)} aria-invalid={Boolean(newErrors.email)} title={newErrors.email} disabled={saving} /></td><td className="contacts-table__action"><div className="contact-actions contact-actions--icons"><button className="contact-actions__save" type="button" onClick={saveNewContact} title="Speichern" aria-label="Neuen Ansprechpartner speichern" disabled={saving}><CheckIcon /></button><button type="button" onClick={cancelNewContact} title="Abbrechen" aria-label="Neue Ansprechpartner-Eingaben verwerfen" disabled={saving}><CloseIcon /></button></div></td></tr>}</tbody></table></div>
    </section>
  )
}

function PortalsSection({ portals, onChange, saving }) {
  const [editDraft, setEditDraft] = useState(null)
  const [editErrors, setEditErrors] = useState({})
  const [newPortal, setNewPortal] = useState(createPartnerPortal)
  const [newErrors, setNewErrors] = useState({})
  const [adding, setAdding] = useState(false)

  function startEdit(portal) {
    setEditErrors({})
    setEditDraft({ ...portal })
  }

  function updateEditDraft(field, value) {
    setEditDraft((current) => ({ ...current, [field]: value }))
    setEditErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function saveEditDraft() {
    const nextErrors = {}
    if (!editDraft.url.trim()) nextErrors.url = 'Link ist erforderlich.'
    else if (!validateWebsite(editDraft.url)) nextErrors.url = 'Bitte eine vollständige Link-Adresse eingeben.'
    setEditErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const saved = await onChange(portals.map((portal) => portal.id === editDraft.id ? editDraft : portal))
    if (saved) setEditDraft(null)
  }

  function updateNewPortal(field, value) {
    setNewPortal((current) => ({ ...current, [field]: value }))
    setNewErrors((current) => ({ ...current, [field]: undefined }))
  }

  function resetNewPortal() {
    setNewPortal(createPartnerPortal())
    setNewErrors({})
  }

  function startNewPortal() {
    resetNewPortal()
    setAdding(true)
  }

  function cancelNewPortal() {
    resetNewPortal()
    setAdding(false)
  }

  async function saveNewPortal() {
    const nextErrors = {}
    if (!newPortal.url.trim()) nextErrors.url = 'Link ist erforderlich.'
    else if (!validateWebsite(newPortal.url)) nextErrors.url = 'Bitte eine vollständige Link-Adresse eingeben.'
    setNewErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const saved = await onChange([...portals, { ...newPortal, name: portalNameFromUrl(newPortal.url) || newPortal.name }])
    if (saved) {
      resetNewPortal()
      setAdding(false)
    }
  }

  async function removePortal(portalId) {
    const saved = await onChange(portals.filter((portal) => portal.id !== portalId))
    if (saved && editDraft?.id === portalId) setEditDraft(null)
  }

  return (
    <section className="form-section portals-section">
      <div className="portals-section__header"><h2>Zugänge auf Kundenportalen</h2>{!adding && <button className="button button--secondary" type="button" onClick={startNewPortal} disabled={saving}>Hinzufügen</button>}</div>
      <div className="portals-table table-frame"><table className="data-table"><thead><tr><th>Link</th><th>Benutzer / Mail</th><th>Zugangsnummer</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{portals.length ? portals.map((portal) => {
        const isEditing = editDraft?.id === portal.id
        return <tr key={portal.id} className={isEditing ? 'portals-table__row--editing' : ''}>
          <td>{isEditing ? <input aria-label="Link" value={editDraft.url} onChange={(event) => updateEditDraft('url', event.target.value)} aria-invalid={Boolean(editErrors.url)} title={editErrors.url} placeholder="https://" /> : portal.url ? <span className="copy-email-value"><a className="portal-link" href={portal.url} target="_blank" rel="noreferrer">{portal.url}</a><CopyValueButton value={portal.url} label="Link" /></span> : '—'}</td>
          <td>{isEditing ? <input aria-label="Benutzer oder Mail" value={editDraft.username} onChange={(event) => updateEditDraft('username', event.target.value)} autoComplete="username" /> : portal.username ? <span className="copy-email-value"><span>{portal.username}</span><CopyValueButton value={portal.username} label="Benutzer oder Mail" /></span> : '—'}</td>
          <td>{isEditing ? <input aria-label="Zugangsnummer" value={editDraft.accessNumber} onChange={(event) => updateEditDraft('accessNumber', event.target.value)} /> : portal.accessNumber ? <span className="copy-email-value"><span>{portal.accessNumber}</span><CopyValueButton value={portal.accessNumber} label="Zugangsnummer" /></span> : '—'}</td>
          <td className="portals-table__action"><div className="contact-actions contact-actions--icons">{isEditing ? <><button className="contact-actions__save" type="button" onClick={saveEditDraft} title="Speichern" aria-label="Zugang speichern" disabled={saving}><CheckIcon /></button><button type="button" onClick={() => setEditDraft(null)} title="Abbrechen" aria-label="Bearbeitung abbrechen" disabled={saving}><CloseIcon /></button></> : <><button type="button" onClick={() => startEdit(portal)} title="Bearbeiten" aria-label="Zugang bearbeiten" disabled={saving}><EditIcon /></button><button type="button" onClick={() => removePortal(portal.id)} title="Entfernen" aria-label="Zugang entfernen" disabled={saving}><TrashIcon /></button></>}</div></td>
        </tr>
      }) : null}{adding && <tr className="portals-table__row--new"><td><input aria-label="Link des neuen Zugangs" value={newPortal.url} onChange={(event) => updateNewPortal('url', event.target.value)} aria-invalid={Boolean(newErrors.url)} title={newErrors.url} placeholder="https://" disabled={saving} /></td><td><input aria-label="Benutzer oder Mail des neuen Zugangs" value={newPortal.username} onChange={(event) => updateNewPortal('username', event.target.value)} autoComplete="username" disabled={saving} /></td><td><input aria-label="Zugangsnummer des neuen Zugangs" value={newPortal.accessNumber} onChange={(event) => updateNewPortal('accessNumber', event.target.value)} disabled={saving} /></td><td className="portals-table__action"><div className="contact-actions contact-actions--icons"><button className="contact-actions__save" type="button" onClick={saveNewPortal} title="Speichern" aria-label="Neuen Zugang speichern" disabled={saving}><CheckIcon /></button><button type="button" onClick={cancelNewPortal} title="Abbrechen" aria-label="Neue Zugangseingaben verwerfen" disabled={saving}><CloseIcon /></button></div></td></tr>}</tbody></table></div>
    </section>
  )
}

export default function BusinessPartnerForm({ initialValue, isNew = false, onSubmit, onDirtyChange, onFormChange, formId, readOnly = false, saving = false }) {
  const [form, setForm] = useState(() => normalizeForm(initialValue))
  const [savedForm, setSavedForm] = useState(() => normalizeForm(initialValue))
  const [contactDraft, setContactDraft] = useState(null)
  const [errors, setErrors] = useState({})
  const [editingSection, setEditingSection] = useState(null)
  const [sectionDraft, setSectionDraft] = useState(null)
  const [sectionErrors, setSectionErrors] = useState({})

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

  async function persistChanges(nextForm) {
    if (isNew) {
      updateForm(nextForm)
      return true
    }

    const saved = await onSubmit(nextForm)
    if (saved) {
      setForm(nextForm)
      setSavedForm(nextForm)
      onFormChange?.(nextForm)
      onDirtyChange?.(false)
    }
    return saved
  }

  function openSectionEditor(section) {
    setEditingSection(section)
    setSectionErrors({})
    setSectionDraft({ ...form, address: { ...form.address }, contact: { ...form.contact }, companyData: { ...form.companyData } })
  }

  function closeSectionEditor() {
    setEditingSection(null)
    setSectionDraft(null)
    setSectionErrors({})
  }

  function handleSectionChange(event) {
    const { name, value } = event.target
    const [group, field] = name.split('.')
    const normalizedValue = name === 'creditNoteProcedure' ? value === 'true' : value
    setSectionDraft((current) => field ? { ...current, [group]: { ...current[group], [field]: normalizedValue } } : { ...current, [name]: normalizedValue })
    setSectionErrors((current) => ({ ...current, [name]: undefined, references: name === 'debtorNumber' || name === 'creditorNumber' ? undefined : current.references }))
  }

  function validateSection(section, values) {
    const nextErrors = {}
    if (section === 'company' && !values.companyName.trim()) nextErrors.companyName = 'Firmenname ist erforderlich.'
    if (section === 'references' && !values.debtorNumber.trim() && !values.creditorNumber.trim()) nextErrors.references = 'Mindestens eine Debitoren- oder Kreditorennummer ist erforderlich.'
    if (section === 'contact' && values.contact.email.trim() && !validateEmail(values.contact.email)) nextErrors['contact.email'] = 'Bitte eine gültige E-Mail-Adresse eingeben.'
    if (section === 'contact' && values.contact.website.trim() && !validateWebsite(values.contact.website)) nextErrors['contact.website'] = 'Bitte eine vollständige Website-Adresse eingeben.'
    if (section === 'billing' && values.paymentTermDays !== '' && (!Number.isInteger(Number(values.paymentTermDays)) || Number(values.paymentTermDays) < 0)) nextErrors.paymentTermDays = 'Bitte volle Tage ab 0 eingeben.'
    return nextErrors
  }

  async function applySectionChanges() {
    const nextErrors = validateSection(editingSection, sectionDraft)
    setSectionErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const saved = await persistChanges(sectionDraft)
    if (!saved) return
    const sectionErrorKeys = {
      company: ['companyName'],
      contact: ['contact.email', 'contact.website'],
      references: ['references'],
      billing: ['paymentTermDays'],
    }
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !(sectionErrorKeys[editingSection] ?? []).includes(key))))
    closeSectionEditor()
  }

  async function updateContacts(contacts) {
    const saved = await persistChanges({ ...form, contacts })
    if (saved) setErrors((current) => ({ ...current, contacts: undefined }))
    return saved
  }

  async function updatePortals(portals) {
    return persistChanges({ ...form, portals })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!isNew) return
    const nextErrors = { ...validateSection('company', form), ...validateSection('references', form), ...validateSection('contact', form), ...validateSection('billing', form) }
    if (form.contacts.some((contact) => !contact.name.trim() || !contact.department || (contact.email.trim() && !validateEmail(contact.email)))) nextErrors.contacts = 'Bitte die Ansprechpartnerangaben prüfen.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const saved = await onSubmit(form)
    if (saved) {
      setSavedForm(form)
      onDirtyChange?.(false)
    }
  }

  const displayOnlyMasterData = !isNew

  return (
    <form id={formId} className="business-partner-form" onSubmit={handleSubmit} noValidate><fieldset disabled={readOnly} className="business-partner-form__fieldset">
      {displayOnlyMasterData ? <ReadOnlySection section="company" form={form} onEdit={readOnly ? null : () => openSectionEditor('company')} /> : <FormSection title="Unternehmen & Anschrift" className="form-grid--company-address"><MasterDataFields section="company" form={form} onChange={handleChange} errors={errors} /></FormSection>}

      <div className="masterdata-half-grid">
        <div className="masterdata-half-grid__column">
          {displayOnlyMasterData ? <ReadOnlySection section="contact" form={form} onEdit={readOnly ? null : () => openSectionEditor('contact')} /> : <FormSection title="Allgemeiner Kontakt" className="form-grid--contact"><MasterDataFields section="contact" form={form} onChange={handleChange} errors={errors} /></FormSection>}
          {displayOnlyMasterData ? <ReadOnlySection section="companyData" form={form} onEdit={readOnly ? null : () => openSectionEditor('companyData')} /> : <FormSection title="Unternehmensdaten" className="form-grid--company-data"><MasterDataFields section="companyData" form={form} onChange={handleChange} errors={errors} /></FormSection>}
        </div>

        <div className="masterdata-half-grid__column">
          {displayOnlyMasterData ? <ReadOnlySection section="references" form={form} onEdit={readOnly ? null : () => openSectionEditor('references')} /> : <FormSection title="Referenzen & Nummern" className="form-grid--references"><MasterDataFields section="references" form={form} onChange={handleChange} errors={errors} /></FormSection>}
          {displayOnlyMasterData ? <ReadOnlySection section="billing" form={form} onEdit={readOnly ? null : () => openSectionEditor('billing')} /> : <FormSection title="Abrechnung" className="form-grid--billing"><MasterDataFields section="billing" form={form} onChange={handleChange} errors={errors} /></FormSection>}
        </div>
      </div>

      <ContactsSection contacts={form.contacts} onChange={updateContacts} draft={contactDraft} onDraftChange={setContactDraft} saving={saving} />
      {errors.contacts && <p className="form-error">{errors.contacts}</p>}
      <PortalsSection portals={form.portals} onChange={updatePortals} saving={saving} />
    </fieldset>{editingSection && sectionDraft && <MasterDataEditModal section={editingSection} form={sectionDraft} errors={sectionErrors} onChange={handleSectionChange} onClose={closeSectionEditor} onApply={applySectionChanges} saving={saving} />}</form>
  )
}
