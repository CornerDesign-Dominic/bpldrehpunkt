import { Fragment, useEffect, useRef, useState } from 'react'
import { listOwnTimeBookings, formatTime, TIME_ACTIONS, TIME_REASONS, timeError } from '../../lib/timeTracking.js'
import { bookingClient, bookingVersions } from '../../lib/timeBookingRows.js'

import { loadTimeBookingPage, TIME_BOOKINGS_PAGE_SIZE } from '../../lib/timeBookingPagination.js'

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
  const [range, setRange] = useState({ from: '', to: '', refresh: 0 })
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [index, setIndex] = useState(0)
  const [page, setPage] = useState({ rows: [], hasNext: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterError, setFilterError] = useState('')
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState(new Set())
  const [expandedSaves, setExpandedSaves] = useState(new Set())
  const cache = useRef(null)
  useEffect(() => {
    let active = true
    const key = JSON.stringify(range)
    loadTimeBookingPage({ cache: cache.current?.key === key ? cache.current.data : null, from: range.from, to: range.to, index, fetchPage: listOwnTimeBookings, isActive: () => active }).then(result => {
      if (!active || !result) return
      cache.current = { key, data: result }
      const start = index * TIME_BOOKINGS_PAGE_SIZE
      setPage({ rows: result.rows.slice(start, start + TIME_BOOKINGS_PAGE_SIZE), hasNext: result.rows.length > start + TIME_BOOKINGS_PAGE_SIZE })
      setError('')
    }).catch(failure => { if (active) setError(timeError(failure)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [range, index, retry])
  const rows = page.rows
  function search(event) {
    event?.preventDefault()
    if (from && to && from > to) { setFilterError('Das Von-Datum darf nicht nach dem Bis-Datum liegen.'); return }
    setFilterError(''); setError(''); setLoading(true); setIndex(0); setPage({ rows: [], hasNext: false }); setExpanded(new Set()); setExpandedSaves(new Set())
    setRange(current => ({ from, to, refresh: current.refresh + 1 }))
  }
  function turnPage(value) { setLoading(true); setPage({ rows: [], hasNext: false }); setIndex(value); setExpanded(new Set()); setExpandedSaves(new Set()) }
  function toggle(setter, id) {
    setter(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  return <section className="time-card time-table-card">
    <header><div><h3>Alle Buchungen</h3><p className="time-muted">50 Buchungen pro Seite · frühere Stände direkt darunter aufklappen.</p></div></header>
    <form className="time-booking-search" onSubmit={search}>
      <label>Von<input type="date" min="2000-01-01" max="2199-12-31" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>Bis<input type="date" min="2000-01-01" max="2199-12-31" value={to} onChange={event => setTo(event.target.value)} /></label>
      <button type="submit" className="button" disabled={loading}>Suchen</button>
      <button type="button" className="button button--secondary" disabled={loading} onClick={() => { setFrom(''); setTo(''); setFilterError(''); setIndex(0); setPage({ rows: [], hasNext: false }); setLoading(true); setExpanded(new Set()); setExpandedSaves(new Set()); setRange(current => ({ from: '', to: '', refresh: current.refresh + 1 })) }}>Zurücksetzen</button>
      {filterError && <p role="alert" className="form-error">{filterError}</p>}
    </form>
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
    <footer className="time-bookings-footer"><span className="time-muted">Seite {index + 1} · {rows.length} Buchungen</span>{loading && <p role="status">Buchungen werden geladen …</p>}{error && <><p role="alert" className="form-error">{error}</p><button type="button" className="button button--secondary" disabled={loading} onClick={() => { setLoading(true); setRetry(value => value + 1) }}>Erneut versuchen</button></>}
      <div className="time-booking-pages"><button type="button" className="button button--secondary" disabled={loading || index === 0} onClick={() => turnPage(index - 1)}>Zurück</button><button type="button" className="button button--secondary" disabled={loading || !page.hasNext || Boolean(error)} onClick={() => turnPage(index + 1)}>Weiter</button></div>
    </footer>
  </section>
}
