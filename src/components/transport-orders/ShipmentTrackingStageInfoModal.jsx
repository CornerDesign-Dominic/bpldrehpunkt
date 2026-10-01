import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'
import { shipmentTrackingStageConfigurations, shipmentTrackingStageEventDetails, shipmentTrackingStageEvents, sourceLabels, formatShipmentTrackingTimestamp } from '../../lib/shipmentTrackingPresentation.js'

export default function ShipmentTrackingStageInfoModal({ stageId, events, onClose }) {
  const stage = shipmentTrackingStageConfigurations[stageId] || shipmentTrackingStageConfigurations.preparation
  const stageEvents = shipmentTrackingStageEvents(events, stageId)
  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="shipment-tracking-editor shipment-tracking-stage-info" role="dialog" aria-modal="true" aria-labelledby="shipment-tracking-stage-info-title">
      <div className="shipment-tracking-editor__heading"><div><h2 id="shipment-tracking-stage-info-title"><StaticText source={"Weitere Infos ·"} /> {stage.label}</h2><p><StaticText source={"Chronologischer Verlauf dieser Stufe."} /></p></div><TranslatedProps sources={{"aria-label":"Dialog schließen"}}><button type="button" onClick={onClose} aria-label="Dialog schließen"><CloseIcon /></button></TranslatedProps></div>
      <ol className="shipment-tracking-stage-info__events">{stageEvents.map((event, index) => {
        const details = shipmentTrackingStageEventDetails(event, stageId)
        return <li key={event.id || `${event.recordedAt}-${index}`}><div><strong>{<StaticText source={event.eventType === 'tracking_completed' ? 'Sendungsverfolgung abgeschlossen' : details.length ? details.map((detail) => `${detail.label}: ${detail.value}`).join(' · ') : 'Status aktualisiert'} />}</strong><dl><div><dt><StaticText source={"Ereigniszeit"} /></dt><dd>{formatShipmentTrackingTimestamp(event.eventTime)}</dd></div><div><dt><StaticText source={"Erfasst am"} /></dt><dd>{formatShipmentTrackingTimestamp(event.recordedAt)}</dd></div><div><dt><StaticText source={"Erfasst von"} /></dt><dd>{event.recordedByName || event.recordedBy || '—'}</dd></div><div><dt><StaticText source={"Quelle"} /></dt><dd>{sourceLabels[event.source] || event.source || '—'}</dd></div>{event.note && <div><dt><StaticText source={"Bemerkung"} /></dt><dd>{event.note}</dd></div>}</dl></div></li>
      })}</ol>
      <div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" onClick={onClose}><StaticText source={"Schließen"} /></button></div>
    </section>
  </div>, document.body)
}
