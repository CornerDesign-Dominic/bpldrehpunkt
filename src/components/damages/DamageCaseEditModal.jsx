import { useEffect, useMemo, useState } from 'react'
import { DAMAGE_CASE_STATUSES, DAMAGE_CASE_TYPES, DAMAGE_CONTRACTOR_LIABILITY, DAMAGE_INSURANCE_RELEVANCE, DAMAGE_LEGAL_BASES } from '../../lib/damages.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'

const sectionTitles = {
  title: 'Falltitel bearbeiten',
  description: 'Schadenbeschreibung bearbeiten',
  general: 'Allgemeine Falldaten bearbeiten',
  links: 'Verknüpfungen bearbeiten',
  claimant: 'Kunde & Anspruch bearbeiten',
  contractor: 'Unternehmer & Versicherung bearbeiten',
  liability: 'Haftungsgrundlage bearbeiten',
}

const sectionFields = {
  title: ['title', 'description'],
  description: ['description'],
  general: ['status', 'damageType', 'damageDate', 'dueDate', 'damageAmount', 'bplInsuranceCaseNumber', 'responsibleUserId'],
  links: ['transportReference'],
  claimant: ['claimant', 'claimantPartnerId', 'customerInsurance', 'customerInsuranceNumber'],
  contractor: ['contractor', 'contractorPartnerId', 'contractorInsurance', 'contractorInsuranceCaseNumber', 'contractorLiability'],
  liability: ['legalBasis', 'cargoWeightKg', 'liabilityLimit', 'insuranceRelevance'],
}

function valueForForm(value) { return value ?? '' }

function initialValues(damageCase, section) {
  return Object.fromEntries(sectionFields[section].map((field) => [field, valueForForm(damageCase[field])]))
}

function Field({ children, label }) {
  return <label className="form-field"><span>{label}</span>{children}</label>
}

