import { formatLastPalletClosing, formatPalletNumber } from './palletFormatters.js'

export default function PalletAccountHeader({ account, accountError }) {
  return <section className="pallet-account-summary"><div><span>Aktueller Palettensaldo</span><strong>{accountError ? '—' : formatPalletNumber(account.balance, true)}</strong></div><div><span>Letzter Kontoabschluss</span><strong>{accountError ? '—' : formatLastPalletClosing(account.latestClosing)}</strong></div></section>
}
