import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'
import { FaArrowRightFromBracket, FaArrowRightToBracket, FaBan, FaBoxOpen, FaCircleExclamation, FaCircleInfo, FaClipboardCheck, FaClock, FaEnvelope, FaFileCircleCheck, FaHouse, FaLocationDot, FaPause, FaStopwatch, FaTruck, FaTruckFast, FaWarehouse } from 'react-icons/fa6'
import { defaultShipmentTrackingUiModel, trackingStages } from './shipmentTrackingUiModel.js'
import { shipmentTrackingStageEvents, shipmentTrackingStationSummary } from '../../lib/shipmentTrackingPresentation.js'
import ShipmentTrackingRecipientsCard from './ShipmentTrackingRecipientsCard.jsx'
import ShipmentTrackingActionOverview from './ShipmentTrackingActionOverview.jsx'
import { shipmentTrackingManualDispatchBundles } from '../../../shared/shipmentTrackingManualDispatch.js'
import { shipmentTrackingActivationPresentation } from '../../lib/shipmentTrackingActivationPresentation.js'

const stationIcons = { preparation: FaClipboardCheck, loading: FaWarehouse, in_transit: FaTruck, unloading: FaWarehouse, afterTransport: FaFileCircleCheck }
const rowIcons = { arrival: FaArrowRightToBracket, process: FaBoxOpen, departure: FaArrowRightFromBracket, position: FaLocationDot, pause: FaPause, 'license-plate': FaClipboardCheck }
const workflowStateLabels = { pending: 'Noch nicht erreicht', active: 'Aktuell offen', completed: 'Erledigt', automationActive: 'Automatik läuft', manualEscalation: 'Manuelle Klärung erforderlich' }

function fallbackStation(stage) {
  return {
    ...stage,
    plan: stage.id === 'preparation' || stage.id === 'afterTransport' ? null : stage.id === 'in_transit' ? 'Planstrecke noch nicht berechnet' : 'Sollzeit fehlt',
    actualRows: [],
    forecastRows: [],
    status: null,
    emptyMessage: null,
    workflowState: 'pending',
    workflowLabel: workflowStateLabels.pending,
  }
}

function StationSummary({ station, tracking }) {
  const summary = shipmentTrackingStationSummary(station, tracking)
  return <div className="shipment-tracking-timeline__stage-summary">{summary.rows.map((row, index) => {
    const Icon = row.kind === 'forecast' ? FaClock : row.kind === 'missing' ? FaCircleInfo : rowIcons[row.kind] || FaCircleInfo
    const HintIcon = row.hint?.severity === 'alert' ? FaCircleExclamation : FaCircleInfo
    return <div className="shipment-tracking-timeline__stage-summary-item" key={`${row.label}-${index}`}><p className={`shipment-tracking-timeline__stage-summary-row shipment-tracking-timeline__stage-summary-row--${row.kind}${row.ai ? ' shipment-tracking-timeline__stage-summary-row--ai' : ''}`}><Icon aria-hidden="true" /><span>{row.label && <>{row.label}: </>}<strong>{row.value}</strong></span></p>{row.hint && <p className={`shipment-tracking-timeline__assessment shipment-tracking-timeline__assessment--${row.hint.severity}`}><HintIcon aria-hidden="true" /><span>{row.hint.text}</span></p>}</div>
  })}</div>
}

function ShipmentTrackingActivation({ activation, loading, error, canEdit, saving, onEarlyStart }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(interval)
  }, [])
  const timing = shipmentTrackingActivationPresentation(activation, { now })
  const headline = loading ? 'Automatischer Start wird berechnet …' : error ? 'Automatischer Startzeitpunkt nicht verfügbar.' : timing.countdown
  return <div className="shipment-tracking-timeline__activation">
    <div className="shipment-tracking-timeline__activation-timing"><FaClock aria-hidden="true" /><div><strong>{headline}</strong>{!loading && !error && timing.startAt && <span>{timing.startAt}</span>}<small><StaticText source={"Beim vorzeitigen Start wird keine E-Mail versendet. Alle Automatik-Regeln bleiben unverändert."} /></small></div></div>
    {canEdit && <button className="button" type="button" disabled={saving} onClick={onEarlyStart}><StaticText source={"Sendungsverfolgung vorzeitig starten"} /></button>}
  </div>
}

