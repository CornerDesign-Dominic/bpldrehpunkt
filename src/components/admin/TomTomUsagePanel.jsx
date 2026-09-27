import { useEffect, useState } from 'react'
import { getTomTomUsageSummary } from '../../lib/transportOrders.js'

function monthValue(offset) {
  const date = new Date()
  date.setMonth(date.getMonth() - offset)
  return date.toISOString().slice(0, 7)
}
const monthFormatter = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })

export default function TomTomUsagePanel() {
  const [month, setMonth] = useState(monthValue(0))
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    getTomTomUsageSummary(month).then((result) => { if (current) { setUsage(result); setError('') } }).catch(() => { if (current) { setUsage(null); setError('Die TomTom-Nutzung konnte nicht geladen werden.') } })
    return () => { current = false }
  }, [month])
  const monthOptions = Array.from({ length: 12 }, (_, index) => monthValue(index))
  return <section className="admin-panel tomtom-usage-panel"><div className="admin-panel__heading"><div><h2>TomTom-Nutzung</h2><p>Anzeige basiert auf dem Drehpunkt-Nutzungsprotokoll. Das TomTom-Dashboard bleibt die externe Abrechnungsreferenz.</p></div><label className="tomtom-usage-panel__month"><span>Monat</span><select value={month} onChange={(event) => setMonth(event.target.value)}>{monthOptions.map((value) => <option key={value} value={value}>{monthFormatter.format(new Date(`${value}-01T12:00:00`))}</option>)}</select></label></div>{error ? <p className="form-error">{error}</p> : !usage ? <p>TomTom-Nutzung wird geladen …</p> : <dl className="tomtom-usage-panel__metrics"><div><dt>Manuelle Streckenberechnungen</dt><dd>{usage.manualCalculations}</dd></div><div><dt>Routing API</dt><dd>{usage.routingRequests} / {usage.monthlyFreeQuota.toLocaleString('de-DE')}</dd></div><div><dt>Geocoding API</dt><dd>{usage.geocodingRequests} / {usage.monthlyFreeQuota.toLocaleString('de-DE')}</dd></div><div><dt>Erfolgreich / fehlgeschlagen</dt><dd>{usage.succeededRequests} / {usage.failedRequests}</dd></div></dl>}<small className="tomtom-usage-panel__note">Auswertung für {monthFormatter.format(new Date(`${month}-01T12:00:00`))}.</small></section>
}
