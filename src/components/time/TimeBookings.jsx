import { useEffect, useState } from 'react'
import { listOwnTimeBookings, formatTime, TIME_ACTIONS, TIME_REASONS, timeError } from '../../lib/timeTracking.js'
import { bookingClient, timeBookingRows } from '../../lib/timeBookingRows.js'

const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
const timestamp = at => at ? new Date(at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : 'Nicht erfasst'
const eventLabel = event => event ? `${formatTime(event.at)} · ${TIME_ACTIONS[event.type] || event.type}` : '—'

export default function TimeBookings() {
  const [page, setPage] = useState({ days: [], history: [], nextBefore: null })
  const [before, setBefore] = useState(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    listOwnTimeBookings(before ? { before } : {}).then(result => {
      if (active) {
        setPage(current => ({ days: before ? [...current.days, ...result.days] : result.days, history: before ? [...current.history, ...result.history] : result.history, nextBefore: result.nextBefore }))
        setError('')
      }
    }).catch(failure => { if (active) setError(timeError(failure)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [before, retry])
  const rows = timeBookingRows(page.days, page.history)
  return <section className="time-card time-table-card">
    <header><div><h3>Alle Buchungen</h3><p className="time-muted">Eine Zeile je Buchung · neueste Tage zuerst · gelöschte Buchungen bleiben nachvollziehbar.</p></div><button type="button" className="button button--secondary" disabled={loading} onClick={() => { setLoading(true); setBefore(undefined); setRetry(value => value + 1) }}>Aktualisieren</button></header>
    <div className="time-table-scroll"><table className="data-table time-bookings-table"><thead><tr><th>Datum</th><th>Uhrzeit</th><th>Buchung</th><th>Worüber</th><th>Erfassung</th><th>Vorher</th><th>Wer</th><th>Wann</th><th>Verlauf</th></tr></thead><tbody>
      {rows.map(row => {
        const latest = row.changes.at(-1)
        const source = latest?.kind === 'stamp' ? latest.after?.client : latest?.client
        return <tr key={row.id} className={row.deleted ? 'time-booking-deleted' : undefined}>
          <td>{dateLabel(row.date)}</td><td>{formatTime(row.event.at)}</td><td>{TIME_ACTIONS[row.event.type]}{row.deleted && <span className="time-issue">Gelöscht</span>}</td>
          <td>{bookingClient(source || row.event.client)}{row.event.source === 'offline' && <span className="time-issue">Offline erfasst</span>}</td>
          <td>{latest?.method || (row.event.source === 'correction' ? 'Nachtrag / Bearbeitet' : 'Schaltfläche')}</td><td>{eventLabel(latest?.before)}</td>
          <td>{latest?.createdByName || latest?.createdBy || 'Nicht erfasst'}</td><td>{timestamp(latest?.createdAt || row.event.receivedAt)}</td>
          <td>{row.changes.length ? <details><summary>{row.changes.length} {row.changes.length === 1 ? 'Eintrag' : 'Einträge'}</summary><div className="time-booking-history">{row.changes.map(change => <article key={change.id}><strong>{change.method} · {timestamp(change.createdAt)}</strong><span>{change.createdByName || change.createdBy || 'Nicht erfasst'} · {bookingClient(change.kind === 'stamp' ? change.after?.client : change.client)}</span><span>Vorher: {eventLabel(change.before)}</span><span>Nachher: {eventLabel(change.after)}</span>{change.reason && <span>Grund: {TIME_REASONS[change.reason] || change.reason}</span>}{change.note && <span>{change.note}</span>}</article>)}</div></details> : 'Kein Verlauf vorhanden'}</td>
        </tr>
      })}
      {!rows.length && !loading && !error && <tr><td colSpan="9">Keine Buchungen vorhanden.</td></tr>}
    </tbody></table></div>
    <footer className="time-bookings-footer">{loading && <p role="status">Buchungen werden geladen …</p>}{error && <><p role="alert" className="form-error">{error}</p><button type="button" className="button button--secondary" disabled={loading} onClick={() => { setLoading(true); setRetry(value => value + 1) }}>Erneut versuchen</button></>}{page.nextBefore && !error && <button type="button" className="button button--secondary" disabled={loading} onClick={() => { setLoading(true); setBefore(page.nextBefore) }}>Ältere Buchungen laden</button>}</footer>
  </section>
}