/**
 * Rendert ausschließlich den aus Import- und Trackingdaten abgeleiteten
 * Zeitstrahl. Änderungen erfolgen weiterhin nur über das Tracking-Modal.
 */
function AttentionIcon({ item }) {
  const Icon = item.icon === 'stopwatch' ? FaStopwatch : item.id === 'mail-review' ? FaEnvelope : item.id === 'automation-paused' ? FaBan : FaTruck
  return <span className={`shipment-tracking-attention__item shipment-tracking-attention__item--${item.severity}`} title={`${item.label}: ${item.detail}`} aria-label={`${item.label}: ${item.detail}`}><Icon aria-hidden="true" /><span className="sr-only">{item.label}</span></span>
}
function ForecastButton({ forecast, onOpenForecast }) {
  if (!onOpenForecast) return null
  const Icon = forecast?.kind === 'arrival' ? FaHouse : FaTruckFast
  const state = forecast?.state || 'none'
  const label = forecast?.kind === 'arrival'
    ? (forecast.state === 'green' ? 'Transport pünktlich angekommen' : 'Transport verspätet angekommen')
    : forecast?.kind === 'forecast'
      ? `Transportprognose: ${{ green: 'im Plan', yellow: 'beobachten', red: 'kritisch', grey: 'abgelaufen' }[state] || 'nicht verfügbar'}`
      : 'Transportprognose öffnen'
  return <button type="button" className={`shipment-tracking-forecast-button shipment-tracking-forecast-button--${state}`} onClick={onOpenForecast} aria-label={label} title={label}><Icon aria-hidden="true" /></button>
}

