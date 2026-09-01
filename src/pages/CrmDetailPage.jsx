import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CrmActivityPanel from '../components/crm/CrmActivityPanel.jsx'
import CrmRatingPanel from '../components/crm/CrmRatingPanel.jsx'
import { getBusinessPartner, getBusinessPartnerType, updateBusinessPartnerCreditLimit } from '../lib/businessPartners.js'
import '../styles/businessPartnerExtensions.css'

const detailSections = [
  { title: 'Kennzahlen', items: ['Umsatz', 'Auftragsanzahl', 'Marge', 'Durchschnittlicher Auftragsertrag', 'Auftragsentwicklung'] },
  { title: 'Bonität / Kredit', items: ['Kreditlimit', 'Aktueller offener Betrag', 'Zahlungsverhalten', 'Zahlungsziel', 'Bonität'] },
  { title: 'CRM-Informationen', items: ['CRM-Status', 'Potenzial', 'Betreuung', 'Letzte Aktivität', 'Nächste Wiedervorlage'] },
]

function formatCreditLimit(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
}

function detailValue(partner, item) {
  if (item === 'Kreditlimit') return formatCreditLimit(partner.creditLimit)
  if (item === 'Zahlungsziel') return partner.paymentTermDays === null || partner.paymentTermDays === undefined ? '—' : `${partner.paymentTermDays} Tage`
  return '—'
}

function CreditLimitEditor({ partnerId, value, onSaved }) {
  const [creditLimit, setCreditLimit] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      await updateBusinessPartnerCreditLimit(partnerId, creditLimit)
      onSaved(creditLimit === '' ? null : Number(creditLimit))
    } catch {
      setError('Kreditlimit konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="crm-credit-limit-editor"><div><h3>Kreditlimit</h3><p>Wird zentral beim Geschäftspartner gespeichert.</p></div><div className="crm-credit-limit-editor__control"><label className="form-field"><span>Kreditlimit in €</span><input type="number" min="0" step="0.01" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} /></label><button className="button" type="button" onClick={save} disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>{error && <p className="form-error">{error}</p>}</section>
}

export default function CrmDetailPage() {
  const { partnerId } = useParams()
  const [result, setResult] = useState(null)

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

  return (
    <div className="crm-detail-page">
      <header className="crm-detail-header">
        <div><h2>{partner.companyName}</h2><div className="crm-detail-header__meta"><span>{getBusinessPartnerType(partner)}</span><span>{partner.address?.city || '—'}</span><span>DyCoS-Debitor: {partner.debtorNumber || '—'}</span><span>DyCoS-Kreditor: {partner.creditorNumber || '—'}</span><span className={`status-badge status-badge--${partner.status}`}>{partner.status === 'active' ? 'Aktiv' : 'Inaktiv'}</span></div></div>
        <div className="crm-detail-header__actions"><Link className="button button--secondary" to="/crm">Zurück zum CRM</Link><Link className="button button--secondary" to={`/kunden-unternehmer/${partnerId}`}>Zu den Stammdaten</Link></div>
      </header>
      <div className="crm-detail-sections">{detailSections.map(({ title, items }) => <section className="crm-detail-section" key={title}><h3>{title}</h3><dl>{items.map((item) => <div key={item}><dt>{item}</dt><dd>{detailValue(partner, item)}</dd></div>)}</dl></section>)}</div>
      <CreditLimitEditor key={partnerId} partnerId={partnerId} value={partner.creditLimit} onSaved={(creditLimit) => setResult((current) => ({ ...current, partner: { ...current.partner, creditLimit } }))} />
      <CrmRatingPanel key={partnerId} partner={partner} partnerId={partnerId} />
      <CrmActivityPanel partnerId={partnerId} />
    </div>
  )
}
