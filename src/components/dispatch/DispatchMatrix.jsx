import { useMemo } from 'react'
import { assignTripLanes, getTripStatusLabel } from '../../lib/dispatchCockpit.js'

const HOUR_WIDTH = 64
const HOUR_MS = 60 * 60 * 1000

function formatDay(value) {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(value)
}

function timeLabel(value) {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false }).format(value)
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function positionTrip(trip, periodStart, periodEnd) {
  const start = new Date(trip.startDateTime).getTime()
  const end = new Date(trip.endDateTime).getTime()
  const visibleStart = clamp(start, periodStart, periodEnd)
  const visibleEnd = clamp(end, periodStart, periodEnd)
  return {
    left: ((visibleStart - periodStart) / HOUR_MS) * HOUR_WIDTH,
    width: Math.max(((visibleEnd - visibleStart) / HOUR_MS) * HOUR_WIDTH, 22),
    isVisible: visibleEnd > visibleStart,
  }
}

function TripBar({ trip, position, onEdit }) {
  const fullLabel = [trip.tourNumber, trip.origin && trip.destination ? `${trip.origin} → ${trip.destination}` : '', `${timeLabel(trip.startDateTime)}–${timeLabel(trip.endDateTime)}`].filter(Boolean).join(' · ')
  return <button type="button" className={`dispatch-trip dispatch-trip--${trip.status || 'planned'} dispatch-trip--lane-${trip.lane + 1}`} style={{ left: `${position.left}px`, width: `${position.width}px` }} title={`${fullLabel} (${getTripStatusLabel(trip.status)})`} onClick={() => onEdit(trip)}>
    <strong>{trip.tourNumber}</strong>{position.width >= 170 && trip.origin && trip.destination && <span>{trip.origin} → {trip.destination}</span>}{position.width >= 112 && <em>{timeLabel(trip.startDateTime)}–{timeLabel(trip.endDateTime)}</em>}
  </button>
}

export default function DispatchMatrix({ vehicles, trips, partners, periodStart, dayCount, onEditTrip }) {
  const dayStarts = useMemo(() => Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(periodStart)
    date.setDate(date.getDate() + index)
    return date
  }), [dayCount, periodStart])
  const periodStartMs = new Date(periodStart).getTime()
  const periodEndMs = periodStartMs + dayCount * 24 * HOUR_MS
  const totalHours = dayCount * 24
  const timelineWidth = totalHours * HOUR_WIDTH

  const vehicleRows = useMemo(() => vehicles.map((vehicle) => {
    const relevantTrips = trips.filter((trip) => trip.vehicleId === vehicle.id && new Date(trip.endDateTime).getTime() > periodStartMs && new Date(trip.startDateTime).getTime() < periodEndMs)
    const assignedTrips = assignTripLanes(relevantTrips)
    return { vehicle, assignedTrips, conflicts: assignedTrips.filter((trip) => trip.isConflict) }
  }), [periodEndMs, periodStartMs, trips, vehicles])

  return <section className="dispatch-matrix" aria-label="Ressourcen-Zeit-Matrix">
    <div className="dispatch-matrix__vehicles">
      <div className="dispatch-matrix__vehicle-header">Fahrzeug</div>
      {vehicleRows.map(({ vehicle, conflicts }) => <div className={`dispatch-matrix__vehicle ${vehicle.status !== 'active' ? 'dispatch-matrix__vehicle--unavailable' : ''}`} key={vehicle.id}>
        <strong>{vehicle.licensePlate}</strong>
        <span>{vehicle.vehicleType}{vehicle.ownerPartnerId ? ` · ${partners.find((partner) => partner.id === vehicle.ownerPartnerId)?.companyName || 'Eigentümer'}` : ''}</span>
        {vehicle.status !== 'active' && <em>{vehicle.status === 'blocked' ? 'Werkstatt / gesperrt' : 'Inaktiv'}</em>}
        {conflicts.length > 0 && <p><b>Planungskonflikt:</b> {conflicts.map((trip) => trip.tourNumber).join(', ')}</p>}
      </div>)}
      {!vehicleRows.length && <div className="dispatch-matrix__vehicle dispatch-matrix__vehicle--empty">Noch keine Fahrzeuge angelegt.</div>}
    </div>
    <div className="dispatch-matrix__time-scroll">
      <div className="dispatch-matrix__timeline" style={{ width: `${timelineWidth}px`, '--dispatch-hour-width': `${HOUR_WIDTH}px`, '--dispatch-day-count': dayCount }}>
        <div className="dispatch-matrix__axis">
          <div className="dispatch-matrix__days">{dayStarts.map((date) => <div className="dispatch-matrix__day" key={date.toISOString()}>{formatDay(date)}</div>)}</div>
          <div className="dispatch-matrix__hours" style={{ gridTemplateColumns: `repeat(${totalHours}, ${HOUR_WIDTH}px)` }}>{Array.from({ length: totalHours }, (_, index) => <span className={index % 24 === 0 ? 'dispatch-matrix__hour dispatch-matrix__hour--day-start' : 'dispatch-matrix__hour'} key={index}>{String(index % 24).padStart(2, '0')}</span>)}</div>
        </div>
        {vehicleRows.map(({ vehicle, assignedTrips, conflicts }) => <div className={`dispatch-matrix__track ${vehicle.status !== 'active' ? 'dispatch-matrix__track--unavailable' : ''}`} key={vehicle.id}>
          {assignedTrips.filter((trip) => !trip.isConflict).map((trip) => {
            const position = positionTrip(trip, periodStartMs, periodEndMs)
            return position.isVisible && <TripBar key={trip.id} trip={trip} position={position} onEdit={onEditTrip} />
          })}
          {conflicts.map((trip) => {
            const position = positionTrip(trip, periodStartMs, periodEndMs)
            return position.isVisible && <button type="button" key={trip.id} className="dispatch-conflict" style={{ left: `${position.left}px` }} title={`Planungskonflikt: ${trip.tourNumber} · ${timeLabel(trip.startDateTime)}–${timeLabel(trip.endDateTime)}`} onClick={() => onEditTrip(trip)}>! {trip.tourNumber}</button>
          })}
        </div>)}
        {!vehicleRows.length && <div className="dispatch-matrix__track dispatch-matrix__track--empty" />}
      </div>
    </div>
  </section>
}
