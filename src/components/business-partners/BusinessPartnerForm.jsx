import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { CheckIcon, CloseIcon, CopyIcon, EditIcon, TrashIcon } from '../icons.jsx'
import Toast from '../ui/Toast.jsx'
import { BUSINESS_PARTNER_STATUSES, createEmptyBusinessPartner, normalizePartnerPortal } from '../../lib/businessPartners.js'
import { businessPartnerDetailPath } from '../../lib/businessPartnerLinks.js'
import { listMergedPartnerSources } from '../../lib/partnerHistory.js'
import { previewPartnerMergeReversal, separatePartnerMerge } from '../../lib/manualPartnerMerges.js'
import { partnerMergeReversalAction, partnerReferenceNumbers } from '../../lib/partnerReferencePresentation.js'
import { paymentTermText } from '../../lib/paymentTerms.js'
import { crmIndustryValue } from '../../lib/crmIndustry.js'
import { shipmentTrackingPolicyCardState } from '../../lib/shipmentTrackingPolicyPresentation.js'
import { normalizeShipmentTrackingPolicy } from '../../lib/shipmentTrackingPolicy.js'
import { newShipmentTrackingPartnerPolicy } from '../../../shared/shipmentTrackingPartnerDefaults.js'
import { formatShipmentTrackingWorkingDuration } from '../../../shared/shipmentTrackingRuleCatalog.js'
import '../../styles/businessPartnerExtensions.css'

const departments = ['Geschäftsführung', 'Disposition', 'Einkauf', 'Verkauf', 'Logistik', 'Lager', 'Buchhaltung', 'Finanzbuchhaltung', 'Rechnungswesen', 'Controlling', 'Personal', 'Einkauf / Beschaffung', 'Kundenservice', 'Qualität / QM', 'IT', 'Empfang / Zentrale', 'Sonstiges']
const CopyFeedbackContext = createContext(() => {})
const mergeModuleLabels = { transportOrders: 'Transportaufträge', todos: 'To-dos', damageCases: 'Schäden', palletMovements: 'Palettenbewegungen', palletClosings: 'Palettenabschlüsse', inkassoCases: 'Inkasso', customerImportRows: 'Kundenimportzeilen', carrierImportRows: 'Unternehmerimportzeilen', businessPartners: 'Partnerverknüpfungen', insolvencies: 'Insolvenzen', activities: 'CRM-Kontakte & Notizen', ratings: 'Bewertungen' }

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
    crmIndustry: crmIndustryValue(value),
    paymentTermDays: paymentTermText(value),
    address: { ...defaults.address, ...(value?.address ?? {}) },
    contact: { ...defaults.contact, ...(value?.contact ?? {}) },
    companyData: { ...defaults.companyData, ...(value?.companyData ?? {}) },
    shipmentTrackingPolicy: value?.shipmentTrackingPolicy === undefined ? undefined : normalizeShipmentTrackingPolicy(value.shipmentTrackingPolicy),
    contacts: (value?.contacts ?? []).map((contact) => ({ ...createContact(), ...contact })),
    portals: (value?.portals ?? []).map((portal) => ({ ...createPartnerPortal(), ...normalizePartnerPortal(portal) })),
  }
}

function Field({ label, name, value, onChange, error, type = 'text', placeholder, className = '' }) {
  return (
    <label className={`form-field ${className}`}>
      <span>{label}</span>
      <input name={name} value={value} onChange={onChange} type={type} placeholder={placeholder} aria-invalid={Boolean(error)} />
      {error && <small className="field-error">{<StaticText source={error} />}</small>}
    </label>
  )
}

function FormSection({ title, className = '', children }) {
  return <section className="form-section"><h2>{title}</h2><div className={`form-grid ${className}`}>{children}</div></section>
}

function TrackingPolicyCheckbox({ label, checked, onChange, disabled, title }) {
  return <label className="shipment-tracking-policy__checkbox" title={title}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} /><span>{label}</span></label>
}

function ShipmentTrackingPolicyAreas({ roles, policy, carrierRules, disabled, onCustomerChange, onCarrierChange, onCarrierArrivalConfirmationChange }) {
  const carrierTopic = (topic, title) => <div><h4>{title}</h4><div className="shipment-tracking-policy__choices">{carrierRules.filter((rule) => rule.topic === topic).map((rule) => <TrackingPolicyCheckbox key={rule.id} label={`${rule.label} · ${rule.offsetWorkingHours === 0 ? 'Zum Beladebeginn' : `${formatShipmentTrackingWorkingDuration(rule.offsetWorkingHours)} vorher`}`} checked={policy.carrier.enabledRuleIds[rule.id] === true} disabled={disabled} onChange={(value) => onCarrierChange?.(rule.id, value)} />)}</div></div>
  return <>{roles.customer && <div className="shipment-tracking-policy__area"><h3><StaticText source={"Kunde"} /></h3><div className="shipment-tracking-policy__choices"><TranslatedProps sources={{"title":"Spätere interne BPL-Mindesteskalation für das Kennzeichen"}}><TrackingPolicyCheckbox label="Kennzeichen wichtig" checked={policy.customer.licensePlateImportant} disabled={disabled} title="Spätere interne BPL-Mindesteskalation für das Kennzeichen" onChange={(value) => onCustomerChange?.('licensePlateImportant', value)} /></TranslatedProps><TranslatedProps sources={{"title":"Spätere interne BPL-Mindesteskalation für die Ladestelle"}}><TrackingPolicyCheckbox label="Informationen zur Ladestelle wichtig" checked={policy.customer.loadingSiteInformationImportant} disabled={disabled} title="Spätere interne BPL-Mindesteskalation für die Ladestelle" onChange={(value) => onCustomerChange?.('loadingSiteInformationImportant', value)} /></TranslatedProps></div></div>}{roles.customer && roles.carrier && <hr className="shipment-tracking-policy__divider" />}{roles.carrier && <div className="shipment-tracking-policy__area"><h3><StaticText source={"Unternehmer"} /></h3><div className="shipment-tracking-policy__choices"><TranslatedProps sources={{"title":"Sendet vor der frühesten Beladung eine separate Anfrage zum aktuellen Planstand."}}><TrackingPolicyCheckbox label="Kurz vor Ladung aktuellen Stand anfragen" checked={policy.carrier.actualArrivalConfirmationEnabled === true} disabled={disabled} title="Sendet vor der frühesten Beladung eine separate Anfrage zum aktuellen Planstand." onChange={onCarrierArrivalConfirmationChange} /></TranslatedProps></div><div className="shipment-tracking-policy__groups">{<StaticText source={carrierTopic('licensePlate', 'Kennzeichen')} />}{<StaticText source={carrierTopic('loadingSite', 'Ladestelle')} />}</div></div>}</>
}

