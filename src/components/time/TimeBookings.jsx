import { Fragment, useEffect, useState } from 'react'
import { listOwnTimeBookings, formatTime, TIME_ACTIONS, TIME_REASONS, timeError } from '../../lib/timeTracking.js'
import { bookingClient, bookingVersions, timeBookingRows } from '../../lib/timeBookingRows.js'

const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
const timestamp = at => at ? new Date(at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : 'Nicht erfasst'
function BookingReason({ entry }) {
  if (!entry.reason && !entry.note) return null
  const label = TIME_REASONS[entry.reason] || entry.reason || 'Hinweis'
  if (!entry.note) return <span className="time-booking-reason">{label}</span>
  return <details className="time-booking-reason"><summary>{label}</summary><div><span>{entry.note}</span></div></details>
}

function VersionCells({ version, date, earlier = false, children }) {
  const event = version.displayEvent || version.event
  return <>
    <td>{earlier && <span className="time-booking-indent" aria-label="Früherer Stand">↳ </span>}{dateLabel(date)}</td>
    <td><span className={version.changed?.at ? 'time-booking-value-changed' : undefined}>{formatTime(event?.at)}</span></td>
    <td><span className={version.changed?.type ? 'time-booking-value-changed' : undefined}>{TIME_ACTIONS[event?.type] || '—'}</span></td>
    <td>{version.method}</td>
    <td>{bookingClient(version.client)}{event?.source === 'offline' && <span className="time-booking-offline"> · offline</span>}</td>
    <td>{version.createdByName || version.createdBy || 'Nicht erfasst'}</td>
    <td>{timestamp(version.createdAt)}</td>
    <td><BookingReason entry={version} /></td>
    <td><div className="time-booking-actions">{children}</div></td>
  </>
}

export default function TimeBookings() {
  const [page, setPage] = useState({ days: [], history: [], nextBefore: null })
  const [before, setBefore] = useState(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState(new Set())
  const [expandedSaves, setExpandedSaves] = useState(new Set())
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
  function toggle(setter, id) {
    setter(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  return <section className="time-card time-table-card">
    <header><div><h3>Alle Buchungen</h3><p className="time-muted">Aktueller Stand je Buchung · frühere Stände direkt darunter aufklappen.</p></div><button type="button" className="button button--secondary" disabled={loading} onClick={() => { setLoading(true); setBefore(undefined); setRetry(value => value + 1) }}>Aktualisieren</button></header>
    <div className="time-table-scroll"><table className="data-table time-bookings-table"><colgroup><col className="time-bookings-date" /><col className="time-bookings-time" /><col className="time-bookings-action" /><col className="time-bookings-method" /><col className="time-bookings-client" /><col className="time-bookings-actor" /><col className="time-bookings-timestamp" /><col className="time-bookings-reason" /><col className="time-bookings-trail" /></colgroup><thead><tr><th>Datum</th><th>Uhrzeit</th><th>Buchung</th><th>Erfassung</th><th>Über</th><th>Bearbeiter</th><th>Gespeichert am</th><th>Grund</th><th>Verlauf</th></tr></thead><tbody>
      {rows.map(row => {
        const { current, previous, saves } = bookingVersions(row)
        const open = expanded.has(row.id)
        const historyId = `time-booking-${encodeURIComponent(row.id)}`
        const savesId = `${historyId}-saves`
        const showSaves = open && (!previous.length || expandedSaves.has(row.id))
        return <Fragment key={row.id}>
          <tr className={`time-booking-row${row.deleted ? ' time-booking-deleted' : ''}`}>
            <VersionCells version={current} date={row.date}>
              {(previous.length > 0 || saves.length > 0) && <button type="button" className="time-booking-toggle" aria-expanded={open} aria-controls={previous.length ? historyId : savesId} onClick={() => toggle(setExpanded, row.id)}>{open ? '▾' : '▸'} {previous.length ? `${previous.length} frühere${previous.length === 1 ? 'r Stand' : ' Stände'}` : `${saves.length} Speicherung${saves.length === 1 ? '' : 'en'}`}</button>}
            </VersionCells>
          </tr>
          {open && previous.map((version, index) => <tr id={index === 0 ? historyId : undefined} key={version.id} className={`time-booking-version-row${!version.event ? ' time-booking-deleted' : ''}`}><VersionCells version={version} date={row.date} earlier /></tr>)}
          {open && previous.length > 0 && saves.length > 0 && <tr className="time-booking-saves-heading"><td colSpan="9"><button type="button" className="time-booking-toggle" aria-expanded={showSaves} aria-controls={savesId} onClick={() => toggle(setExpandedSaves, row.id)}>{showSaves ? '▾' : '▸'} {saves.length} Speicherung{saves.length === 1 ? '' : 'en'} ohne Änderung</button></td></tr>}
          {showSaves && saves.map((save, index) => <tr id={index === 0 ? savesId : undefined} key={`save-${save.id}`} className="time-booking-save-row"><VersionCells version={{ ...save, event: save.after, method: 'Unverändert gespeichert', changed: {} }} date={row.date} earlier /></tr>)}
        </Fragment>
      })}
      {!rows.length && !loading && !error && <tr><td colSpan="9">Keine Buchungen vorhanden.</td></tr>}
    </tbody></table></div>
    <footer className="time-bookings-footer">{loading && <p role="status">Buchungen werden geladen …</p>}{error && <><p role="alert" className="form-error">{error}</p><button type="button" className="button button--secondary" disabled={loading} onClick={() => { setLoading(true); setRetry(value => value + 1) }}>Erneut versuchen</button></>}{page.nextBefore && !error && <button type="button" className="button button--secondary" disabled={loading} onClick={() => { setLoading(true); setBefore(page.nextBefore) }}>Ältere Buchungen laden</button>}</footer>
  </section>
}
