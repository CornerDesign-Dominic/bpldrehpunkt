import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BUSINESS_PARTNER_STATUSES, getBusinessPartnerStatusLabel, getBusinessPartnerType, listBusinessPartners } from '../lib/businessPartners.js'
import { crmPartnerPath } from '../lib/businessPartnerLinks.js'
import { listCrmTransportRatingSummaries } from '../lib/transportOrderRatings.js'
import { formatTransportRatingScore } from '../lib/transportOrderRatingPresentation.js'
import '../styles/businessPartnerExtensions.css'

const collator = new Intl.Collator('de-DE', { numeric: true, sensitivity: 'base' })
const ratingOptions = [['all', 'Alle'], ['rated', 'Bewertet'], ['unrated', 'Ohne Bewertung'], ['high', 'Ab 4 ★'], ['low', 'Unter 4 ★']]
const columns = [['companyName', 'Firmenname'], ['type', 'Typ'], ['city', 'Ort'], ['debtorNumber', 'Debitor'], ['creditorNumber', 'Kreditor'], ['status', 'Status'], ['customerRating', '★ KU'], ['carrierRating', '★ UTN'], ['potential', 'Potenzial']]

function ratingMatches(summary, filter) {
  const score = summary?.averageScore
  if (filter === 'all') return true
  if (filter === 'unrated') return score == null
  if (score == null) return false
  if (filter === 'rated') return true
  return filter === 'high' ? score >= 4 : score < 4
}

function sortValue(partner, key, summaries) {
  if (key === 'type') return getBusinessPartnerType(partner)
  if (key === 'city') return partner.address?.city || ''
  if (key === 'status') return getBusinessPartnerStatusLabel(partner.status)
  if (key === 'customerRating' || key === 'carrierRating') return summaries[partner.id]?.[key === 'customerRating' ? 'customer' : 'carrier']?.averageScore ?? null
  if (key === 'debtorNumber' || key === 'creditorNumber') return partner[key] ? Number(partner[key]) : null
  return partner[key] || ''
}

function sortPartners(partners, sort, summaries) {
  return [...partners].sort((first, second) => {
    const left = sortValue(first, sort.key, summaries)
    const right = sortValue(second, sort.key, summaries)
    const leftEmpty = left === '' || left === null || Number.isNaN(left)
    const rightEmpty = right === '' || right === null || Number.isNaN(right)
    if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? collator.compare(first.companyName || '', second.companyName || '') : leftEmpty ? 1 : -1
    const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right))
    return comparison ? comparison * (sort.direction === 'asc' ? 1 : -1) : collator.compare(first.companyName || '', second.companyName || '')
  })
}

