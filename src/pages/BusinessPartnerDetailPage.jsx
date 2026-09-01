import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getBusinessPartner, getBusinessPartnerType } from '../lib/businessPartners.js'
import Toast from '../components/ui/Toast.jsx'

function DetailSection({ title, children }) {
  return <section className="detail-section"><h2>{title}</h2><dl>{children}</dl></section>
}

function Detail({ label, value }) {
  return <div><dt>{label}</dt><dd>{value || '—'}</dd></div>
}

export default function BusinessPartnerDetailPage() {
  const { partnerId } = useParams()
  const location = useLocation()
  const [toast, setToast] = useState(location.state?.toast ?? '')
  const [partner, setPartner] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getBusinessPartner(partnerId)
      .then((result) => { setPartner(result); if (!result) setError('Der Geschäftspartner wurde nicht gefunden.') })
      .catch(() => setError('Die Stammdaten konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [partnerId])

  if (loading) return <p className="page-state">Stammdaten werden geladen …</p>
  if (!partner) return <section className="page-state page-state--error"><p>{error}</p><Link className="button button--secondary" to="/kunden-unternehmer">Zur Übersicht</Link></section>

  return (
    <div className="detail-page">
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
      <header className="detail-header"><div><p className="page-kicker">Geschäftspartner</p><h2>{partner.companyName}</h2><div className="detail-header__meta"><span>{getBusinessPartnerType(partner)}</span><span className={`status-badge status-badge--${partner.status}`}>{partner.status === 'active' ? 'Aktiv' : 'Inaktiv'}</span></div></div><Link className="button" to={`/kunden-unternehmer/${partner.id}/bearbeiten`}>Bearbeiten</Link></header>
      <div className="detail-grid">
        <DetailSection title="Identifikation"><Detail label="Kurzname" value={partner.shortName} /><Detail label="Debitorennummer" value={partner.debtorNumber} /><Detail label="Kreditorennummer" value={partner.creditorNumber} /><Detail label="TIMOCOM-Nummer" value={partner.timocomNumber} /><Detail label="Trans.eu-Nummer" value={partner.transeuNumber} /></DetailSection>
        <DetailSection title="Anschrift"><Detail label="Straße" value={[partner.address?.street, partner.address?.houseNumber].filter(Boolean).join(' ')} /><Detail label="PLZ / Ort" value={[partner.address?.postalCode, partner.address?.city].filter(Boolean).join(' ')} /><Detail label="Land" value={partner.address?.country} /></DetailSection>
        <DetailSection title="Kontakt"><Detail label="Telefon" value={partner.contact?.phone} /><Detail label="E-Mail" value={partner.contact?.email} /><Detail label="Website" value={partner.contact?.website} /></DetailSection>
        <DetailSection title="Unternehmensdaten"><Detail label="USt-IdNr." value={partner.companyData?.vatId} /><Detail label="Handelsregisternummer" value={partner.companyData?.commercialRegisterNumber} /><Detail label="Registergericht" value={partner.companyData?.registerCourt} /></DetailSection>
      </div>
    </div>
  )
}
