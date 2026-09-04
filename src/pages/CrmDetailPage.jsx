import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import CrmActivityPanel from '../components/crm/CrmActivityPanel.jsx'
import PartnerHistoryPanel from '../components/crm/PartnerHistoryPanel.jsx'
import CrmRatingPanel from '../components/crm/CrmRatingPanel.jsx'
import { getBusinessPartner, getBusinessPartnerStatusLabel, getBusinessPartnerType, updateBusinessPartnerCreditLimit, updateBusinessPartnerCrmFields } from '../lib/businessPartners.js'
import { getHistoryActor } from '../lib/partnerHistory.js'
import { getPartnerEvaluationStatus, PARTNER_EVALUATION_STATUS_LABELS } from '../lib/partnerEvaluation.js'
import { usePartnerEvaluationSettings } from '../partner-evaluation/usePartnerEvaluationSettings.js'
import '../styles/businessPartnerExtensions.css'

function formatCreditLimit(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
}

function CreditLimitEditor({ partnerId, value, actor, onSaved, canEdit, settings }) {
  const [creditLimit, setCreditLimit] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      await updateBusinessPartnerCreditLimit(partnerId, creditLimit, actor)
      onSaved(creditLimit === '' ? null : Number(creditLimit))
    } catch {
      setError('Kreditlimit konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  const status = getPartnerEvaluationStatus('creditLimit', value, settings)
  return <section className="crm-current-card crm-credit-limit-editor"><div><h3>Kreditlimit / Bonität</h3><p>Aktuelles Kreditlimit: <strong data-status={status}>{formatCreditLimit(value)}</strong> <span className="partner-evaluation-label" data-status={status}>{PARTNER_EVALUATION_STATUS_LABELS[status]}</span></p></div>{canEdit && <div className="crm-credit-limit-editor__control"><label className="form-field"><span>Kreditlimit in €</span><input type="number" min="0" step="0.01" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} /></label><button className="button" type="button" onClick={save} disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>}{error && <p className="form-error">{error}</p>}</section>
}

function CrmStatusEditor({ partnerId, partner, actor, onSaved, canEdit }) {
  const [crmStatus, setCrmStatus] = useState(partner.crmStatus ?? '')
  const [potential, setPotential] = useState(partner.potential ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      await updateBusinessPartnerCrmFields(partnerId, { crmStatus, potential }, actor)
      onSaved({ crmStatus, potential })
    } catch {
      setError('CRM-Informationen konnten nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="crm-current-card crm-status-editor"><div><h3>CRM-Status &amp; Potenzial</h3><p>Aktueller Vertriebsstand dieses Geschäftspartners.</p></div>{canEdit && <div className="crm-status-editor__control"><label className="form-field"><span>CRM-Status</span><select value={crmStatus} onChange={(event) => setCrmStatus(event.target.value)}><option value="">Nicht festgelegt</option><option value="Neu">Neu</option><option value="In Betreuung">In Betreuung</option><option value="Aktiv">Aktiv</option><option value="Ruht">Ruht</option></select></label><label className="form-field"><span>Potenzial</span><select value={potential} onChange={(event) => setPotential(event.target.value)}><option value="">Nicht festgelegt</option><option value="Niedrig">Niedrig</option><option value="Mittel">Mittel</option><option value="Hoch">Hoch</option></select></label><button className="button" type="button" onClick={save} disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>}{error && <p className="form-error">{error}</p>}</section>
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
    getBusinessPartner(partnerId)
      .then((partner) => { if (isCurrent) setResult({ partner, error: partner ? '' : 'Geschäftspartner nicht gefunden.' }) })
      .catch(() => { if (isCurrent) setResult({ partner: null, error: 'Geschäftspartner nicht gefunden.' }) })
    return () => { isCurrent = false }
  }, [partnerId])

  if (!result) return <p className="page-state">Geschäftspartner wird geladen …</p>
  if (result.error) return <section className="crm-empty-state crm-empty-state--error"><h3>{result.error}</h3><Link className="button button--secondary" to="/crm">Zurück zum CRM</Link></section>

  const { partner } = result
  const actor = getHistoryActor(authState)
  const refreshHistory = () => setHistoryVersion((current) => current + 1)

  return <div className="crm-detail-page">
    <header className="crm-detail-header"><div><h2>{partner.companyName}</h2><div className="crm-detail-header__meta"><span>{getBusinessPartnerType(partner)}</span><span>{partner.address?.city || '—'}</span><span>DyCoS-Debitor: {partner.debtorNumber || '—'}</span><span>DyCoS-Kreditor: {partner.creditorNumber || '—'}</span><span className={`status-badge status-badge--${partner.status}`}>{getBusinessPartnerStatusLabel(partner.status)}</span></div></div><div className="crm-detail-header__actions"><Link className="button button--secondary" to="/crm">Zurück zum CRM</Link><Link className="button button--secondary" to={`/kunden-unternehmer/${partnerId}`}>Zu den Stammdaten</Link></div></header>
    <section className="crm-current-overview" aria-label="Aktueller Stand">
      <div className="crm-current-overview__heading"><h3>Aktueller Stand</h3><span>Historische Änderungen stehen ausschließlich in der Partner-Historie.</span></div>
      <div className="crm-current-metrics"><div><span>Kennzahlen</span><strong>—</strong></div><div><span>Zahlungsziel</span><strong>{partner.paymentTermDays ?? '—'}{partner.paymentTermDays === null || partner.paymentTermDays === undefined ? '' : ' Tage'}</strong></div><div><span>Bonität</span><strong>—</strong></div></div>
      <CreditLimitEditor key={`credit-${partner.creditLimit}`} partnerId={partnerId} value={partner.creditLimit} actor={actor} canEdit={canEdit('crm')} settings={settings} onSaved={(creditLimit) => { setResult((current) => ({ ...current, partner: { ...current.partner, creditLimit } })); refreshHistory() }} />
      <CrmStatusEditor key={`crm-${partner.crmStatus}-${partner.potential}`} partnerId={partnerId} partner={partner} actor={actor} canEdit={canEdit('crm')} onSaved={(changes) => { setResult((current) => ({ ...current, partner: { ...current.partner, ...changes } })); refreshHistory() }} />
    </section>
    <CrmRatingPanel partner={partner} partnerId={partnerId} onSaved={refreshHistory} canEdit={canEdit('crm')} />
    <CrmActivityPanel partnerId={partnerId} onSaved={refreshHistory} canEdit={canEdit('crm')} />
    <PartnerHistoryPanel partnerId={partnerId} refreshKey={historyVersion} />
  </div>
}
