import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BUSINESS_PARTNER_STATUSES, getBusinessPartnerType, listBusinessPartners } from '../lib/businessPartners.js'
import { formatRatingScore, getRatingRoles, listCurrentCrmRatings } from '../lib/crmRatings.js'
import { getPartnerEvaluationStatus } from '../lib/partnerEvaluation.js'
import { usePartnerEvaluationSettings } from '../partner-evaluation/usePartnerEvaluationSettings.js'
import '../styles/businessPartnerExtensions.css'

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

export default function CrmPage() {
  const { settings } = usePartnerEvaluationSettings()
  const [partners, setPartners] = useState([])
  const [ratings, setRatings] = useState({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listBusinessPartners()
      .then((businessPartners) => Promise.all([businessPartners, listCurrentCrmRatings(businessPartners.map((partner) => partner.id))]))
      .then(([businessPartners, currentRatings]) => { setPartners(businessPartners); setRatings(currentRatings) })
      .catch(() => setError('Die CRM-Partnerübersicht konnte nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.'))
      .finally(() => setLoading(false))
  }, [])

  const visiblePartners = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    return partners.filter((partner) => matchesFilter(partner, filter) && (!term || [partner.companyName, partner.shortName, partner.address?.city, partner.debtorNumber, partner.creditorNumber].some((value) => value?.toLocaleLowerCase('de-DE').includes(term))))
  }, [filter, partners, search])

  function ratingLabel(partner) {
    const current = ratings[partner.id]
    if (!current) return <span className="partner-evaluation-value" data-status="neutral">Noch nicht bewertet</span>
    const roles = getRatingRoles(partner)
    if (roles.length === 1) return current[roles[0]] ? <span className="partner-evaluation-value" data-status={getPartnerEvaluationStatus('ranking', current[roles[0]].overallScore, settings)}>{formatRatingScore(current[roles[0]].overallScore)} / 5</span> : <span className="partner-evaluation-value" data-status="neutral">Noch nicht bewertet</span>
    if (!current.customer && !current.carrier) return <span className="partner-evaluation-value" data-status="neutral">Noch nicht bewertet</span>
    return <span className="crm-rating-summary">K: <span className="partner-evaluation-value" data-status={getPartnerEvaluationStatus('ranking', current.customer?.overallScore, settings)}>{current.customer ? formatRatingScore(current.customer.overallScore) : '—'}</span> · U: <span className="partner-evaluation-value" data-status={getPartnerEvaluationStatus('ranking', current.carrier?.overallScore, settings)}>{current.carrier ? formatRatingScore(current.carrier.overallScore) : '—'}</span></span>
  }

  return (
    <div className="crm-page">
      <div className="list-toolbar crm-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only">CRM-Partner suchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Geschäftspartner suchen" type="search" /></label><label className="filter-field"><span className="sr-only">CRM-Filter</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label></div></div>
      {error && <p className="form-error">{error}</p>}
      <div className="table-frame crm-table-frame"><table><thead><tr><th>Firmenname</th><th>Typ</th><th>Ort</th><th>Debitor</th><th>Kreditor</th><th>CRM-Status</th><th>Bewertung</th><th>Potenzial</th><th>Öffnen</th></tr></thead><tbody>{loading ? <tr><td colSpan="9" className="table-state">CRM-Partner werden geladen …</td></tr> : error ? <tr><td colSpan="9" className="table-state">Keine Geschäftspartner verfügbar.</td></tr> : visiblePartners.length ? visiblePartners.map((partner) => <tr key={partner.id}><td><strong>{partner.companyName}</strong>{partner.shortName && <span className="table-subline">{partner.shortName}</span>}</td><td>{getBusinessPartnerType(partner)}</td><td>{partner.address?.city || '—'}</td><td>{partner.debtorNumber || '—'}</td><td>{partner.creditorNumber || '—'}</td><td>Nicht bewertet</td><td>{ratingLabel(partner)}</td><td>—</td><td className="table-action"><Link to={`/crm/${partner.id}`}>Öffnen</Link></td></tr>) : <tr><td colSpan="9" className="table-state">Keine Geschäftspartner gefunden.</td></tr>}</tbody></table></div>
    </div>
  )
}
