export default function PalletAccountPartnerCard({ partner }) {
  const address = [partner.address?.street, partner.address?.houseNumber].filter(Boolean).join(' ') || '—'
  const location = [partner.address?.postalCode, partner.address?.city].filter(Boolean).join(' ') || '—'

  return <section className="pallet-account-partner-card">
    <h2>{partner.companyName}</h2>
    <div className="pallet-account-partner-card__meta"><span>{address}</span><span>{location}</span><span>{partner.address?.country || '—'}</span><span>DyCoS-Debitor: {partner.debtorNumber || '—'}</span><span>DyCoS-Kreditor: {partner.creditorNumber || '—'}</span></div>
  </section>
}
