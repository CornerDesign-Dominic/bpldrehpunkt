import { useEffect, useState } from 'react'
import { listTimeWorkspace, minutesLabel, timeError } from '../../lib/timeTracking.js'

// A deliberately reduced server projection: Personnel rights do not grant
// access to stamp events, correction history, work models or manager actions.
export default function PersonnelTimeAccount({ userId, year }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    listTimeWorkspace({ userId, personnelOnly: true, from: `${year}-01-01`, to: `${year}-12-31` })
      .then(value => { if (active) setData(value) })
      .catch(failure => { if (active) setError(timeError(failure)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, year, refresh])
  const debits = (data?.days || []).filter(day => day.overtimeDebitMinutes > 0)
  return <section className="personnel-detail__card">
    <div className="personnel-detail__card-heading"><h2>Zeitkonto und Überstundenabbau</h2><button type="button" className="button button--secondary" disabled={loading} onClick={() => { setLoading(true); setData(null); setError(''); setRefresh(value => value + 1) }}>Aktualisieren</button></div>
    {loading && <p role="status">Zeitkonto wird geladen …</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {data && <>
      <dl className="personnel-vacation-summary"><div><dt>Zeitkonto gesamt</dt><dd>{minutesLabel(data.balanceMinutes, true)} Std.</dd><small>{data.balanceProvisional ? 'Vorläufig: unvollständige Tage oder Arbeitszeitmodelle.' : `Seit ${data.account?.startDate || '—'}`}</small></div><div><dt>Überstundenabbau {year}</dt><dd>{minutesLabel(debits.reduce((sum, day) => sum + day.overtimeDebitMinutes, 0))} Std.</dd><small>Genehmigte freie Tage, getrennt vom Urlaubsanspruch.</small></div></dl>
      {debits.length ? <div className="personnel-table-wrap"><table className="personnel-table"><thead><tr><th>Datum</th><th>Abzug vom Zeitkonto</th><th>Zugehörige Anträge</th></tr></thead><tbody>{debits.map(day => <tr key={day.date}><td>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}</td><td>−{minutesLabel(day.overtimeDebitMinutes)} Std.{day.calculationIncomplete && ' (vorläufig)'}</td><td>{(day.overtimeRequestIds || []).join(', ')}</td></tr>)}</tbody></table></div> : <p>Kein genehmigter Überstundenabbau in diesem Jahr.</p>}
    </>}
  </section>
}