export default function ShipmentTrackingTimeline({ model = defaultShipmentTrackingUiModel, tracking = null, events = [], dryRunPreview = null, dryRunLoading = false, dryRunError = '', activation = null, activationLoading = false, activationError = '', canEdit = false, saving = false, ratingsLoading = false, ratingsError = '', attention = null, forecast = null, onOpenForecast, onOpenRatings, onEarlyStart, onEditStage, onSaveRecipient, onShowStageInfo, onManualDispatch, onOpenMailTemplate }) {
  const manualDispatchBundles = shipmentTrackingManualDispatchBundles(dryRunPreview)
  const systemHints = [...(Array.isArray(model.hints) ? model.hints : []), ...(dryRunError ? [{ id: 'shipment-tracking-preview-error', status: 'error', description: dryRunError }] : [])]
  const stations = trackingStages.map((stage) => model.stations?.find((entry) => entry.id === stage.id) || fallbackStation(stage))

  return <section className="transport-order-detail-section transport-order-detail-section--tracking" aria-labelledby="shipment-tracking-heading">
      <div className="shipment-tracking-timeline__heading">
      <div><h3 id="shipment-tracking-heading"><StaticText source={"Sendungsverfolgung"} /> <a className="shipment-tracking-timeline__help" href="/hilfe/sendungsverfolgung" target="_blank" rel="noreferrer" aria-label="Erklärung zur Sendungsverfolgung in neuem Tab öffnen" title="Erklärung zur Sendungsverfolgung">?</a></h3>{attention?.visible?.length > 0 && <div className="shipment-tracking-attention" aria-label="Handlungsempfehlung">{attention.visible.map((item) => <AttentionIcon key={item.id} item={item} />)}{attention.moreCount > 0 && <span className="shipment-tracking-attention__more">+{attention.moreCount}</span>}</div>}</div>
      {model.trackingExists && <div className="shipment-tracking-timeline__forecast-control"><ForecastButton forecast={forecast} onOpenForecast={onOpenForecast} /></div>}
      <div className="shipment-tracking-timeline__header-summary"><span><em>Status:</em><strong>{model.lifecycleLabel || 'Bevorstehend'}</strong></span><span><em><StaticText source={"Art:"} /></em><strong>{model.trackingTypeLabel || <StaticText source={"Manuell"} />}</strong></span></div>
    </div>

    <div className="shipment-tracking-timeline__timeline">
      <ol className="shipment-tracking-timeline__stages">
        {stations.map((station) => {
          const Icon = stationIcons[station.id] || FaCircleInfo
          const workflowState = workflowStateLabels[station.workflowState] ? station.workflowState : 'pending'
          const workflowLabel = station.workflowLabel || workflowStateLabels[workflowState]
          const stageEvents = shipmentTrackingStageEvents(events, station.id)
          const hasStageInformation = stageEvents.length > 0 || (station.actualRows?.length || 0) > 0 || (station.forecastRows?.length || 0) > 0 || (station.id === 'preparation' && Boolean(tracking?.licensePlate))
          const isRatingsAction = station.id === 'afterTransport'
          const actionDisabled = saving || (isRatingsAction && (ratingsLoading || Boolean(ratingsError)))
          const actionLabel = isRatingsAction ? 'Bewertungen' : '+ Info'
          const actionTitle = isRatingsAction && ratingsError ? ratingsError : undefined
          return <li key={station.id}>
            <div className={station.plan === 'Sollzeit fehlt' || station.plan === 'Planstrecke noch nicht berechnet' ? 'shipment-tracking-timeline__plan shipment-tracking-timeline__plan--missing' : 'shipment-tracking-timeline__plan'}>{station.plan && <span>{station.plan}</span>}</div>
            <span className={`shipment-tracking-timeline__station shipment-tracking-timeline__station--${workflowState}`} role="img" aria-label={`${station.label}: ${workflowLabel}`}><Icon size={19} /></span>
            <span className="shipment-tracking-timeline__stage-label">{station.label}</span>
            {model.trackingExists && canEdit && <button className="button button--secondary shipment-tracking-timeline__station-action" type="button" disabled={actionDisabled} title={actionTitle} aria-label={isRatingsAction ? 'Bewertungen öffnen' : `${station.label} aktualisieren`} onClick={() => { if (isRatingsAction) onOpenRatings?.(); else onEditStage?.(station.id) }}>{actionLabel}</button>}
            <div className="shipment-tracking-timeline__stage-information">
              <StationSummary station={station} tracking={tracking} />
              {model.trackingExists && hasStageInformation && <a className="shipment-tracking-timeline__info-link" href="#shipment-tracking-history-heading" onClick={(event) => { event.preventDefault(); onShowStageInfo?.(station.id) }}><FaCircleInfo aria-hidden="true" /><StaticText source={"Weitere Infos"} /></a>}
            </div>
          </li>
        })}
      </ol>
    </div>

    {model.trackingExists && model.lifecycleLabel === 'Bevorstehend' && canEdit && <div className="shipment-tracking-timeline__activation"><div className="shipment-tracking-timeline__activation-timing"><FaClock aria-hidden="true" /><div><strong><StaticText source={"Sendungsverfolgung ist bevorstehend"} /></strong><small><StaticText source={"Beim vorzeitigen Start wird keine E-Mail versendet. Alle Automatik-Regeln bleiben unverändert."} /></small></div></div><button className="button" type="button" disabled={saving} onClick={onEarlyStart}><StaticText source={"Sendungsverfolgung vorzeitig starten"} /></button></div>}

    <div className="shipment-tracking-timeline__details">
      {model.trackingExists && <ShipmentTrackingRecipientsCard tracking={tracking} canEdit={canEdit && model.lifecycleStatus !== 'completed'} canDispatch={canEdit} saving={saving} onSaveRecipient={onSaveRecipient} onOpenMailTemplate={onOpenMailTemplate} onManualDispatch={onManualDispatch} manualDispatchBundles={manualDispatchBundles} />}
      {model.trackingExists && <ShipmentTrackingActionOverview preview={dryRunPreview} loading={dryRunLoading} error={dryRunError} />}
      {systemHints.length > 0 && <div className="shipment-tracking-timeline__panel shipment-tracking-timeline__panel--system">
        <div className="shipment-tracking-timeline__panel-heading"><FaCircleInfo aria-hidden="true" /><h4><StaticText source={"Systemhinweise"} /></h4></div>
        <ul className="shipment-tracking-timeline__hints">{systemHints.map((hint, index) => <li className={`shipment-tracking-timeline__hint shipment-tracking-timeline__hint--${hint.status === 'error' ? 'overdue' : hint.status || 'neutral'}`} key={hint.id || index}>{hint.status === 'error' ? <FaCircleExclamation aria-hidden="true" /> : <FaCircleInfo aria-hidden="true" />}<span>{hint.description}</span></li>)}</ul>
      </div>}
    </div>
    {!model.trackingExists && <ShipmentTrackingActivation activation={activation} loading={activationLoading} error={activationError} canEdit={canEdit} saving={saving} onEarlyStart={onEarlyStart} />}
  </section>
}
