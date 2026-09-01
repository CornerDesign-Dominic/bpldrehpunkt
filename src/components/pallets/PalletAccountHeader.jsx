import { Link } from 'react-router-dom'
import { getBusinessPartnerType } from '../../lib/businessPartners.js'
import { formatLastPalletClosing, formatPalletNumber } from './palletFormatters.js'

export default function PalletAccountHeader({ account, accountError, onAddClosing, onAddMovement, partner, partnerId }) {
  const address = [partner.address?.street, partner.address?.houseNumber].filter(Boolean).join(' ') || '—'
  const location = [partner.address?.postalCode, partner.address?.city].filter(Boolean).join(' ') || '—'

  return <>
    <header className="pallet-account-header">
      <div><h2>{partner.companyName}</h2><div className="pallet-account-header__meta"><span>{getBusinessPartnerType(partner)}</span><span>{address}</span><span>{location}</span><span>{partner.address?.country || '—'}</span><span>DyCoS-Debitor: {partner.debtorNumber || '—'}</span><span>DyCoS-Kreditor: {partner.creditorNumber || '—'}</span></div></div>
      <div className="pallet-account-header__actions"><button className="button" type="button" onClick={onAddMovement}>Bewegung hinzufügen</button><button className="button button--secondary" type="button" onClick={onAddClosing}>Abschluss hinzufügen</button><Link className="button button--secondary" to="/paletten">Zurück zur Übersicht</Link><Link className="button button--secondary" to={`/kunden-unternehmer/${partnerId}`}>Zu den Stammdaten</Link></div>
    </header>
    <section className="pallet-account-summary"><div><span>Aktueller Palettensaldo</span><strong>{accountError ? '—' : formatPalletNumber(account.balance, true)}</strong></div><div><span>Letzter Kontoabschluss</span><strong>{accountError ? '—' : formatLastPalletClosing(account.latestClosing)}</strong></div></section>
  </>
}
