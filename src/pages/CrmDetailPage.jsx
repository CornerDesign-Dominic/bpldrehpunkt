import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import BackLink from '../components/ui/BackLink.jsx'
import CrmActivityPanel from '../components/crm/CrmActivityPanel.jsx'
import PartnerHistoryPanel from '../components/crm/PartnerHistoryPanel.jsx'
import CrmRatingPanel from '../components/crm/CrmRatingPanel.jsx'
import CrmEditModal from '../components/crm/CrmEditModal.jsx'
import { EditIcon } from '../components/icons.jsx'
import { getEffectiveBusinessPartner, getBusinessPartnerStatusLabel, getBusinessPartnerType, updateBusinessPartnerCrmFields } from '../lib/businessPartners.js'
import { businessPartnerDetailPath } from '../lib/businessPartnerLinks.js'
import { getHistoryActor } from '../lib/partnerHistory.js'
import { paymentTermText } from '../lib/paymentTerms.js'
import { crmIndustryValue } from '../lib/crmIndustry.js'
import { getPartnerEvaluationStatus, PARTNER_EVALUATION_STATUS_LABELS } from '../lib/partnerEvaluation.js'
import { usePartnerEvaluationSettings } from '../partner-evaluation/usePartnerEvaluationSettings.js'
import '../styles/businessPartnerExtensions.css'

function formatCreditLimit(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
}

function formatPartnerAddress(address = {}) {
  return [
    [address?.street, address?.houseNumber].filter(Boolean).join(' '),
    [[address?.postalCode, address?.city].filter(Boolean).join(' '), address?.country].filter(Boolean).join(' · '),
  ].filter(Boolean)
}

