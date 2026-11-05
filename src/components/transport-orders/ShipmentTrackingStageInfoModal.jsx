import { ShipmentTrackingEventDerivation } from './ShipmentTrackingDerivation.jsx'
import { trackingHistoryTimes } from '../../lib/shipmentTrackingDerivation.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'
import { shipmentTrackingStageConfigurations, shipmentTrackingStageEventDetails, shipmentTrackingStageEvents, shipmentTrackingSourceLabel } from '../../lib/shipmentTrackingPresentation.js'

export default function ShipmentTrackingStageInfoModal({ stageId, events, onClose }) {
  const { language } = useLanguage()
  const stage = shipmentTrackingStageConfigurations[stageId] || shipmentTrackingStageConfigurations.preparation
  const stageEvents = shipmentTrackingStageEvents(events, stageId)
  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="shipment-tracking-editor shipment-tracking-stage-info" role="dialog" aria-modal="true" aria-labelledby="shipment-tracking-stage-info-title">
      <div className="shipment-tracking-editor__heading"><div><h2 id="shipment-tracking-stage-info-title"><StaticText source={"Weitere Infos ·"} /> <StaticText source={stage.label} /></h2><p><StaticText source={"Chronologischer Verlauf dieser Stufe."} /></p></div><TranslatedProps sources={{"aria-label":"Dialog schließen"}}><button type="button" onClick={onClose} aria-label="Dialog schließen"><CloseIcon /></button></TranslatedProps></div>
      <ol className="shipment-tracking-stage-info__events">{stageEvents.map((event, index) => {
        const details = shipmentTrackingStageEventDetails(event, stageId)
        return <li key={event.id || `${event.recordedAt}-${index}`}><div><strong>{event.eventType === 'tracking_completed' ? <StaticText source="Sendungsverfolgung abgeschlossen" /> : details.length ? details.map((detail, detailIndex) => <span key={detail.field || detailIndex}>{detailIndex > 0 ? ' · ' : ''}<StaticText source={detail.label} />: {detail.value}</span>) : <StaticText source="Status aktualisiert" />}</strong><ShipmentTrackingEventDerivation event={event} fields={stage.fields} /><dl>{trackingHistoryTimes(event, language).map(time => <div key={time.key}><dt>{time.label}</dt><dd>{time.value}</dd></div>)}<div><dt><StaticText source={"Erfasst von"} /></dt><dd>{event.recordedByName || event.recordedBy || '—'}</dd></div><div><dt><StaticText source={"Quelle"} /></dt><dd>{shipmentTrackingSourceLabel(event)}</dd></div>{event.note && <div><dt><StaticText source={"Bemerkung"} /></dt><dd>{event.note}</dd></div>}</dl></div></li>
      })}</ol>
      <div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" onClick={onClose}><StaticText source={"Schließen"} /></button></div>
    </section>
  </div>, document.body)
}
