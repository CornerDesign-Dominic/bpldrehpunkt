import { StaticText } from '../../i18n/AutoTranslate.jsx'
export default function PalletAccountPartnerCard({ partner, mergedPartners = [] }) {
  const address = [partner.address?.street, partner.address?.houseNumber].filter(Boolean).join(' ') || '—'
  const location = [partner.address?.postalCode, partner.address?.city].filter(Boolean).join(' ') || '—'

  return <section className="pallet-account-partner-card">
    <h2>{partner.companyName}</h2>
    <div className="pallet-account-partner-card__meta"><span>{address}</span><span>{location}</span><span>{partner.address?.country || '—'}</span><span><StaticText source={"DyCoS-Debitor:"} /> {partner.debtorNumber || '—'}</span><span><StaticText source={"DyCoS-Kreditor:"} /> {partner.creditorNumber || '—'}</span></div>
    {mergedPartners.length > 0 && <p className="pallet-account-partner-card__merge-note"><StaticText source={"Zusammengeführtes Konto · historische Zuordnungen bleiben erhalten:"} /> {mergedPartners.map((member) => member.companyName || member.id).join(', ')}</p>}
  </section>
}
