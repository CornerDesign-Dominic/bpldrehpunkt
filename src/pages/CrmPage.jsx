import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBusinessPartnerType, listBusinessPartners } from '../lib/businessPartners.js'

const filters = [
  { value: 'all', label: 'Alle' },
  { value: 'customer', label: 'Kunden' },
  { value: 'supplier', label: 'Unternehmer' },
  { value: 'both', label: 'Kunde & Unternehmer' },
  { value: 'active', label: 'Aktiv' },
  { value: 'inactive', label: 'Inaktiv' },
]

function matchesFilter(partner, filter) {
  if (filter === 'all') return true
  if (filter === 'active' || filter === 'inactive') return partner.status === filter

  const type = getBusinessPartnerType(partner)
  return (filter === 'customer' && type === 'Kunde') || (filter === 'supplier' && type === 'Unternehmer') || (filter === 'both' && type === 'Kunde & Unternehmer')
}

export default function CrmPage() {
  const [partners, setPartners] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listBusinessPartners().then(setPartners).catch(() => setError('Die CRM-Partnerübersicht konnte nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.')).finally(() => setLoading(false))
  }, [])

  const visiblePartners = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    return partners.filter((partner) => matchesFilter(partner, filter) && (!term || [partner.companyName, partner.shortName, partner.address?.city, partner.debtorNumber, partner.creditorNumber].some((value) => value?.toLocaleLowerCase('de-DE').includes(term))))
  }, [filter, partners, search])

  return (
    <div className="crm-page">
      <header className="list-page-heading"><div><h2>Customer Relationship Management (CRM)</h2><p>Geschäftspartnerübersicht</p></div></header>
      <div className="list-toolbar crm-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only">CRM-Partner suchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Geschäftspartner suchen" type="search" /></label><label className="filter-field"><span className="sr-only">CRM-Filter</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label></div></div>
      {error && <p className="form-error">{error}</p>}
      <div className="table-frame crm-table-frame"><table><thead><tr><th>Firmenname</th><th>Typ</th><th>Ort</th><th>Debitor</th><th>Kreditor</th><th>CRM-Status</th><th>Bewertung</th><th>Potenzial</th><th>Öffnen</th></tr></thead><tbody>{loading ? <tr><td colSpan="9" className="table-state">CRM-Partner werden geladen …</td></tr> : error ? <tr><td colSpan="9" className="table-state">Keine Geschäftspartner verfügbar.</td></tr> : visiblePartners.length ? visiblePartners.map((partner) => <tr key={partner.id}><td><strong>{partner.companyName}</strong>{partner.shortName && <span className="table-subline">{partner.shortName}</span>}</td><td>{getBusinessPartnerType(partner)}</td><td>{partner.address?.city || '—'}</td><td>{partner.debtorNumber || '—'}</td><td>{partner.creditorNumber || '—'}</td><td>Nicht bewertet</td><td>—</td><td>—</td><td className="table-action"><Link to={`/crm/${partner.id}`}>Öffnen</Link></td></tr>) : <tr><td colSpan="9" className="table-state">Keine Geschäftspartner gefunden.</td></tr>}</tbody></table></div>
    </div>
  )
}
