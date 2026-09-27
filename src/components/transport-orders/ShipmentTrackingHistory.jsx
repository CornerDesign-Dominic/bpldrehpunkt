import { formatShipmentTrackingTimestamp, shipmentTrackingEventDescription, sourceLabels } from '../../lib/shipmentTrackingPresentation.js'

export default function ShipmentTrackingHistory({ events, loading, error }) {
  return <section className="transport-order-detail-section shipment-tracking-history" aria-labelledby="shipment-tracking-history-heading">
    <div><h3 id="shipment-tracking-history-heading">Verlauf</h3><p>Unveränderbares Protokoll der manuellen Sendungsverfolgung.</p></div>
    {loading && <p>Verlauf wird geladen …</p>}
    {error && <p className="form-error">{error}</p>}
    {!loading && !error && !events.length && <p>Noch keine Ereignisse vorhanden.</p>}
    {!loading && !error && events.length > 0 && <ol className="shipment-tracking-history__entries">{events.map((event) => <li key={event.id}><div><strong>{shipmentTrackingEventDescription(event)}</strong>{event.note && <span>{event.note}</span>}</div><dl><div><dt>Information</dt><dd>{formatShipmentTrackingTimestamp(event.eventTime)}</dd></div><div><dt>Erfasst von</dt><dd>{event.recordedByName || event.recordedBy || '—'}</dd></div><div><dt>Quelle</dt><dd>{sourceLabels[event.source] || 'Manuelle Eingabe'}</dd></div></dl></li>)}</ol>}
  </section>
}
