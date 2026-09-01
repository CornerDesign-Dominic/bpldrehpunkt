import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PALLET_ACCOUNT_FILTERS } from '../../constants/pallets.js'
import { getBusinessPartnerType, listBusinessPartners } from '../../lib/businessPartners.js'
import { isPalletMovementForPartner, listAllPalletClosings, listAllPalletMovements, summarizePalletAccount } from '../../lib/palletAccounts.js'
import { formatPalletDate, formatPalletNumber } from './palletFormatters.js'

function matchesFilter(partner, filter) {
  if (filter === 'all') return true
  const type = getBusinessPartnerType(partner)
  return (filter === 'customer' && type === 'Kunde') || (filter === 'supplier' && type === 'Unternehmer') || (filter === 'both' && type === 'Kunde & Unternehmer')
}

function formatClosing(closing) {
  return closing ? `${formatPalletDate(closing.date)} · ${formatPalletNumber(closing.newBalance, true)}` : '—'
}

export default function PalletAccountList() {
  const [partners, setPartners] = useState([])
  const [movements, setMovements] = useState([])
  const [closings, setClosings] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [partnerError, setPartnerError] = useState('')
  const [accountError, setAccountError] = useState('')

  useEffect(() => {
    listBusinessPartners().then(setPartners).catch(() => setPartnerError('Die Palettenkontoübersicht konnte nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.')).finally(() => setLoading(false))
    Promise.all([listAllPalletMovements(), listAllPalletClosings()]).then(([loadedMovements, loadedClosings]) => { setMovements(loadedMovements); setClosings(loadedClosings) }).catch(() => setAccountError('Palettenbuchungen konnten nicht geladen werden.'))
  }, [])

  const accountsByPartner = useMemo(() => partners.map((partner) => ({
    partner,
    account: summarizePalletAccount(movements.filter((movement) => isPalletMovementForPartner(movement, partner.id)), closings.filter((closing) => closing.partnerId === partner.id), partner.id),
  })), [closings, movements, partners])

  const visibleAccounts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    return accountsByPartner.filter(({ partner }) => matchesFilter(partner, filter) && (!term || [partner.companyName, partner.shortName, partner.address?.city, partner.debtorNumber, partner.creditorNumber].some((value) => value?.toLocaleLowerCase('de-DE').includes(term))))
  }, [accountsByPartner, filter, search])

  return <div className="pallets-page">
    <div className="list-toolbar pallets-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only">Palettenkonto suchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Geschäftspartner suchen" type="search" /></label><label className="filter-field"><span className="sr-only">Partnerfilter</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{PALLET_ACCOUNT_FILTERS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label></div></div>
    {partnerError && <p className="form-error">{partnerError}</p>}
    {accountError && <p className="form-error">{accountError}</p>}
    <div className="table-frame pallets-table-frame"><table><thead><tr><th>Firmenname</th><th>Typ</th><th>Ort</th><th>DyCoS Debitor</th><th>DyCoS Kreditor</th><th>Gesamt Eingang</th><th>Gesamt Ausgang</th><th>Aktueller Saldo</th><th>Letzter Kontoabschluss</th><th>Öffnen</th></tr></thead><tbody>{loading ? <tr><td colSpan="10" className="table-state">Palettenkonten werden geladen …</td></tr> : partnerError ? <tr><td colSpan="10" className="table-state">Keine Geschäftspartner verfügbar.</td></tr> : visibleAccounts.length ? visibleAccounts.map(({ partner, account }) => <tr key={partner.id}><td><strong>{partner.companyName}</strong>{partner.shortName && <span className="table-subline">{partner.shortName}</span>}</td><td>{getBusinessPartnerType(partner)}</td><td>{partner.address?.city || '—'}</td><td>{partner.debtorNumber || '—'}</td><td>{partner.creditorNumber || '—'}</td><td>{accountError ? '—' : formatPalletNumber(account.totalIncoming)}</td><td>{accountError ? '—' : formatPalletNumber(account.totalOutgoing)}</td><td>{accountError ? '—' : formatPalletNumber(account.balance, true)}</td><td>{accountError ? '—' : formatClosing(account.latestClosing)}</td><td className="table-action"><Link to={`/paletten/${partner.id}`}>Öffnen</Link></td></tr>) : <tr><td colSpan="10" className="table-state">Keine Geschäftspartner gefunden.</td></tr>}</tbody></table></div>
  </div>
}
