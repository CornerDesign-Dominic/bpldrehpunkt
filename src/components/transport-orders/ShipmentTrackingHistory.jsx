import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { formatShipmentTrackingTimestamp, shipmentTrackingEventChangeType, shipmentTrackingEventDescription, sourceLabels } from '../../lib/shipmentTrackingPresentation.js'

export default function ShipmentTrackingHistory({ events, loading, error }) {
  const visibleEvents = Array.isArray(events) ? events.filter((event) => event.eventType !== 'loading_duration_reported') : []
  const eventCount = visibleEvents.length
  return <details className="transport-order-detail-section shipment-tracking-history">
    <summary aria-label={`Verlauf der Sendungsverfolgung${eventCount ? `, ${eventCount} Ereignisse` : ''}`}>
      <h3 id="shipment-tracking-history-heading"><StaticText source={"Verlauf"} /></h3>
      {!loading && !error && <span className="shipment-tracking-history__toggle">{eventCount ? <><span className="shipment-tracking-history__expand">{eventCount} <StaticText source={"Ereignisse aufklappen"} /></span><span className="shipment-tracking-history__collapse">{eventCount} <StaticText source={"Ereignisse zuklappen"} /></span></> : <StaticText source="Keine Ereignisse" />}</span>}
    </summary>
    <div className="shipment-tracking-history__content" aria-labelledby="shipment-tracking-history-heading">
      {loading && <p><StaticText source={"Verlauf wird geladen …"} /></p>}
      {error && <p className="form-error">{<StaticText source={error} />}</p>}
      {!loading && !error && !eventCount && <p><StaticText source={"Noch keine Ereignisse vorhanden."} /></p>}
      {!loading && !error && eventCount > 0 && <ol className="shipment-tracking-history__entries">{visibleEvents.map((event) => <li key={event.id}><strong>{shipmentTrackingEventDescription(event)}</strong>{event.note && <p>{event.note}</p>}<div className="shipment-tracking-history__metadata"><span className="shipment-tracking-history__change-type">{shipmentTrackingEventChangeType(event)}</span><time dateTime={event.eventTime?.toDate?.()?.toISOString()}>{formatShipmentTrackingTimestamp(event.eventTime)}</time><span>{event.recordedByName || event.recordedBy || '—'}</span><span className={`shipment-tracking-history__source${event.source === 'ai_mail' ? ' shipment-tracking-history__source--ai' : ''}`}>{<StaticText source={sourceLabels[event.source] || 'Manuelle Eingabe'} />}</span></div></li>)}</ol>}
    </div>
  </details>
}
