import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CrmActivityPanel from '../components/crm/CrmActivityPanel.jsx'
import CrmRatingPanel from '../components/crm/CrmRatingPanel.jsx'
import { getBusinessPartner, getBusinessPartnerType } from '../lib/businessPartners.js'

const detailSections = [
  { title: 'Kennzahlen', items: ['Umsatz', 'Auftragsanzahl', 'Marge', 'Durchschnittlicher Auftragsertrag', 'Auftragsentwicklung'] },
  { title: 'Bonität / Kredit', items: ['Kreditlimit', 'Aktueller offener Betrag', 'Zahlungsverhalten', 'Zahlungsziel', 'Bonität'] },
  { title: 'CRM-Informationen', items: ['CRM-Status', 'Potenzial', 'Betreuung', 'Letzte Aktivität', 'Nächste Wiedervorlage'] },
]

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
      <div className="crm-detail-sections">{detailSections.map(({ title, items }) => <section className="crm-detail-section" key={title}><h3>{title}</h3><dl>{items.map((item) => <div key={item}><dt>{item}</dt><dd>—</dd></div>)}</dl></section>)}</div>
      <CrmRatingPanel key={partnerId} partner={partner} partnerId={partnerId} />
      <CrmActivityPanel partnerId={partnerId} />
    </div>
  )
}
