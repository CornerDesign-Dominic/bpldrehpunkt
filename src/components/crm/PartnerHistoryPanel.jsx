import { useEffect, useMemo, useState } from 'react'
import { ACTIVITY_TYPES, listCrmActivities } from '../../lib/crmActivities.js'
import { formatRatingScore, listCrmRatings } from '../../lib/crmRatings.js'
import { listPartnerHistory, PARTNER_HISTORY_CATEGORIES } from '../../lib/partnerHistory.js'

const timestampValue = (value) => value?.toMillis?.() ?? 0

function formatDate(value) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(`${value}T12:00:00`) : value.toDate?.() ?? value
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

function createdAtValue(entry) {
  if (entry.createdAt) return timestampValue(entry.createdAt)
  if (entry.metadata?.date) return new Date(`${entry.metadata.date}T12:00:00`).getTime()
  return 0
}

export default function PartnerHistoryPanel({ partnerId, refreshKey }) {
  const [history, setHistory] = useState([])
  const [legacyActivities, setLegacyActivities] = useState([])
  const [legacyRatings, setLegacyRatings] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const typeLabels = useMemo(() => new Map(ACTIVITY_TYPES.map((item) => [item.value, item.label])), [])

  useEffect(() => {
    let current = true
    Promise.all([listPartnerHistory(partnerId), listCrmActivities(partnerId).catch(() => []), listCrmRatings(partnerId).catch(() => [])])
      .then(([entries, activities, ratings]) => {
        if (!current) return
        setError('')
        setHistory(entries)
        setLegacyActivities(activities)
        setLegacyRatings(ratings)
      })
      .catch(() => { if (current) setError('Die Partner-Historie konnte nicht geladen werden.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [partnerId, refreshKey])

  const entries = [...history, ...legacyActivities.map((activity) => ({
    id: `legacy-${activity.id}`,
    category: 'contact',
    action: 'created',
    summary: `${typeLabels.get(activity.type) || 'Aktivität'}: ${activity.text || '—'}`,
    createdAt: activity.createdAt,
    createdByName: activity.createdByName ?? null,
    metadata: { ...activity, date: activity.date },
  })), ...legacyRatings.filter((rating) => !history.some((entry) => entry.metadata?.ratingId === rating.id)).map((rating) => ({
    id: `legacy-rating-${rating.id}`,
    category: 'rating',
    action: 'created',
    summary: `${rating.role === 'customer' ? 'Kundenbewertung' : 'Unternehmerbewertung'} mit ${formatRatingScore(rating.overallScore)} / 5 hinzugefügt`,
    createdAt: rating.createdAt,
    createdByName: rating.createdByName ?? null,
    metadata: { ...rating, date: rating.date },
  }))]
    .filter((entry) => filter === 'all' || entry.category === filter)
    .sort((left, right) => createdAtValue(right) - createdAtValue(left))

  return <section className="partner-history" aria-label="Partner-Historie">
    <div className="partner-history__heading"><div><h3>Partner-Historie</h3><p>Unveränderbares Protokoll aller relevanten Vorgänge.</p></div><label><span className="sr-only">Historie filtern</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{PARTNER_HISTORY_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label></div>
    <div className="partner-history__table table-frame"><table><thead><tr><th>Datum</th><th>Themenpunkt</th><th>Eintrag von</th><th>Inhalt</th></tr></thead><tbody>
      {loading && <tr><td colSpan="4" className="table-state">Partner-Historie wird geladen …</td></tr>}
      {error && <tr><td colSpan="4" className="table-state">{error}</td></tr>}
      {!loading && !error && entries.length === 0 && <tr><td colSpan="4" className="table-state">Für diese Auswahl gibt es noch keine Einträge.</td></tr>}
      {!loading && !error && entries.map((entry) => <tr key={entry.id}><td><time dateTime={entry.metadata?.date || entry.createdAt?.toDate?.()?.toISOString()}>{formatDate(entry.metadata?.date || entry.createdAt)}</time></td><td>{PARTNER_HISTORY_CATEGORIES.find((category) => category.value === entry.category)?.label ?? entry.category}</td><td>{entry.createdByName || '—'}</td><td>{entry.summary}</td></tr>)}
    </tbody></table></div>
  </section>
}
