import { formatShipmentTrackingTimestamp, shipmentTrackingEventChangeType, shipmentTrackingEventDescription, sourceLabels } from '../../lib/shipmentTrackingPresentation.js'

export default function ShipmentTrackingHistory({ events, loading, error }) {
  const eventCount = Array.isArray(events) ? events.length : 0
  return <details className="transport-order-detail-section shipment-tracking-history">
    <summary aria-label={`Verlauf der Sendungsverfolgung${eventCount ? `, ${eventCount} Ereignisse` : ''}`}>
      <h3 id="shipment-tracking-history-heading">Verlauf</h3>
      {!loading && !error && <span className="shipment-tracking-history__toggle">{eventCount ? <><span className="shipment-tracking-history__expand">{eventCount} Ereignisse aufklappen</span><span className="shipment-tracking-history__collapse">{eventCount} Ereignisse zuklappen</span></> : 'Keine Ereignisse'}</span>}
    </summary>
    <div className="shipment-tracking-history__content" aria-labelledby="shipment-tracking-history-heading">
      {loading && <p>Verlauf wird geladen …</p>}
      {error && <p className="form-error">{error}</p>}
      {!loading && !error && !eventCount && <p>Noch keine Ereignisse vorhanden.</p>}
      {!loading && !error && eventCount > 0 && <ol className="shipment-tracking-history__entries">{events.map((event) => <li key={event.id}><strong>{shipmentTrackingEventDescription(event)}</strong>{event.note && <p>{event.note}</p>}<div className="shipment-tracking-history__metadata"><span className="shipment-tracking-history__change-type">{shipmentTrackingEventChangeType(event)}</span><time dateTime={event.eventTime?.toDate?.()?.toISOString()}>{formatShipmentTrackingTimestamp(event.eventTime)}</time><span>{event.recordedByName || event.recordedBy || '—'}</span><span className="shipment-tracking-history__source">{sourceLabels[event.source] || 'Manuelle Eingabe'}</span></div></li>)}</ol>}
    </div>
  </details>
}