function ShipmentTrackingPolicyEditModal({ card, saving, onSave, onClose }) {
  const [draft, setDraft] = useState(() => card.policy)
  const [error, setError] = useState('')
  const updateCustomer = (field, value) => { setError(''); setDraft((current) => ({ ...current, customer: { ...current.customer, [field]: value } })) }
  const updateCarrier = (id, value) => { setError(''); setDraft((current) => { const enabledRuleIds = { ...current.carrier.enabledRuleIds }; if (value) enabledRuleIds[id] = true; else delete enabledRuleIds[id]; return { ...current, carrier: { ...current.carrier, enabledRuleIds } } }) }
  const updateCarrierArrivalConfirmation = (value) => { setError(''); setDraft((current) => ({ ...current, carrier: { ...current.carrier, actualArrivalConfirmationEnabled: value } })) }
  async function save() {
    const saved = await onSave(draft)
    if (saved) onClose()
    else setError('Speichern nicht möglich.')
  }
  return createPortal(<div className="masterdata-edit-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}><section className="masterdata-edit-modal shipment-tracking-policy-modal" role="dialog" aria-modal="true" aria-labelledby="shipment-tracking-policy-modal-title"><div className="masterdata-edit-modal__heading"><h2 id="shipment-tracking-policy-modal-title"><StaticText source={"Sendungsverfolgung bearbeiten"} /></h2><TranslatedProps sources={{"aria-label":"Dialog schließen"}}><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={saving}><CloseIcon /></button></TranslatedProps></div><ShipmentTrackingPolicyAreas roles={card.roles} policy={draft} carrierRules={card.carrierRules} disabled={saving} onCustomerChange={updateCustomer} onCarrierChange={updateCarrier} onCarrierArrivalConfirmationChange={updateCarrierArrivalConfirmation} />{error && <p className="form-error">{<StaticText source={error} />}</p>}<div className="masterdata-edit-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}><StaticText source={"Abbrechen"} /></button><button className="button" type="button" onClick={() => void save()} disabled={saving}>{<StaticText source={saving ? 'Wird gespeichert …' : 'Speichern'} />}</button></div></section></div>, document.body)
}

function ShipmentTrackingPolicyCard({ partner, policy, ruleCatalog, readOnly, saving, onSave }) {
  const card = shipmentTrackingPolicyCardState(partner, policy, !readOnly, ruleCatalog)
  const [editing, setEditing] = useState(false)
  if (!card.roles.customer && !card.roles.carrier) return null
  return <section className="form-section shipment-tracking-policy" aria-labelledby="shipment-tracking-policy-title"><div className="shipment-tracking-policy__heading"><h2 id="shipment-tracking-policy-title"><StaticText source={"Sendungsverfolgung"} /></h2>{card.editable && <TranslatedProps sources={{"title":"Sendungsverfolgung bearbeiten","aria-label":"Sendungsverfolgung bearbeiten"}}><button className="masterdata-readonly-section__edit" type="button" onClick={() => setEditing(true)} title="Sendungsverfolgung bearbeiten" aria-label="Sendungsverfolgung bearbeiten" disabled={saving}><EditIcon /></button></TranslatedProps>}</div><ShipmentTrackingPolicyAreas roles={card.roles} policy={card.policy} carrierRules={card.carrierRules} disabled />{editing && <ShipmentTrackingPolicyEditModal card={card} saving={saving} onSave={onSave} onClose={() => setEditing(false)} />}</section>
}

const masterDataSections = {
  company: { title: 'Unternehmen & Anschrift', className: 'form-grid--company-address' },
  contact: { title: 'Allgemeiner Kontakt', className: 'form-grid--contact' },
  references: { title: 'Referenzen & Nummern', className: 'form-grid--references' },
  companyData: { title: 'Unternehmensdaten', className: 'form-grid--company-data' },
  billing: { title: 'Abrechnung', className: 'form-grid--billing' },
}