export default function DamageCaseEditModal({ damageCase, onCancel, onSubmit, partners = [], section, users = [] }) {
  const [form, setForm] = useState(() => initialValues(damageCase, section))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const responsibleUsers = useMemo(() => users.filter((entry) => entry.active !== false).sort((left, right) => getUserDisplayName(left, left).localeCompare(getUserDisplayName(right, right), 'de')), [users])
  const customers = useMemo(() => partners.filter((partner) => partner.debtorNumber?.trim()), [partners])
  const contractors = useMemo(() => partners.filter((partner) => partner.creditorNumber?.trim()), [partners])

  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel, saving])

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  function selectPartner(kind, partnerId) {
    const partner = partners.find((entry) => entry.id === partnerId)
    if (kind === 'claimant') setForm((current) => ({ ...current, claimantPartnerId: partner?.id || '', claimant: partner?.companyName || '' }))
    else setForm((current) => ({ ...current, contractorPartnerId: partner?.id || '', contractor: partner?.companyName || '' }))
  }

  async function save(event) {
    event.preventDefault()
    const before = initialValues(damageCase, section)
    const changes = Object.fromEntries(Object.entries(form).filter(([field, value]) => value !== before[field]))
    if (!Object.keys(changes).length) { onCancel(); return }
    setSaving(true)
    setError('')
    try { await onSubmit(section, changes) } catch (submissionError) { setError(submissionError.message || 'Die Änderung konnte nicht gespeichert werden.') } finally { setSaving(false) }
  }

  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}>
    <section className="todo-quick-edit-modal damage-case-edit-modal" role="dialog" aria-modal="true" aria-labelledby="damage-case-edit-title">
      <form className="todo-quick-editor" onSubmit={save} noValidate>
        <div className="todo-quick-editor__heading"><h2 id="damage-case-edit-title">{sectionTitles[section]}</h2></div>
        {section === 'title' && <div className="todo-quick-editor__grid"><Field label="Kurzbezeichnung *"><input autoFocus value={form.title} maxLength="500" required onChange={(event) => update('title', event.target.value)} /></Field><Field label="Kurzbeschreibung"><textarea rows="4" value={form.description} maxLength="4000" onChange={(event) => update('description', event.target.value)} /></Field></div>}
        {section === 'description' && <div className="todo-quick-editor__grid"><Field label="Schadensbeschreibung / Sachverhalt"><textarea autoFocus rows="8" value={form.description} maxLength="4000" onChange={(event) => update('description', event.target.value)} /></Field></div>}
        {section === 'general' && <div className="todo-quick-editor__grid todo-quick-editor__grid--three"><Field label="Status"><select value={form.status} onChange={(event) => update('status', event.target.value)}>{DAMAGE_CASE_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Schadenart"><select value={form.damageType} onChange={(event) => update('damageType', event.target.value)}><option value="">Bitte wählen</option>{DAMAGE_CASE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field><Field label="Schadendatum *"><input type="date" value={form.damageDate} required onChange={(event) => update('damageDate', event.target.value)} /></Field><Field label="Nächste Frist"><input type="date" value={form.dueDate} onChange={(event) => update('dueDate', event.target.value)} /></Field><Field label="Schadenhöhe"><input type="number" min="0" step="0.01" value={form.damageAmount} onChange={(event) => update('damageAmount', event.target.value)} /></Field><Field label="Aktennummer BPL-Versicherung"><input value={form.bplInsuranceCaseNumber} maxLength="240" onChange={(event) => update('bplInsuranceCaseNumber', event.target.value)} /></Field><Field label="Verantwortliche Person"><select value={form.responsibleUserId} onChange={(event) => update('responsibleUserId', event.target.value)}><option value="">Nicht zugeordnet</option>{responsibleUsers.map((entry) => <option key={entry.id} value={entry.id}>{getUserDisplayName(entry, entry)}</option>)}</select></Field></div>}
        {section === 'links' && <div className="todo-quick-editor__grid"><Field label="TA-Nummer"><input autoFocus value={form.transportReference} maxLength="240" onChange={(event) => update('transportReference', event.target.value)} /></Field></div>}
        {section === 'claimant' && <div className="todo-quick-editor__grid"><Field label="Kunde / Anspruchsteller"><select autoFocus value={form.claimantPartnerId} onChange={(event) => selectPartner('claimant', event.target.value)}><option value="">Kein Kunde verknüpft</option>{form.claimantPartnerId && !customers.some((partner) => partner.id === form.claimantPartnerId) && <option value={form.claimantPartnerId}>{form.claimant || 'Verknüpfter Kunde'}</option>}{customers.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></Field><Field label="Versicherung Kunde"><input value={form.customerInsurance} maxLength="240" onChange={(event) => update('customerInsurance', event.target.value)} /></Field><Field label="Vorgangsnummer Kunde"><input value={form.customerInsuranceNumber} maxLength="240" onChange={(event) => update('customerInsuranceNumber', event.target.value)} /></Field></div>}
        {section === 'contractor' && <div className="todo-quick-editor__grid"><Field label="Unternehmer"><select autoFocus value={form.contractorPartnerId} onChange={(event) => selectPartner('contractor', event.target.value)}><option value="">Kein Unternehmer verknüpft</option>{form.contractorPartnerId && !contractors.some((partner) => partner.id === form.contractorPartnerId) && <option value={form.contractorPartnerId}>{form.contractor || 'Verknüpfter Unternehmer'}</option>}{contractors.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></Field><Field label="Versicherer UTN"><input value={form.contractorInsurance} maxLength="240" onChange={(event) => update('contractorInsurance', event.target.value)} /></Field><Field label="Vorgangsnummer Unternehmer"><input value={form.contractorInsuranceCaseNumber} maxLength="240" onChange={(event) => update('contractorInsuranceCaseNumber', event.target.value)} /></Field><Field label="Haftung Unternehmer"><select value={form.contractorLiability} onChange={(event) => update('contractorLiability', event.target.value)}><option value="">Nicht festgelegt</option>{DAMAGE_CONTRACTOR_LIABILITY.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field></div>}
        {section === 'liability' && <div className="todo-quick-editor__grid damage-case-edit-modal__liability"><Field label="Rechtsgrundlage"><select autoFocus value={form.legalBasis} onChange={(event) => update('legalBasis', event.target.value)}><option value="">Nicht festgelegt</option>{DAMAGE_LEGAL_BASES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Gewicht der Ware in kg"><input type="number" min="0" step="0.01" value={form.cargoWeightKg} onChange={(event) => update('cargoWeightKg', event.target.value)} /></Field><Field label="Bemessungs-/Haftungsgrenze"><input type="number" min="0" step="0.01" value={form.liabilityLimit} onChange={(event) => update('liabilityLimit', event.target.value)} /></Field><Field label="Versicherungsrelevanz"><select value={form.insuranceRelevance} onChange={(event) => update('insuranceRelevance', event.target.value)}><option value="">Nicht festgelegt</option>{DAMAGE_INSURANCE_RELEVANCE.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field></div>}
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>
      </form>
    </section>
  </div>
}
