import { Link } from 'react-router-dom'
import { formatLastPalletClosing, formatPalletNumber } from './palletFormatters.js'

export default function PalletAccountHeader({ account, accountError, onAddClosing, onAddMovement, partnerId }) {
  return <>
    <header className="pallet-account-header">
      <div className="pallet-account-header__actions"><button className="button" type="button" onClick={onAddMovement}>Bewegung hinzufügen</button><button className="button button--secondary" type="button" onClick={onAddClosing}>Abschluss hinzufügen</button><Link className="button button--secondary" to="/paletten">Zurück zur Übersicht</Link><Link className="button button--secondary" to={`/kunden-unternehmer/${partnerId}`}>Zu den Stammdaten</Link></div>
    </header>
    <section className="pallet-account-summary"><div><span>Aktueller Palettensaldo</span><strong>{accountError ? '—' : formatPalletNumber(account.balance, true)}</strong></div><div><span>Letzter Kontoabschluss</span><strong>{accountError ? '—' : formatLastPalletClosing(account.latestClosing)}</strong></div></section>
  </>
}