function statusLabel(value) {
  if (value === 'merged') return 'Zusammengeführt'
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
  const showCopyFeedback = useContext(CopyFeedbackContext)

  async function copyValue() {
    try {
      await copyToClipboard(value)
      setCopied(true)
      showCopyFeedback()
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

function ReadOnlyField({ label, value, className = '', status, copyable = false, moreCount = 0, onShowMore }) {
  const displayValue = value === '' || value === null || value === undefined ? '—' : value
  const hasCopyAction = copyable && displayValue !== '—'
  const valueClass = status ? `masterdata-readonly-field__value masterdata-readonly-field__value--status masterdata-readonly-field__value--status-${status}` : `masterdata-readonly-field__value${hasCopyAction ? ' masterdata-readonly-field__value--copyable' : ''}`
  const content = <><span>{displayValue}</span>{hasCopyAction && <CopyValueButton value={displayValue} label={label} />}</>
  return <div className={`masterdata-readonly-field ${className}`}><dt>{label}</dt>{moreCount ? <dd className="masterdata-readonly-field__with-more"><span className={valueClass}>{content}</span><a href="#partner-numbers-modal-title" className="masterdata-readonly-field__more" onClick={(event) => { event.preventDefault(); onShowMore() }} aria-label={`${moreCount} weitere ${label}n anzeigen`}>+ {moreCount} <StaticText source={"weitere"} /></a></dd> : <dd className={valueClass}>{content}</dd>}</div>
}

function ReadOnlySection({ section, form, onEdit, onShowNumbers }) {
  const { title, className } = masterDataSections[section]
  let fields

  if (section === 'company') fields = <><TranslatedProps sources={{"label":"Firmenname"}}><ReadOnlyField className="form-field--company-address" label="Firmenname" value={form.companyName} /></TranslatedProps><ReadOnlyField className="form-field--status" label="Status" value={statusLabel(form.status)} status={form.status} /><TranslatedProps sources={{"label":"Straße"}}><ReadOnlyField className="form-field--street" label="Straße" value={form.address.street} /></TranslatedProps><ReadOnlyField className="form-field--house-number" label="Hausnummer" value={form.address.houseNumber} /><TranslatedProps sources={{"label":"PLZ"}}><ReadOnlyField className="form-field--postal-code" label="PLZ" value={form.address.postalCode} /></TranslatedProps><TranslatedProps sources={{"label":"Ort"}}><ReadOnlyField className="form-field--city" label="Ort" value={form.address.city} /></TranslatedProps><TranslatedProps sources={{"label":"Land"}}><ReadOnlyField className="form-field--country" label="Land" value={form.address.country} /></TranslatedProps></>
  if (section === 'contact') fields = <><TranslatedProps sources={{"label":"Telefon"}}><ReadOnlyField className="form-field--contact-phone" label="Telefon" value={form.contact.phone} /></TranslatedProps><ReadOnlyField className="form-field--contact-fax" label="Fax" value={form.contact.fax} /><TranslatedProps sources={{"label":"E-Mail"}}><ReadOnlyField className="form-field--contact-email" label="E-Mail" value={form.contact.email} copyable /></TranslatedProps><ReadOnlyField className="form-field--contact-website" label="Website" value={form.contact.website} /></>
  if (section === 'references') {
    const debtors = partnerReferenceNumbers(form, 'debtor')
    const creditors = partnerReferenceNumbers(form, 'creditor')
    fields = <><ReadOnlyField label="Debitorennummer" value={form.debtorNumber} copyable moreCount={debtors.additional.length} onShowMore={onShowNumbers} /><ReadOnlyField label="Kreditorennummer" value={form.creditorNumber} copyable moreCount={creditors.additional.length} onShowMore={onShowNumbers} /><ReadOnlyField label="TIMOCOM-Nummer" value={form.timocomNumber} copyable /><ReadOnlyField label="Trans.eu-Nummer" value={form.transeuNumber} copyable /><ReadOnlyField label="DPL-Nummer" value={form.dplNumber} copyable /><ReadOnlyField label="Paki-Nummer" value={form.pakiNumber} copyable /></>
  }
  if (section === 'companyData') fields = <><ReadOnlyField className="form-field--company-vat" label="USt-IdNr." value={form.companyData.vatId} /><ReadOnlyField className="form-field--company-tax" label="Steuernummer" value={form.companyData.taxNumber} /><ReadOnlyField className="form-field--company-register-number" label="Handelsregisternummer" value={form.companyData.commercialRegisterNumber} /><ReadOnlyField className="form-field--company-register-court" label="Registergericht" value={form.companyData.registerCourt} /></>
  if (section === 'billing') fields = <><TranslatedProps sources={{"label":"Zahlungsziel"}}><ReadOnlyField label="Zahlungsziel" value={form.paymentTermDays} /></TranslatedProps><TranslatedProps sources={{"label":"Gutschriftverfahren"}}><ReadOnlyField label="Gutschriftverfahren" value={form.creditNoteProcedure ? 'Ja' : 'Nein'} /></TranslatedProps>{form.bankData?.iban && <ReadOnlyField label="IBAN" value={form.bankData.iban} copyable />}{form.bankData?.bic && <ReadOnlyField label="BIC" value={form.bankData.bic} copyable />}{form.bankData?.ibanVerifiedAt && <ReadOnlyField label="IBAN geprüft am" value={form.bankData.ibanVerifiedAt} />}</>

  return <section className="form-section masterdata-readonly-section"><div className="masterdata-readonly-section__header"><h2>{title}</h2><div className="masterdata-readonly-section__header-actions">{onEdit && <button className="masterdata-readonly-section__edit" type="button" onClick={onEdit} title={`${title} bearbeiten`} aria-label={`${title} bearbeiten`}><EditIcon /></button>}</div></div><dl className={`form-grid masterdata-readonly-grid ${className}`}>{fields}</dl></section>
}

function formatMergeDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date) : '—'
}

function NumberList({ title, reference }) {
  return <section className="partner-numbers-modal__group"><h3>{title}</h3>{reference.numbers.length ? <ul>{reference.numbers.map((number) => <li key={number}><span>{number}</span>{number === reference.primary && <small><StaticText source={"Hauptnummer"} /></small>}</li>)}</ul> : <p><StaticText source={"Keine Nummer hinterlegt."} /></p>}</section>
}

function PartnerNumbersModal({ partner, onClose, canViewArchivedPartner, canMerge, onSeparated }) {
  const [history, setHistory] = useState({ loading: true, entries: [], error: '' })
  const [selected, setSelected] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const closeRef = useRef(null)
  useEffect(() => {
    let active = true
    closeRef.current?.focus()
    listMergedPartnerSources(partner.id).then(async (entries) => {
      const checked = canMerge ? await Promise.all(entries.map(async (entry) => ({ ...entry, reversal: entry.mergeId ? await previewPartnerMergeReversal({ mergeId: entry.mergeId, targetPartnerId: partner.id }).catch(() => ({ canSeparate: false, reason: 'Die sichere Trennung konnte nicht geprüft werden.' })) : { canSeparate: false, reason: 'Diese frühere Zusammenführung kann nicht automatisch sicher getrennt werden.' } }))) : entries
      if (active) setHistory({ loading: false, entries: checked, error: '' })
    }).catch(() => { if (active) setHistory({ loading: false, entries: [], error: 'Die Zusammenführungen konnten nicht geladen werden.' }) })
    return () => { active = false }
  }, [partner.id, canMerge])

  async function openReversal(entry) {
    setBusy(true); setActionError(''); setConfirmed(false)
    try {
      const preview = await previewPartnerMergeReversal({ mergeId: entry.mergeId, targetPartnerId: partner.id })
      setSelected({ entry, preview })
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Die Trennungsvorschau konnte nicht geladen werden.') }
    finally { setBusy(false) }
  }

  async function confirmReversal() {
    if (!selected?.preview?.canSeparate || !confirmed) return
    setBusy(true); setActionError('')
    try {
      const result = await separatePartnerMerge({ mergeId: selected.entry.mergeId, targetPartnerId: partner.id, fingerprint: selected.preview.fingerprint })
      await onSeparated?.(result)
      onClose()
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Die Zusammenführung konnte nicht getrennt werden. Bitte die Vorschau neu laden.') }
    finally { setBusy(false) }
  }

  return createPortal(<div className="masterdata-edit-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }} onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose() }}><section className="masterdata-edit-modal partner-numbers-modal" role="dialog" aria-modal="true" aria-labelledby="partner-numbers-modal-title"><div className="masterdata-edit-modal__heading"><h2 id="partner-numbers-modal-title">{<StaticText source={selected ? 'Zusammenführung trennen' : 'Nummern & Zusammenführungen'} />}</h2><TranslatedProps sources={{"aria-label":"Dialog schließen"}}><button ref={closeRef} type="button" onClick={onClose} aria-label="Dialog schließen" disabled={busy}><CloseIcon /></button></TranslatedProps></div>
    {selected ? <div className="partner-merge-reversal">
      {!selected.preview.canSeparate ? <p className="form-error">{selected.preview.reason}</p> : <>
        <p><StaticText source={"Das archivierte Stammdatenblatt"} /> <strong>{selected.preview.sourcePartnerName || selected.entry.companyName}</strong> <StaticText source={"wird wieder aktiv."} /> <strong>{selected.preview.targetPartnerName || partner.companyName}</strong> <StaticText source={"bleibt als eigenständiger Zielpartner aktiv."} /></p>
        <div className="partner-merge-reversal__counts"><span>{selected.preview.debtorCount} <StaticText source={"Debitorennummer(n)"} /></span><span>{selected.preview.creditorCount} <StaticText source={"Kreditorennummer(n)"} /></span><span>{selected.preview.dataCount} <StaticText source={"Kontakt-/Datenwert(e)"} /></span></div>
        <h3><StaticText source={"Zurückkehrende Verknüpfungen"} /></h3><ul>{Object.entries(selected.preview.referenceCounts || {}).length ? Object.entries(selected.preview.referenceCounts).map(([module, count]) => <li key={module}>{mergeModuleLabels[module] || module}: {count}</li>) : <li><StaticText source={"Keine"} /></li>}</ul>
        {selected.preview.warnings?.length > 0 && <div className="partner-merge-reversal__warnings"><strong><StaticText source={"Manuelle Prüfung erforderlich"} /></strong><ul>{selected.preview.warnings.map((warning) => <li key={warning}>{<StaticText source={warning} />}</li>)}</ul><p><StaticText source={"Später veränderte Werte bleiben am Zielpartner erhalten."} /></p></div>}
        <label className="partner-merge-reversal__confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> <StaticText source={"Ich habe die Rückabwicklung und die Hinweise geprüft."} /></label>
      </>}
      {actionError && <p className="form-error">{actionError}</p>}
      <div className="masterdata-edit-modal__actions"><button className="button button--secondary" type="button" onClick={() => { setSelected(null); setActionError('') }} disabled={busy}><StaticText source={"Zurück"} /></button>{selected.preview.canSeparate && <button className="button" type="button" onClick={() => void confirmReversal()} disabled={!confirmed || busy}>{<StaticText source={busy ? 'Trennung läuft …' : 'Zusammenführung trennen'} />}</button>}</div>
    </div> : <><div className="partner-numbers-modal__numbers"><TranslatedProps sources={{"title":"Debitorennummern"}}><NumberList title="Debitorennummern" reference={partnerReferenceNumbers(partner, 'debtor')} /></TranslatedProps><TranslatedProps sources={{"title":"Kreditorennummern"}}><NumberList title="Kreditorennummern" reference={partnerReferenceNumbers(partner, 'creditor')} /></TranslatedProps></div>{history.loading && <p className="partner-numbers-modal__state"><StaticText source={"Zusammenführungen werden geladen …"} /></p>}{history.error && <p className="form-error">{history.error}</p>}{history.entries.length > 0 && <section className="partner-numbers-modal__merged"><h3><StaticText source={"Zusammengeführte Stammdatenblätter"} /></h3><ul>{history.entries.map((entry) => <li key={entry.id}><strong>{entry.companyName}</strong><span><StaticText source={"Frühere Hauptnummern: Debitor"} /> {entry.debtorNumber || '—'} <StaticText source={"· Kreditor"} /> {entry.creditorNumber || '—'}</span><span><StaticText source={"Zusammengeführt am"} /> {formatMergeDate(entry.mergedAt)} <StaticText source={"· durch"} /> {entry.actorName || '—'}</span>{canViewArchivedPartner && entry.canOpen && <Link to={businessPartnerDetailPath(entry.id)} onClick={onClose}><StaticText source={"Archiviertes Stammdatenblatt ansehen"} /></Link>}{canMerge && <><button className="button button--secondary" type="button" disabled={busy || !partnerMergeReversalAction(entry).enabled} onClick={() => void openReversal(entry)}><StaticText source={"Zusammenführung trennen"} /></button>{!partnerMergeReversalAction(entry).enabled && <small>{partnerMergeReversalAction(entry).reason}</small>}</>}</li>)}</ul></section>}{actionError && <p className="form-error">{actionError}</p>}<div className="masterdata-edit-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}><StaticText source={"Schließen"} /></button></div></>}
  </section></div>, document.body)
}

function MasterDataFields({ section, form, onChange, onRolesChange, errors }) {
  if (section === 'company') return <><Field className="form-field--company-address" label="Firmenname *" name="companyName" value={form.companyName} onChange={onChange} error={errors.companyName} /><label className={`form-field form-field--status form-field--status-${form.status}`}><span>Status</span><select name="status" value={form.status} onChange={onChange}>{BUSINESS_PARTNER_STATUSES.map((status) => <option key={status.value} value={status.value}>{<StaticText source={status.label} />}</option>)}</select></label><TranslatedProps sources={{"label":"Straße"}}><Field className="form-field--street" label="Straße" name="address.street" value={form.address.street} onChange={onChange} /></TranslatedProps><Field label="Hausnummer" name="address.houseNumber" value={form.address.houseNumber} onChange={onChange} /><TranslatedProps sources={{"label":"PLZ"}}><Field label="PLZ" name="address.postalCode" value={form.address.postalCode} onChange={onChange} /></TranslatedProps><TranslatedProps sources={{"label":"Ort"}}><Field label="Ort" name="address.city" value={form.address.city} onChange={onChange} /></TranslatedProps><TranslatedProps sources={{"label":"Land"}}><Field label="Land" name="address.country" value={form.address.country} onChange={onChange} /></TranslatedProps></>
  if (section === 'contact') return <><TranslatedProps sources={{"label":"Telefon"}}><Field className="form-field--contact-phone" label="Telefon" name="contact.phone" value={form.contact.phone} onChange={onChange} type="tel" /></TranslatedProps><Field className="form-field--contact-fax" label="Fax" name="contact.fax" value={form.contact.fax} onChange={onChange} type="tel" /><TranslatedProps sources={{"label":"E-Mail"}}><Field className="form-field--contact-email" label="E-Mail" name="contact.email" value={form.contact.email} onChange={onChange} error={errors['contact.email']} type="email" /></TranslatedProps><TranslatedProps sources={{"placeholder":"https://"}}><Field className="form-field--contact-website" label="Website" name="contact.website" value={form.contact.website} onChange={onChange} error={errors['contact.website']} placeholder="https://" /></TranslatedProps></>
  if (section === 'references') return <><TranslatedProps sources={{"placeholder":"DyCoS-Referenz"}}><Field label="Debitorennummer" name="debtorNumber" value={form.debtorNumber} onChange={onChange} placeholder="DyCoS-Referenz" /></TranslatedProps><TranslatedProps sources={{"placeholder":"DyCoS-Referenz"}}><Field label="Kreditorennummer" name="creditorNumber" value={form.creditorNumber} onChange={onChange} placeholder="DyCoS-Referenz" /></TranslatedProps><Field label="TIMOCOM-Nummer" name="timocomNumber" value={form.timocomNumber} onChange={onChange} /><Field label="Trans.eu-Nummer" name="transeuNumber" value={form.transeuNumber} onChange={onChange} /><Field label="DPL-Nummer" name="dplNumber" value={form.dplNumber} onChange={onChange} /><Field label="Paki-Nummer" name="pakiNumber" value={form.pakiNumber} onChange={onChange} />{onRolesChange && <div className="form-grid__wide"><span><StaticText source={"Rollen"} /></span><label className="shipment-tracking-policy__checkbox"><input type="checkbox" checked={form.businessPartnerRoles?.includes('customer')} onChange={(event) => onRolesChange('customer', event.target.checked)} /><span><StaticText source={"Kunde"} /></span></label><label className="shipment-tracking-policy__checkbox"><input type="checkbox" checked={form.businessPartnerRoles?.includes('carrier')} onChange={(event) => onRolesChange('carrier', event.target.checked)} /><span><StaticText source={"Unternehmer"} /></span></label></div>}{errors.references && <p className="form-error form-grid__wide">{errors.references}</p>}</>
  if (section === 'companyData') return <><Field className="form-field--company-vat" label="USt-IdNr." name="companyData.vatId" value={form.companyData.vatId} onChange={onChange} /><Field className="form-field--company-tax" label="Steuernummer" name="companyData.taxNumber" value={form.companyData.taxNumber} onChange={onChange} /><Field className="form-field--company-register-number" label="Handelsregisternummer" name="companyData.commercialRegisterNumber" value={form.companyData.commercialRegisterNumber} onChange={onChange} /><Field className="form-field--company-register-court" label="Registergericht" name="companyData.registerCourt" value={form.companyData.registerCourt} onChange={onChange} /></>
  return <><TranslatedProps sources={{"label":"Zahlungsziel","placeholder":"z. B. 30 Tage Netto"}}><Field label="Zahlungsziel" name="paymentTermDays" value={form.paymentTermDays} onChange={onChange} error={errors.paymentTermDays} placeholder="z. B. 30 Tage Netto" /></TranslatedProps><label className="form-field"><span><StaticText source={"Gutschriftverfahren"} /></span><select name="creditNoteProcedure" value={String(form.creditNoteProcedure)} onChange={onChange}><option value="false"><StaticText source={"Nein"} /></option><option value="true"><StaticText source={"Ja"} /></option></select></label></>
}

function MasterDataEditModal({ section, form, errors, onChange, onClose, onApply, saving }) {
  const { title, className } = masterDataSections[section]
  return createPortal(<div className="masterdata-edit-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}><section className="masterdata-edit-modal" role="dialog" aria-modal="true" aria-labelledby="masterdata-edit-modal-title"><div className="masterdata-edit-modal__heading"><h2 id="masterdata-edit-modal-title">{title} <StaticText source={"bearbeiten"} /></h2><TranslatedProps sources={{"aria-label":"Dialog schließen"}}><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={saving}><CloseIcon /></button></TranslatedProps></div><div className={`form-grid masterdata-edit-modal__fields ${className}`}><MasterDataFields section={section} form={form} onChange={onChange} errors={errors} /></div><div className="masterdata-edit-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}><StaticText source={"Abbrechen"} /></button><button className="button" type="button" onClick={onApply} disabled={saving}>{<StaticText source={saving ? 'Wird gespeichert …' : 'Speichern'} />}</button></div></section></div>, document.body)
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
      <div className="contacts-section__header"><h2><StaticText source={"Ansprechpartner"} /></h2>{!adding && <button className="button button--secondary" type="button" onClick={startNewContact} disabled={saving}><StaticText source={"Hinzufügen"} /></button>}</div>
      <div className="contacts-table table-frame"><table className="data-table"><thead><tr><th>Name</th><th><StaticText source={"Abteilung"} /></th><th><StaticText source={"Telefon"} /></th><th><StaticText source={"Mobil"} /></th><th><StaticText source={"E-Mail"} /></th><th><span className="sr-only"><StaticText source={"Aktion"} /></span></th></tr></thead><tbody>{contacts.length ? contacts.map((contact) => {
        const isEditing = draft?.id === contact.id
        return <tr key={contact.id} className={isEditing ? 'contacts-table__row--editing' : ''}>
          <td>{isEditing ? <input aria-label="Name" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} aria-invalid={Boolean(editErrors.name)} title={editErrors.name} /> : <strong>{contact.name}</strong>}</td>
          <td>{isEditing ? <TranslatedProps sources={{"aria-label":"Abteilung"}}><select aria-label="Abteilung" value={draft.department} onChange={(event) => updateDraft('department', event.target.value)} aria-invalid={Boolean(editErrors.department)} title={editErrors.department}><option value=""><StaticText source={"Auswählen"} /></option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></TranslatedProps> : displayDepartment(contact)}</td>
          <td>{isEditing ? <TranslatedProps sources={{"aria-label":"Telefon"}}><input aria-label="Telefon" type="tel" value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} /></TranslatedProps> : contact.phone || '—'}</td>
          <td>{isEditing ? <TranslatedProps sources={{"aria-label":"Mobil"}}><input aria-label="Mobil" type="tel" value={draft.mobile} onChange={(event) => updateDraft('mobile', event.target.value)} /></TranslatedProps> : contact.mobile || '—'}</td>
          <td>{isEditing ? <TranslatedProps sources={{"aria-label":"E-Mail"}}><input aria-label="E-Mail" type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} aria-invalid={Boolean(editErrors.email)} title={editErrors.email} /></TranslatedProps> : contact.email ? <span className="copy-email-value"><span>{contact.email}</span><TranslatedProps sources={{"label":"E-Mail"}}><CopyValueButton value={contact.email} label="E-Mail" /></TranslatedProps></span> : '—'}</td>
          <td className="contacts-table__action"><div className="contact-actions contact-actions--icons">{isEditing ? <><TranslatedProps sources={{"title":"Speichern","aria-label":"Ansprechpartner speichern"}}><button className="contact-actions__save" type="button" onClick={saveDraft} title="Speichern" aria-label="Ansprechpartner speichern" disabled={saving}><CheckIcon /></button></TranslatedProps><TranslatedProps sources={{"title":"Abbrechen","aria-label":"Bearbeitung abbrechen"}}><button type="button" onClick={() => onDraftChange(null)} title="Abbrechen" aria-label="Bearbeitung abbrechen" disabled={saving}><CloseIcon /></button></TranslatedProps></> : <><TranslatedProps sources={{"title":"Bearbeiten","aria-label":"Ansprechpartner bearbeiten"}}><button type="button" onClick={() => startEdit(contact)} title="Bearbeiten" aria-label="Ansprechpartner bearbeiten" disabled={saving}><EditIcon /></button></TranslatedProps><TranslatedProps sources={{"title":"Entfernen","aria-label":"Ansprechpartner entfernen"}}><button type="button" onClick={() => removeContact(contact.id)} title="Entfernen" aria-label="Ansprechpartner entfernen" disabled={saving}><TrashIcon /></button></TranslatedProps></>}</div></td>
        </tr>
      }) : null}{adding && <tr className="contacts-table__row--new"><td><TranslatedProps sources={{"aria-label":"Name des neuen Ansprechpartners"}}><input aria-label="Name des neuen Ansprechpartners" value={newContact.name} onChange={(event) => updateNewContact('name', event.target.value)} aria-invalid={Boolean(newErrors.name)} title={newErrors.name} disabled={saving} /></TranslatedProps></td><td><TranslatedProps sources={{"aria-label":"Abteilung des neuen Ansprechpartners"}}><select aria-label="Abteilung des neuen Ansprechpartners" value={newContact.department} onChange={(event) => updateNewContact('department', event.target.value)} aria-invalid={Boolean(newErrors.department)} title={newErrors.department} disabled={saving}><option value=""><StaticText source={"Auswählen"} /></option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></TranslatedProps></td><td><TranslatedProps sources={{"aria-label":"Telefon des neuen Ansprechpartners"}}><input aria-label="Telefon des neuen Ansprechpartners" type="tel" value={newContact.phone} onChange={(event) => updateNewContact('phone', event.target.value)} disabled={saving} /></TranslatedProps></td><td><TranslatedProps sources={{"aria-label":"Mobil des neuen Ansprechpartners"}}><input aria-label="Mobil des neuen Ansprechpartners" type="tel" value={newContact.mobile} onChange={(event) => updateNewContact('mobile', event.target.value)} disabled={saving} /></TranslatedProps></td><td><TranslatedProps sources={{"aria-label":"E-Mail des neuen Ansprechpartners"}}><input aria-label="E-Mail des neuen Ansprechpartners" type="email" value={newContact.email} onChange={(event) => updateNewContact('email', event.target.value)} aria-invalid={Boolean(newErrors.email)} title={newErrors.email} disabled={saving} /></TranslatedProps></td><td className="contacts-table__action"><div className="contact-actions contact-actions--icons"><TranslatedProps sources={{"title":"Speichern","aria-label":"Neuen Ansprechpartner speichern"}}><button className="contact-actions__save" type="button" onClick={saveNewContact} title="Speichern" aria-label="Neuen Ansprechpartner speichern" disabled={saving}><CheckIcon /></button></TranslatedProps><TranslatedProps sources={{"title":"Abbrechen","aria-label":"Neue Ansprechpartner-Eingaben verwerfen"}}><button type="button" onClick={cancelNewContact} title="Abbrechen" aria-label="Neue Ansprechpartner-Eingaben verwerfen" disabled={saving}><CloseIcon /></button></TranslatedProps></div></td></tr>}</tbody></table></div>
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
      <div className="portals-section__header"><h2><StaticText source={"Zugänge auf Kundenportalen"} /></h2>{!adding && <button className="button button--secondary" type="button" onClick={startNewPortal} disabled={saving}><StaticText source={"Hinzufügen"} /></button>}</div>
      <div className="portals-table table-frame"><table className="data-table"><thead><tr><th>Link</th><th><StaticText source={"Benutzer / Mail"} /></th><th><StaticText source={"Zugangsnummer"} /></th><th><span className="sr-only"><StaticText source={"Aktion"} /></span></th></tr></thead><tbody>{portals.length ? portals.map((portal) => {
        const isEditing = editDraft?.id === portal.id
        return <tr key={portal.id} className={isEditing ? 'portals-table__row--editing' : ''}>
          <td>{isEditing ? <TranslatedProps sources={{"placeholder":"https://"}}><input aria-label="Link" value={editDraft.url} onChange={(event) => updateEditDraft('url', event.target.value)} aria-invalid={Boolean(editErrors.url)} title={editErrors.url} placeholder="https://" /></TranslatedProps> : portal.url ? <span className="copy-email-value"><a className="portal-link" href={portal.url} target="_blank" rel="noreferrer">{portal.url}</a><CopyValueButton value={portal.url} label="Link" /></span> : '—'}</td>
          <td>{isEditing ? <TranslatedProps sources={{"aria-label":"Benutzer oder Mail"}}><input aria-label="Benutzer oder Mail" value={editDraft.username} onChange={(event) => updateEditDraft('username', event.target.value)} autoComplete="username" /></TranslatedProps> : portal.username ? <span className="copy-email-value"><span>{portal.username}</span><TranslatedProps sources={{"label":"Benutzer oder Mail"}}><CopyValueButton value={portal.username} label="Benutzer oder Mail" /></TranslatedProps></span> : '—'}</td>
          <td>{isEditing ? <TranslatedProps sources={{"aria-label":"Zugangsnummer"}}><input aria-label="Zugangsnummer" value={editDraft.accessNumber} onChange={(event) => updateEditDraft('accessNumber', event.target.value)} /></TranslatedProps> : portal.accessNumber ? <span className="copy-email-value"><span>{portal.accessNumber}</span><TranslatedProps sources={{"label":"Zugangsnummer"}}><CopyValueButton value={portal.accessNumber} label="Zugangsnummer" /></TranslatedProps></span> : '—'}</td>
          <td className="portals-table__action"><div className="contact-actions contact-actions--icons">{isEditing ? <><TranslatedProps sources={{"title":"Speichern","aria-label":"Zugang speichern"}}><button className="contact-actions__save" type="button" onClick={saveEditDraft} title="Speichern" aria-label="Zugang speichern" disabled={saving}><CheckIcon /></button></TranslatedProps><TranslatedProps sources={{"title":"Abbrechen","aria-label":"Bearbeitung abbrechen"}}><button type="button" onClick={() => setEditDraft(null)} title="Abbrechen" aria-label="Bearbeitung abbrechen" disabled={saving}><CloseIcon /></button></TranslatedProps></> : <><TranslatedProps sources={{"title":"Bearbeiten","aria-label":"Zugang bearbeiten"}}><button type="button" onClick={() => startEdit(portal)} title="Bearbeiten" aria-label="Zugang bearbeiten" disabled={saving}><EditIcon /></button></TranslatedProps><TranslatedProps sources={{"title":"Entfernen","aria-label":"Zugang entfernen"}}><button type="button" onClick={() => removePortal(portal.id)} title="Entfernen" aria-label="Zugang entfernen" disabled={saving}><TrashIcon /></button></TranslatedProps></>}</div></td>
        </tr>
      }) : null}{adding && <tr className="portals-table__row--new"><td><TranslatedProps sources={{"aria-label":"Link des neuen Zugangs","placeholder":"https://"}}><input aria-label="Link des neuen Zugangs" value={newPortal.url} onChange={(event) => updateNewPortal('url', event.target.value)} aria-invalid={Boolean(newErrors.url)} title={newErrors.url} placeholder="https://" disabled={saving} /></TranslatedProps></td><td><TranslatedProps sources={{"aria-label":"Benutzer oder Mail des neuen Zugangs"}}><input aria-label="Benutzer oder Mail des neuen Zugangs" value={newPortal.username} onChange={(event) => updateNewPortal('username', event.target.value)} autoComplete="username" disabled={saving} /></TranslatedProps></td><td><TranslatedProps sources={{"aria-label":"Zugangsnummer des neuen Zugangs"}}><input aria-label="Zugangsnummer des neuen Zugangs" value={newPortal.accessNumber} onChange={(event) => updateNewPortal('accessNumber', event.target.value)} disabled={saving} /></TranslatedProps></td><td className="portals-table__action"><div className="contact-actions contact-actions--icons"><TranslatedProps sources={{"title":"Speichern","aria-label":"Neuen Zugang speichern"}}><button className="contact-actions__save" type="button" onClick={saveNewPortal} title="Speichern" aria-label="Neuen Zugang speichern" disabled={saving}><CheckIcon /></button></TranslatedProps><TranslatedProps sources={{"title":"Abbrechen","aria-label":"Neue Zugangseingaben verwerfen"}}><button type="button" onClick={cancelNewPortal} title="Abbrechen" aria-label="Neue Zugangseingaben verwerfen" disabled={saving}><CloseIcon /></button></TranslatedProps></div></td></tr>}</tbody></table></div>
    </section>
  )
}