function CrmIndustryEditor({ partnerId, companyName, industry, actor, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(industry)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function close() {
    setDraft(industry)
    setError('')
    setEditing(false)
  }

  async function save(event) {
    event.preventDefault()
    const crmIndustry = draft.trim()
    if (crmIndustry === industry || saving) return
    setSaving(true)
    setError('')
    try {
      await updateBusinessPartnerCrmFields(partnerId, { crmIndustry }, actor)
      onSaved(crmIndustry)
      setEditing(false)
    } catch {
      setError('Die Branche konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <TranslatedProps sources={{"aria-label":"Branche bearbeiten","title":"Branche bearbeiten"}}><button type="button" className="crm-current-card__edit crm-detail-header__edit" onClick={() => { setDraft(industry); setEditing(true) }} aria-label="Branche bearbeiten" title="Branche bearbeiten"><EditIcon size={15} /></button></TranslatedProps>
    {editing && <TranslatedProps sources={{"title":"Branche bearbeiten"}}><CrmEditModal title="Branche bearbeiten" description={companyName} onClose={close} onSubmit={save} saving={saving} changed={draft.trim() !== industry} error={error}>
      <label className="form-field"><span><StaticText source={"Branche"} /></span><TranslatedProps sources={{"placeholder":"z. B. Transport und Logistik"}}><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={120} placeholder="z. B. Transport und Logistik" disabled={saving} /></TranslatedProps></label>
    </CrmEditModal></TranslatedProps>}
  </>
}

function CreditLimitEditor({ partnerId, partner, actor, onSaved, canEditCredit, canEditPayment, settings }) {
  const value = partner.creditLimit
  const status = getPartnerEvaluationStatus('creditLimit', value, settings)
  const [creditLimit, setCreditLimit] = useState(value ?? '')
  const [paymentTerm, setPaymentTerm] = useState(paymentTermText(partner))
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const creditChanged = canEditCredit && (creditLimit === '' ? null : Number(creditLimit)) !== (value ?? null)
  const paymentChanged = canEditPayment && paymentTerm.trim() !== paymentTermText(partner)
  const changed = creditChanged || paymentChanged

  function close() {
    setCreditLimit(value ?? '')
    setPaymentTerm(paymentTermText(partner))
    setError('')
    setEditing(false)
  }

  async function save(event) {
    event.preventDefault()
    if (!changed || saving) return
    setSaving(true)
    setError('')
    try {
      const changes = {}
      if (creditChanged) changes.creditLimit = creditLimit === '' ? null : Number(creditLimit)
      if (paymentChanged) changes.paymentTermDays = paymentTerm.trim()
      await updateBusinessPartnerCrmFields(partnerId, changes, actor)
      onSaved(changes)
      setEditing(false)
    } catch {
      setError('Finanzangaben konnten nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return <TranslatedProps sources={{"aria-label":"Finanzen"}}><section className="crm-current-card crm-credit-limit-editor" aria-label="Finanzen">
    <div className="crm-current-card__heading"><h4><StaticText source={"Finanzen"} /></h4>{(canEditCredit || canEditPayment) && <TranslatedProps sources={{"aria-label":"Finanzangaben bearbeiten","title":"Finanzangaben bearbeiten"}}><button type="button" className="crm-current-card__edit" onClick={() => setEditing(true)} aria-label="Finanzangaben bearbeiten" title="Finanzangaben bearbeiten"><EditIcon size={16} /></button></TranslatedProps>}</div>
    <dl className="crm-current-card__values"><div><dt><StaticText source={"Kreditlimit"} /></dt><dd data-empty={value == null} data-status={status}>{<StaticText source={value == null ? 'Nicht hinterlegt' : formatCreditLimit(value)} />}</dd>{value != null && <small className="partner-evaluation-label" data-status={status}>{PARTNER_EVALUATION_STATUS_LABELS[status]}</small>}</div><div><dt><StaticText source={"Zahlungsziel"} /></dt><dd data-empty={!paymentTermText(partner)}>{paymentTermText(partner) || <StaticText source={"Nicht hinterlegt"} />}</dd></div></dl>
    {editing && <TranslatedProps sources={{"title":"Finanzen bearbeiten"}}><CrmEditModal title="Finanzen bearbeiten" description={partner.companyName} onClose={close} onSubmit={save} saving={saving} changed={changed} error={error}>
      {canEditCredit ? <label className="form-field"><span><StaticText source={"Kreditlimit in €"} /></span><input type="number" min="0" step="0.01" inputMode="decimal" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} disabled={saving} /></label> : <div className="crm-edit-modal__readonly"><span><StaticText source={"Kreditlimit"} /></span><strong>{<StaticText source={value == null ? 'Nicht hinterlegt' : formatCreditLimit(value)} />}</strong></div>}
      {canEditPayment ? <label className="form-field"><span><StaticText source={"Zahlungsziel"} /></span><TranslatedProps sources={{"placeholder":"z. B. 30 Tage netto"}}><input value={paymentTerm} onChange={(event) => setPaymentTerm(event.target.value)} placeholder="z. B. 30 Tage netto" disabled={saving} /></TranslatedProps></label> : <div className="crm-edit-modal__readonly"><span><StaticText source={"Zahlungsziel"} /></span><strong>{paymentTermText(partner) || <StaticText source={"Nicht hinterlegt"} />}</strong><small><StaticText source={"Änderungen erfordern die Berechtigung für Stammdaten."} /></small></div>}
    </CrmEditModal></TranslatedProps>}
  </section></TranslatedProps>
}

function CrmStatusEditor({ partnerId, partner, actor, onSaved, canEdit }) {
  const [crmStatus, setCrmStatus] = useState(partner.crmStatus ?? '')
  const [potential, setPotential] = useState(partner.potential ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const changed = crmStatus !== (partner.crmStatus ?? '') || potential !== (partner.potential ?? '')

  function close() {
    setCrmStatus(partner.crmStatus ?? '')
    setPotential(partner.potential ?? '')
    setError('')
    setEditing(false)
  }

  async function save(event) {
    event.preventDefault()
    if (!changed || saving) return
    setSaving(true)
    setError('')
    try {
      await updateBusinessPartnerCrmFields(partnerId, { crmStatus, potential }, actor)
      onSaved({ crmStatus, potential })
      setEditing(false)
    } catch {
      setError('CRM-Informationen konnten nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return <TranslatedProps sources={{"aria-label":"Vertrieb"}}><section className="crm-current-card crm-status-editor" aria-label="Vertrieb">
    <div className="crm-current-card__heading"><h4><StaticText source={"Vertrieb"} /></h4>{canEdit && <TranslatedProps sources={{"aria-label":"Vertriebsangaben bearbeiten","title":"Vertriebsangaben bearbeiten"}}><button type="button" className="crm-current-card__edit" onClick={() => setEditing(true)} aria-label="Vertriebsangaben bearbeiten" title="Vertriebsangaben bearbeiten"><EditIcon size={16} /></button></TranslatedProps>}</div>
    <dl className="crm-current-card__values"><div><dt><StaticText source={"Vertriebsphase"} /></dt><dd data-empty={!partner.crmStatus}>{partner.crmStatus || <StaticText source={"Nicht festgelegt"} />}</dd></div><div><dt><StaticText source={"Potenzial"} /></dt><dd data-empty={!partner.potential}>{partner.potential || <StaticText source={"Nicht festgelegt"} />}</dd></div></dl>
    {editing && <TranslatedProps sources={{"title":"Vertrieb bearbeiten"}}><CrmEditModal title="Vertrieb bearbeiten" description={partner.companyName} onClose={close} onSubmit={save} saving={saving} changed={changed} error={error}>
      <label className="form-field"><span><StaticText source={"Vertriebsphase"} /></span><select value={crmStatus} onChange={(event) => setCrmStatus(event.target.value)} disabled={saving}><option value=""><StaticText source={"Nicht festgelegt"} /></option><option value="Neu"><StaticText source={"Neu"} /></option><option value="In Betreuung"><StaticText source={"In Betreuung"} /></option><option value="Aktiv"><StaticText source={"Aktiv"} /></option><option value="Ruht"><StaticText source={"Ruht"} /></option></select></label>
      <label className="form-field"><span><StaticText source={"Potenzial"} /></span><select value={potential} onChange={(event) => setPotential(event.target.value)} disabled={saving}><option value=""><StaticText source={"Nicht festgelegt"} /></option><option value="Niedrig"><StaticText source={"Niedrig"} /></option><option value="Mittel"><StaticText source={"Mittel"} /></option><option value="Hoch"><StaticText source={"Hoch"} /></option></select></label>
    </CrmEditModal></TranslatedProps>}
  </section></TranslatedProps>
}

export default function CrmDetailPage() {
  const { partnerId } = useParams()
  const authState = useAuth()
  const { canEdit } = usePermissions()
  const { settings } = usePartnerEvaluationSettings()
  const [result, setResult] = useState(null)
  const [historyVersion, setHistoryVersion] = useState(0)

  useEffect(() => {
    let isCurrent = true
    getEffectiveBusinessPartner(partnerId)
      .then((partner) => { if (isCurrent) setResult({ partner, error: partner ? '' : 'Geschäftspartner nicht gefunden.' }) })
      .catch(() => { if (isCurrent) setResult({ partner: null, error: 'Geschäftspartner nicht gefunden.' }) })
    return () => { isCurrent = false }
  }, [partnerId])

  if (!result) return <p className="page-state"><StaticText source={"Geschäftspartner wird geladen …"} /></p>
  if (result.error) return <section className="crm-empty-state crm-empty-state--error"><h3>{result.error}</h3><BackLink to="/crm" /></section>

  const { partner } = result
  const industry = crmIndustryValue(partner)
  const addressLines = formatPartnerAddress(partner.address)
  const hasPartnerNumbers = Boolean(partner.debtorNumber || partner.creditorNumber)
  const actor = getHistoryActor(authState)
  const refreshHistory = () => setHistoryVersion((current) => current + 1)

  return <div className="crm-detail-layout">
    <TranslatedProps sources={{"aria-label":"CRM-Navigation"}}><nav className="crm-detail-navigation" aria-label="CRM-Navigation"><BackLink to="/crm" /><Link className="button button--secondary" to={businessPartnerDetailPath(partner.id)}><StaticText source={"Zum Stammdatenblatt"} /></Link></nav></TranslatedProps>
    <div className="crm-detail-page">
      <header className="crm-detail-header">
        <div className="crm-detail-header__identity">
          <div className="crm-detail-header__title"><h2>{partner.companyName}</h2><span className={`status-badge status-badge--${partner.status}`} aria-label={`Partnerstatus: ${getBusinessPartnerStatusLabel(partner.status)}`}>{getBusinessPartnerStatusLabel(partner.status)}</span></div>
          <p className="crm-detail-header__subtitle">{getBusinessPartnerType(partner)}</p>
        </div>
        <dl className={`crm-detail-header__facts${hasPartnerNumbers ? '' : ' crm-detail-header__facts--two'}`}>
          <div className="crm-detail-header__fact"><dt><StaticText source={"Adresse"} /></dt><dd><address>{addressLines.length ? addressLines.map((line, index) => <span key={index}>{line}</span>) : '—'}</address></dd></div>
          <div className="crm-detail-header__fact"><dt><StaticText source={"Branche"} /></dt><dd className="crm-detail-header__editable-value"><span>{industry || '—'}</span>{canEdit('crm') && <CrmIndustryEditor partnerId={partner.id} companyName={partner.companyName} industry={industry} actor={actor} onSaved={(crmIndustry) => { setResult((current) => ({ ...current, partner: { ...current.partner, crmIndustry } })); refreshHistory() }} />}</dd></div>
          {hasPartnerNumbers && <div className="crm-detail-header__fact"><dt><StaticText source={"Partnernummern"} /></dt><dd className="crm-detail-header__numbers">{partner.debtorNumber && <span><small><StaticText source={"Debitor"} /></small><strong>{partner.debtorNumber}</strong></span>}{partner.creditorNumber && <span><small><StaticText source={"Kreditor"} /></small><strong>{partner.creditorNumber}</strong></span>}</dd></div>}
        </dl>
      </header>
      <TranslatedProps sources={{"aria-label":"Aktueller Stand"}}><section className="crm-current-overview" aria-label="Aktueller Stand">
        <div className="crm-current-overview__heading"><h3><StaticText source={"Aktueller Stand"} /></h3></div>
        <div className="crm-current-overview__cards"><CrmStatusEditor key={`crm-${partner.id}-${partner.crmStatus}-${partner.potential}`} partnerId={partner.id} partner={partner} actor={actor} canEdit={canEdit('crm')} onSaved={(changes) => { setResult((current) => ({ ...current, partner: { ...current.partner, ...changes } })); refreshHistory() }} /><CreditLimitEditor key={`credit-${partner.id}-${partner.creditLimit}-${partner.paymentTermDays}`} partnerId={partner.id} partner={partner} actor={actor} canEditCredit={canEdit('crm')} canEditPayment={canEdit('masterData')} settings={settings} onSaved={(changes) => { setResult((current) => ({ ...current, partner: { ...current.partner, ...changes } })); refreshHistory() }} /></div>
      </section></TranslatedProps>
      <CrmRatingPanel partnerId={partner.id} />
      <CrmActivityPanel partnerId={partner.id} onSaved={refreshHistory} canEdit={canEdit('crm')} />
      <PartnerHistoryPanel partnerId={partner.id} refreshKey={historyVersion} />
    </div>
  </div>
}
