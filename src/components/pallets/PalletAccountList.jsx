import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronIcon } from '../icons.jsx'
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
  return closing?.date ? formatPalletDate(closing.date) : '—'
}

const textCollator = new Intl.Collator('de-DE', { numeric: true, sensitivity: 'base' })

function getSortValue({ partner, account }, key) {
  if (key === 'companyName') return partner.companyName ?? ''
  if (key === 'city') return partner.address?.city ?? ''
  if (key === 'debtorNumber') return partner.debtorNumber ? Number(partner.debtorNumber) : null
  if (key === 'creditorNumber') return partner.creditorNumber ? Number(partner.creditorNumber) : null
  if (key === 'balance') return account.balance
  return account.latestClosing?.date ?? ''
}

function sortAccounts(accounts, sort) {
  return [...accounts].sort((first, second) => {
    const firstValue = getSortValue(first, sort.key)
    const secondValue = getSortValue(second, sort.key)
    const firstIsEmpty = firstValue === '' || firstValue === null
    const secondIsEmpty = secondValue === '' || secondValue === null
    if (firstIsEmpty || secondIsEmpty) {
      if (firstIsEmpty && secondIsEmpty) return textCollator.compare(first.partner.companyName ?? '', second.partner.companyName ?? '')
      return firstIsEmpty ? 1 : -1
    }
    const result = typeof firstValue === 'number' ? firstValue - secondValue : textCollator.compare(firstValue, secondValue)
    return sort.direction === 'asc' ? result : result * -1
  })
}

export default function PalletAccountList() {
  const [partners, setPartners] = useState([])
  const [movements, setMovements] = useState([])
  const [closings, setClosings] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'companyName', direction: 'asc' })
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
    const filteredAccounts = accountsByPartner.filter(({ partner }) => matchesFilter(partner, filter) && (!term || [partner.companyName, partner.shortName, partner.address?.city, partner.debtorNumber, partner.creditorNumber].some((value) => value?.toLocaleLowerCase('de-DE').includes(term))))
    return sortAccounts(filteredAccounts, sort)
  }, [accountsByPartner, filter, search, sort])

  function toggleSort(key) {
    setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  }

  function resetFilters() {
    setSearch('')
    setFilter('all')
  }

  function renderSortableHeader(key, label) {
    const isActive = sort.key === key
    const direction = isActive ? sort.direction : 'none'
    return <th aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}><button className="table-sort-button" type="button" onClick={() => toggleSort(key)}><span>{label}</span><span className="table-sort-button__indicator" data-direction={direction} aria-hidden="true" /><span className="sr-only">{isActive ? `, aktuell ${sort.direction === 'asc' ? 'aufsteigend' : 'absteigend'} sortiert` : ', sortieren'}</span></button></th>
  }

  const hasActiveFilters = Boolean(search.trim()) || filter !== 'all'

  return <div className="pallets-page">
    <div className="list-toolbar pallets-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only">Palettenkonto suchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Geschäftspartner suchen" type="search" /></label><label className="filter-field"><span className="sr-only">Partnerfilter</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{PALLET_ACCOUNT_FILTERS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label></div><button className="button button--secondary" type="button" onClick={resetFilters} disabled={!hasActiveFilters}>Filter zurücksetzen</button></div>
    {partnerError && <p className="form-error">{partnerError}</p>}
    {accountError && <p className="form-error">{accountError}</p>}
    <div className="table-frame pallets-table-frame"><table><thead><tr>{renderSortableHeader('companyName', 'Firmenname')}{renderSortableHeader('city', 'Ort')}{renderSortableHeader('debtorNumber', 'Debitor')}{renderSortableHeader('creditorNumber', 'Kreditor')}{renderSortableHeader('balance', 'Saldo')}{renderSortableHeader('closingDate', 'Letzter Kontoabschluss')}<th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{loading ? <tr><td colSpan="7" className="table-state">Palettenkonten werden geladen …</td></tr> : partnerError ? <tr><td colSpan="7" className="table-state">Keine Geschäftspartner verfügbar.</td></tr> : visibleAccounts.length ? visibleAccounts.map(({ partner, account }) => <tr key={partner.id}><td><strong>{partner.companyName}</strong>{partner.shortName && <span className="table-subline">{partner.shortName}</span>}</td><td>{partner.address?.city || '—'}</td><td>{partner.debtorNumber || '—'}</td><td>{partner.creditorNumber || '—'}</td><td>{accountError ? '—' : formatPalletNumber(account.balance, true)}</td><td>{accountError ? '—' : formatClosing(account.latestClosing)}</td><td className="table-action"><Link className="table-action__open" to={`/paletten/${partner.id}`} aria-label={`${partner.companyName} öffnen`} title="Öffnen">Öffnen <ChevronIcon size={13} /></Link></td></tr>) : <tr><td colSpan="7" className="table-state">Keine Geschäftspartner gefunden.</td></tr>}</tbody></table></div>
  </div>
}