export default function BusinessPartnerForm({ initialValue, isNew = false, onSubmit, onDirtyChange, onFormChange, formId, readOnly = false, saving = false, canViewArchivedPartner = false, canMerge = false, onMergeSeparated, ruleCatalog }) {
  const [form, setForm] = useState(() => normalizeForm(initialValue))
  const [savedForm, setSavedForm] = useState(() => normalizeForm(initialValue))
  const [contactDraft, setContactDraft] = useState(null)
  const [errors, setErrors] = useState({})
  const [editingSection, setEditingSection] = useState(null)
  const [sectionDraft, setSectionDraft] = useState(null)
  const [sectionErrors, setSectionErrors] = useState({})
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [showNumbers, setShowNumbers] = useState(false)

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

  function handleRoleChange(role, enabled) {
    const roles = new Set(form.businessPartnerRoles || [])
    if (enabled) roles.add(role)
    else roles.delete(role)
    const nextForm = { ...form, businessPartnerRoles: [...roles] }
    // Show the central defaults already while a new partner is being entered.
    // Persisting still goes through the same default helper, so imports and
    // manual creation cannot diverge.
    if (isNew && enabled) {
      const defaults = newShipmentTrackingPartnerPolicy(nextForm, ruleCatalog)
      const current = normalizeShipmentTrackingPolicy(nextForm.shipmentTrackingPolicy)
      nextForm.shipmentTrackingPolicy = {
        customer: role === 'customer' ? defaults.customer : current.customer,
        carrier: role === 'carrier' ? defaults.carrier : current.carrier,
      }
    }
    updateForm(nextForm)
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
    if (section === 'contact' && values.contact.email.trim() && !validateEmail(values.contact.email)) nextErrors['contact.email'] = 'Bitte eine gültige E-Mail-Adresse eingeben.'
    if (section === 'contact' && values.contact.website.trim() && !validateWebsite(values.contact.website)) nextErrors['contact.website'] = 'Bitte eine vollständige Website-Adresse eingeben.'
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
    <CopyFeedbackContext.Provider value={() => setCopyFeedback(true)}>
      {copyFeedback && <Toast message="Kopiert" onDismiss={() => setCopyFeedback(false)} />}
      <form id={formId} className="business-partner-form" onSubmit={handleSubmit} noValidate><fieldset disabled={readOnly} className="business-partner-form__fieldset">
      {displayOnlyMasterData ? <ReadOnlySection section="company" form={form} onEdit={readOnly ? null : () => openSectionEditor('company')} /> : <TranslatedProps sources={{"title":"Unternehmen & Anschrift"}}><FormSection title="Unternehmen & Anschrift" className="form-grid--company-address"><MasterDataFields section="company" form={form} onChange={handleChange} errors={errors} /></FormSection></TranslatedProps>}

      <div className="masterdata-half-grid">
        <div className="masterdata-half-grid__column">
          {displayOnlyMasterData ? <ReadOnlySection section="contact" form={form} onEdit={readOnly ? null : () => openSectionEditor('contact')} /> : <TranslatedProps sources={{"title":"Allgemeiner Kontakt"}}><FormSection title="Allgemeiner Kontakt" className="form-grid--contact"><MasterDataFields section="contact" form={form} onChange={handleChange} errors={errors} /></FormSection></TranslatedProps>}
          {displayOnlyMasterData ? <ReadOnlySection section="companyData" form={form} onEdit={readOnly ? null : () => openSectionEditor('companyData')} /> : <TranslatedProps sources={{"title":"Unternehmensdaten"}}><FormSection title="Unternehmensdaten" className="form-grid--company-data"><MasterDataFields section="companyData" form={form} onChange={handleChange} errors={errors} /></FormSection></TranslatedProps>}
        </div>

        <div className="masterdata-half-grid__column">
          {displayOnlyMasterData ? <ReadOnlySection section="references" form={form} onEdit={readOnly ? null : () => openSectionEditor('references')} onShowNumbers={() => setShowNumbers(true)} /> : <TranslatedProps sources={{"title":"Referenzen & Nummern"}}><FormSection title="Referenzen & Nummern" className="form-grid--references"><MasterDataFields section="references" form={form} onChange={handleChange} onRolesChange={handleRoleChange} errors={errors} /></FormSection></TranslatedProps>}
          {displayOnlyMasterData ? <ReadOnlySection section="billing" form={form} onEdit={readOnly ? null : () => openSectionEditor('billing')} /> : <TranslatedProps sources={{"title":"Abrechnung"}}><FormSection title="Abrechnung" className="form-grid--billing"><MasterDataFields section="billing" form={form} onChange={handleChange} errors={errors} /></FormSection></TranslatedProps>}
        </div>
      </div>

      <ContactsSection contacts={form.contacts} onChange={updateContacts} draft={contactDraft} onDraftChange={setContactDraft} saving={saving} />
      {errors.contacts && <p className="form-error">{errors.contacts}</p>}
      <PortalsSection portals={form.portals} onChange={updatePortals} saving={saving} />
      <ShipmentTrackingPolicyCard key={`${form.debtorNumber}-${form.creditorNumber}-${JSON.stringify(form.dycosReferences || {})}-${JSON.stringify(form.shipmentTrackingPolicy)}-${JSON.stringify(ruleCatalog)}`} partner={form} policy={form.shipmentTrackingPolicy} ruleCatalog={ruleCatalog} readOnly={readOnly} saving={saving} onSave={(shipmentTrackingPolicy) => persistChanges({ ...form, shipmentTrackingPolicy })} />
      </fieldset>{editingSection && sectionDraft && <MasterDataEditModal section={editingSection} form={sectionDraft} errors={sectionErrors} onChange={handleSectionChange} onClose={closeSectionEditor} onApply={applySectionChanges} saving={saving} />}{showNumbers && <PartnerNumbersModal partner={form} onClose={() => setShowNumbers(false)} canViewArchivedPartner={canViewArchivedPartner} canMerge={canMerge} onSeparated={onMergeSeparated} />}</form>
    </CopyFeedbackContext.Provider>
  )
}
