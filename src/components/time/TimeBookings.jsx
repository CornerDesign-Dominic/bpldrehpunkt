import { Fragment, useEffect, useState } from 'react'
import { listOwnTimeBookings, formatTime, TIME_ACTIONS, TIME_REASONS, timeError } from '../../lib/timeTracking.js'
import { bookingClient, bookingStatus, timeBookingRows } from '../../lib/timeBookingRows.js'

const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
const timestamp = at => at ? new Date(at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : 'Nicht erfasst'
const eventLabel = event => event ? `${new Date(event.at).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ${TIME_ACTIONS[event.type] || event.type}` : '—'

export default function TimeBookings() {
  const [page, setPage] = useState({ days: [], history: [], nextBefore: null })
  const [before, setBefore] = useState(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState(new Set())
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
    <header><div><h3>Alle Buchungen</h3><p className="time-muted">Gesamthistorie · Originale, manuelle Nachträge und Änderungen auf einen Blick.</p></div><button type="button" className="button button--secondary" disabled={loading} onClick={() => { setLoading(true); setBefore(undefined); setRetry(value => value + 1) }}>Aktualisieren</button></header>
    <div className="time-table-scroll"><table className="data-table time-bookings-table"><colgroup><col className="time-bookings-date" /><col className="time-bookings-time" /><col className="time-bookings-action" /><col className="time-bookings-client" /><col className="time-bookings-state" /><col className="time-bookings-before" /><col className="time-bookings-actor" /><col className="time-bookings-timestamp" /><col className="time-bookings-trail" /></colgroup><thead><tr><th>Datum</th><th>Uhrzeit</th><th>Buchung</th><th>Worüber</th><th>Buchungsstatus</th><th>Vorher</th><th>Wer</th><th>Wann</th><th>Verlauf</th></tr></thead><tbody>
      {rows.map(row => {
        const audit = bookingStatus(row)
        const latest = audit.latest
        const source = latest?.kind === 'stamp' ? latest.after?.client : latest?.client
        const open = expanded.has(row.id)
        const detailId = `time-booking-${encodeURIComponent(row.id)}`
        return <Fragment key={row.id}><tr className={`time-booking-row time-booking-row--${audit.status}${row.deleted ? ' time-booking-deleted' : ''}`}>
          <td>{dateLabel(row.date)}</td><td>{formatTime(row.event.at)}</td><td>{TIME_ACTIONS[row.event.type]}</td>
          <td>{bookingClient(source || row.event.client)}{row.event.source === 'offline' && <span className="time-issue">Offline erfasst</span>}</td>
          <td><span className={`time-booking-badge time-booking-badge--${audit.status}`}>{audit.label}</span>{['edited', 'deleted'].includes(audit.status) && <span className="time-issue">Ursprung: {audit.origin}</span>}{audit.unchangedSaves > 0 && <span className="time-issue">{audit.unchangedSaves}× unverändert gespeichert</span>}</td><td>{eventLabel(latest?.before)}</td>
          <td>{latest?.createdByName || latest?.createdBy || 'Nicht erfasst'}</td><td>{timestamp(latest?.createdAt || row.event.receivedAt)}</td>
          <td>{row.changes.length ? <button type="button" className="time-booking-toggle" aria-expanded={open} aria-controls={detailId} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })}>{open ? '▾' : '▸'} Verlauf ({row.changes.length})</button> : 'Nicht erfasst'}</td>
        </tr>{open && <tr className="time-booking-detail-row"><td colSpan="9"><section id={detailId} className="time-booking-history" aria-label={`Verlauf: ${dateLabel(row.date)} ${eventLabel(row.event)}`}><h4>Vollständiger Buchungsverlauf · {dateLabel(row.date)}</h4>{row.changes.map(change => <article key={change.id} className={change.unchanged ? 'time-booking-history--unchanged' : undefined}><div><strong>{change.method}</strong><span>{timestamp(change.createdAt)} · {change.createdByName || change.createdBy || 'Nicht erfasst'} · {bookingClient(change.kind === 'stamp' ? change.after?.client : change.client)}</span></div><div className="time-booking-comparison"><span>Vorher: <strong>{eventLabel(change.before)}</strong></span><span>Nachher: <strong>{eventLabel(change.after)}</strong></span></div>{change.reason && <span>Grund: {TIME_REASONS[change.reason] || change.reason}</span>}{change.note && <span>{change.note}</span>}</article>)}</section></td></tr>}</Fragment>
      })}
      {!rows.length && !loading && !error && <tr><td colSpan="9">Keine Buchungen vorhanden.</td></tr>}
    </tbody></table></div>
    <footer className="time-bookings-footer">{loading && <p role="status">Buchungen werden geladen …</p>}{error && <><p role="alert" className="form-error">{error}</p><button type="button" className="button button--secondary" disabled={loading} onClick={() => { setLoading(true); setRetry(value => value + 1) }}>Erneut versuchen</button></>}{page.nextBefore && !error && <button type="button" className="button button--secondary" disabled={loading} onClick={() => { setLoading(true); setBefore(page.nextBefore) }}>Ältere Buchungen laden</button>}</footer>
  </section>
}
