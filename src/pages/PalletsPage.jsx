import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBusinessPartnerType, listBusinessPartners } from '../lib/businessPartners.js'
import { listAllPalletClosings, listAllPalletMovements, summarizePalletAccount } from '../lib/palletAccounts.js'

const filters = [
  { value: 'all', label: 'Alle' },
  { value: 'customer', label: 'Kunden' },
  { value: 'supplier', label: 'Unternehmer' },
  { value: 'both', label: 'Kunde & Unternehmer' },
]

function matchesFilter(partner, filter) {
  if (filter === 'all') return true
  const type = getBusinessPartnerType(partner)
  return (filter === 'customer' && type === 'Kunde') || (filter === 'supplier' && type === 'Unternehmer') || (filter === 'both' && type === 'Kunde & Unternehmer')
}

function formatNumber(value, withSign = false) {
  const number = Number(value) || 0
  return `${withSign && number > 0 ? '+' : ''}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(number)}`
}

function formatClosing(closing) {
  if (!closing) return '—'
  return `${new Intl.DateTimeFormat('de-DE').format(new Date(`${closing.date}T00:00:00`))} · ${formatNumber(closing.newBalance, true)}`
}

export default function PalletsPage() {
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
    account: summarizePalletAccount(movements.filter((movement) => movement.partnerId === partner.id), closings.filter((closing) => closing.partnerId === partner.id)),
  })), [closings, movements, partners])

  const visibleAccounts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    return accountsByPartner.filter(({ partner }) => matchesFilter(partner, filter) && (!term || [partner.companyName, partner.shortName, partner.address?.city, partner.debtorNumber, partner.creditorNumber].some((value) => value?.toLocaleLowerCase('de-DE').includes(term))))
  }, [accountsByPartner, filter, search])

  return (
    <div className="pallets-page">
      <header className="list-page-heading"><div><h2>Palettenmanagement</h2><p>Palettenkonten und Bewegungen</p></div></header>
      <div className="list-toolbar pallets-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only">Palettenkonto suchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Geschäftspartner suchen" type="search" /></label><label className="filter-field"><span className="sr-only">Partnerfilter</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label></div></div>
      {partnerError && <p className="form-error">{partnerError}</p>}
      {accountError && <p className="form-error">{accountError}</p>}
      <div className="table-frame pallets-table-frame"><table><thead><tr><th>Firmenname</th><th>Typ</th><th>Ort</th><th>DyCoS Debitor</th><th>DyCoS Kreditor</th><th>Gesamt Eingang</th><th>Gesamt Ausgang</th><th>Aktueller Saldo</th><th>Letzter Kontoabschluss</th><th>Öffnen</th></tr></thead><tbody>{loading ? <tr><td colSpan="10" className="table-state">Palettenkonten werden geladen …</td></tr> : partnerError ? <tr><td colSpan="10" className="table-state">Keine Geschäftspartner verfügbar.</td></tr> : visibleAccounts.length ? visibleAccounts.map(({ partner, account }) => <tr key={partner.id}><td><strong>{partner.companyName}</strong>{partner.shortName && <span className="table-subline">{partner.shortName}</span>}</td><td>{getBusinessPartnerType(partner)}</td><td>{partner.address?.city || '—'}</td><td>{partner.debtorNumber || '—'}</td><td>{partner.creditorNumber || '—'}</td><td>{accountError ? '—' : formatNumber(account.totalIncoming)}</td><td>{accountError ? '—' : formatNumber(account.totalOutgoing)}</td><td>{accountError ? '—' : formatNumber(account.balance, true)}</td><td>{accountError ? '—' : formatClosing(account.latestClosing)}</td><td className="table-action"><Link to={`/paletten/${partner.id}`}>Öffnen</Link></td></tr>) : <tr><td colSpan="10" className="table-state">Keine Geschäftspartner gefunden.</td></tr>}</tbody></table></div>
    </div>
  )
}