export default function CrmPage() {
  const navigate = useNavigate()
  const [partners, setPartners] = useState([])
  const [summaries, setSummaries] = useState({})
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ type: 'all', status: 'all', customer: 'all', carrier: 'all', potential: 'all' })
  const [sort, setSort] = useState({ key: 'companyName', direction: 'asc' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ratingError, setRatingError] = useState('')

  useEffect(() => {
    let current = true
    Promise.allSettled([listBusinessPartners(), listCrmTransportRatingSummaries()]).then(([partnerResult, ratingResult]) => {
      if (!current) return
      if (partnerResult.status === 'fulfilled') setPartners(partnerResult.value.filter((partner) => !partner.mergedIntoPartnerId))
      else setError('Die CRM-Partnerübersicht konnte nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.')
      if (ratingResult.status === 'fulfilled') setSummaries(ratingResult.value)
      else setRatingError('Die Bewertungen konnten nicht geladen werden. Bitte erneut versuchen.')
      setLoading(false)
    })
    return () => { current = false }
  }, [])

  const visiblePartners = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    const filtered = partners.filter((partner) => {
      const type = getBusinessPartnerType(partner)
      if (filters.type !== 'all' && (filters.type === 'customer' ? type !== 'Kunde' : filters.type === 'carrier' ? type !== 'Unternehmer' : type !== 'Kunde & Unternehmer')) return false
      if (filters.status !== 'all' && partner.status !== filters.status) return false
      if (filters.potential !== 'all' && (filters.potential === 'none' ? Boolean(partner.potential) : partner.potential !== filters.potential)) return false
      if (!ratingMatches(summaries[partner.id]?.customer, filters.customer) || !ratingMatches(summaries[partner.id]?.carrier, filters.carrier)) return false
      return !term || [partner.companyName, partner.shortName, partner.address?.city, partner.debtorNumber, partner.creditorNumber].some((value) => String(value || '').toLocaleLowerCase('de-DE').includes(term))
    })
    return sortPartners(filtered, sort, summaries)
  }, [partners, summaries, search, filters, sort])

  function updateFilter(key, value) { setFilters((current) => ({ ...current, [key]: value })) }
  function filterSelect(key, label, options) {
    return <label className="filter-field"><span className="sr-only">{label} filtern</span><select aria-label={`${label} filtern`} value={filters[key]} disabled={Boolean(ratingError) && (key === 'customer' || key === 'carrier')} onChange={(event) => updateFilter(key, event.target.value)}>{options.map(([value, caption]) => <option key={value} value={value}>{caption}</option>)}</select></label>
  }
  function sortableHeader([key, label]) {
    const direction = sort.key === key ? sort.direction : 'none'
    const title = key === 'customerRating' ? 'Bewertung als Kunde' : key === 'carrierRating' ? 'Bewertung als Unternehmer' : undefined
    return <th key={key} aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'} title={title}><button className="table-sort-button" type="button" onClick={() => setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })}><span>{label}</span><span className="table-sort-button__indicator" data-direction={direction} aria-hidden="true" /><span className="sr-only">{direction === 'none' ? ', sortieren' : `, aktuell ${direction === 'asc' ? 'aufsteigend' : 'absteigend'} sortiert`}</span></button></th>
  }
  function ratingCell(summary) {
    return <td className="crm-table__rating" title={summary ? `${summary.count} ${summary.count === 1 ? 'Bewertung' : 'Bewertungen'}` : 'Keine Bewertung'}>{summary?.averageScore == null ? '—' : formatTransportRatingScore(summary.averageScore)}</td>
  }
  function openPartner(partner) { navigate(crmPartnerPath(partner.id)) }
  function handlePartnerKeyDown(event, partner) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openPartner(partner)
  }

  return <div className="crm-page">
    <div className="list-toolbar crm-toolbar"><div className="list-controls crm-list-filters">
      <label className="search-field"><span className="sr-only">CRM-Partner suchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Geschäftspartner suchen" type="search" /></label>
      {filterSelect('type', 'Typ', [['all', 'Alle Typen'], ['customer', 'Kunden'], ['carrier', 'Unternehmer'], ['both', 'Kunde & Unternehmer']])}
      {filterSelect('status', 'Partnerstatus', [['all', 'Alle Status'], ...BUSINESS_PARTNER_STATUSES.map(({ value, label }) => [value, label])])}
      {filterSelect('customer', '★ KU', ratingOptions.map(([value, label]) => [value, `★ KU: ${label}`]))}
      {filterSelect('carrier', '★ UTN', ratingOptions.map(([value, label]) => [value, `★ UTN: ${label}`]))}
      {filterSelect('potential', 'Potenzial', [['all', 'Alle Potenziale'], ['Hoch', 'Hoch'], ['Mittel', 'Mittel'], ['Niedrig', 'Niedrig'], ['none', 'Ohne Potenzial']])}
    </div></div>
    {error && <p className="form-error">{error}</p>}
    {ratingError && <p className="form-error">{ratingError}</p>}
    <div className="crm-table-frame"><table className="data-table crm-table"><thead><tr>{columns.map(sortableHeader)}</tr></thead><tbody>
      {loading ? <tr><td colSpan="9" className="table-state">CRM-Partner werden geladen …</td></tr> : error ? <tr><td colSpan="9" className="table-state">Keine Geschäftspartner verfügbar.</td></tr> : visiblePartners.length ? visiblePartners.map((partner) => <tr className="crm-table__row" key={partner.id} role="link" tabIndex="0" aria-label={`${partner.companyName} öffnen`} onClick={() => openPartner(partner)} onKeyDown={(event) => handlePartnerKeyDown(event, partner)}><td><strong>{partner.companyName}</strong>{partner.shortName && <span className="table-subline">{partner.shortName}</span>}</td><td>{getBusinessPartnerType(partner)}</td><td>{partner.address?.city || '—'}</td><td>{partner.debtorNumber || '—'}</td><td>{partner.creditorNumber || '—'}</td><td><span className={`status-badge status-badge--${partner.status}`}>{getBusinessPartnerStatusLabel(partner.status)}</span></td>{ratingCell(summaries[partner.id]?.customer)}{ratingCell(summaries[partner.id]?.carrier)}<td>{partner.potential || '—'}</td></tr>) : <tr><td colSpan="9" className="table-state">Keine Geschäftspartner gefunden.</td></tr>}
    </tbody></table></div>
  </div>
}
