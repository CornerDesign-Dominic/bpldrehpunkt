import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronIcon } from '../components/icons.jsx'
import { BUSINESS_PARTNER_STATUSES, getBusinessPartnerStatusLabel, getBusinessPartnerType, listBusinessPartners } from '../lib/businessPartners.js'
import Toast from '../components/ui/Toast.jsx'
import { usePermissions } from '../auth/usePermissions.js'

const filters = [
  { value: 'all', label: 'Alle' },
  { value: 'customer', label: 'Kunden' },
  { value: 'supplier', label: 'Unternehmer' },
  { value: 'both', label: 'Kunde & Unternehmer' },
  ...BUSINESS_PARTNER_STATUSES,
]

function matchesFilter(partner, filter) {
  if (filter === 'all') return true
  if (BUSINESS_PARTNER_STATUSES.some((status) => status.value === filter)) return partner.status === filter
  const type = getBusinessPartnerType(partner)
  return (filter === 'customer' && type === 'Kunde') || (filter === 'supplier' && type === 'Unternehmer') || (filter === 'both' && type === 'Kunde & Unternehmer')
}

const textCollator = new Intl.Collator('de-DE', { numeric: true, sensitivity: 'base' })

function getSortValue(partner, key) {
  if (key === 'companyName') return partner.companyName ?? ''
  if (key === 'city') return partner.address?.city ?? ''
  if (key === 'type') return getBusinessPartnerType(partner)
  if (key === 'status') return getBusinessPartnerStatusLabel(partner.status)
  if (key === 'debtorNumber' || key === 'creditorNumber') return partner[key] ? Number(partner[key]) : null
  return partner[key] ?? ''
}

function sortPartners(partners, sort) {
  return [...partners].sort((first, second) => {
    const firstValue = getSortValue(first, sort.key)
    const secondValue = getSortValue(second, sort.key)
    const firstIsEmpty = firstValue === '' || firstValue === null || Number.isNaN(firstValue)
    const secondIsEmpty = secondValue === '' || secondValue === null || Number.isNaN(secondValue)
    if (firstIsEmpty || secondIsEmpty) {
      if (firstIsEmpty && secondIsEmpty) return textCollator.compare(first.companyName ?? '', second.companyName ?? '')
      return firstIsEmpty ? 1 : -1
    }
    const result = typeof firstValue === 'number' ? firstValue - secondValue : textCollator.compare(firstValue, secondValue)
    return sort.direction === 'asc' ? result : result * -1
  })
}

export default function CustomersPage() {
  const { canEdit } = usePermissions()
  const [partners, setPartners] = useState([])
  const location = useLocation()
  const [toast, setToast] = useState(location.state?.toast ?? '')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'companyName', direction: 'asc' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listBusinessPartners().then(setPartners).catch(() => setError('Die Liste konnte nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.')).finally(() => setLoading(false))
  }, [])

  const visiblePartners = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    const filteredPartners = partners.filter((partner) => matchesFilter(partner, filter) && (!term || [partner.companyName, partner.shortName, partner.address?.city, partner.debtorNumber, partner.creditorNumber, partner.timocomNumber, partner.transeuNumber].some((value) => value?.toLocaleLowerCase('de-DE').includes(term))))
    return sortPartners(filteredPartners, sort)
  }, [filter, partners, search, sort])

  function toggleSort(key) {
    setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  }

  function renderSortableHeader(key, label) {
    const isActive = sort.key === key
    const direction = isActive ? sort.direction : 'none'
    return <th aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}><button className="table-sort-button" type="button" onClick={() => toggleSort(key)}><span>{label}</span><span className="table-sort-button__indicator" data-direction={direction} aria-hidden="true" /><span className="sr-only">{isActive ? `, aktuell ${sort.direction === 'asc' ? 'aufsteigend' : 'absteigend'} sortiert` : ', sortieren'}</span></button></th>
  }

  return (
    <div className="business-partners-page">
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
      <div className="list-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only">Geschäftspartner suchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Suchen" type="search" /></label><label className="filter-field"><span className="sr-only">Filter</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label></div>{canEdit('masterData') && <Link className="button" to="/kunden-unternehmer/neu">Geschäftspartner anlegen</Link>}</div>
      {error && <p className="form-error">{error}</p>}
      <div className="table-frame business-partners-table-frame"><table><thead><tr>{renderSortableHeader('companyName', 'Firmenname')}{renderSortableHeader('city', 'Ort')}{renderSortableHeader('type', 'Typ')}{renderSortableHeader('debtorNumber', 'Debitor')}{renderSortableHeader('creditorNumber', 'Kreditor')}{renderSortableHeader('timocomNumber', 'TIMOCOM')}{renderSortableHeader('transeuNumber', 'Trans.eu')}{renderSortableHeader('status', 'Status')}<th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{loading ? <tr><td colSpan="9" className="table-state">Stammdaten werden geladen …</td></tr> : error ? <tr><td colSpan="9" className="table-state">Keine Stammdaten verfügbar.</td></tr> : visiblePartners.length ? visiblePartners.map((partner) => <tr key={partner.id}><td><strong>{partner.companyName}</strong>{partner.shortName && <span className="table-subline">{partner.shortName}</span>}</td><td>{partner.address?.city || '—'}</td><td>{getBusinessPartnerType(partner)}</td><td>{partner.debtorNumber || '—'}</td><td>{partner.creditorNumber || '—'}</td><td>{partner.timocomNumber || '—'}</td><td>{partner.transeuNumber || '—'}</td><td><span className={`status-badge status-badge--${partner.status}`}>{getBusinessPartnerStatusLabel(partner.status)}</span></td><td className="table-action"><Link className="table-action__open" to={`/kunden-unternehmer/${partner.id}`} aria-label={`${partner.companyName} öffnen`} title="Öffnen">Öffnen <ChevronIcon size={13} /></Link></td></tr>) : <tr><td colSpan="9" className="table-state">Keine Geschäftspartner gefunden.</td></tr>}</tbody></table></div>
    </div>
  )
}
