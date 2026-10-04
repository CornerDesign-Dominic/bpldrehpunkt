import { createPortal } from 'react-dom'
import { FaCircleInfo, FaHand, FaThumbsDown, FaThumbsUp } from 'react-icons/fa6'
import { CloseIcon } from '../icons.jsx'
import { shipmentTrackingManualDispatchTemplateIds } from '../../../shared/shipmentTrackingManualDispatch.js'

function date(value) { const result = value?.toDate?.() || (value ? new Date(value) : null); return result && !Number.isNaN(result.getTime()) ? result : null }
function timestamp(value) { const valueDate = date(value); return valueDate ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(valueDate) : '—' }
function clock(value) { const valueDate = date(value); return valueDate ? new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(valueDate) : '—' }
function dateLabel(value) { const valueDate = date(value); return valueDate ? new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(valueDate) : '—' }
function percentage(value) { return Number.isFinite(value) ? `${Math.round(value * 10) / 10}%` : '—' }
function colorLabel(value) { return { green: 'Im Plan', yellow: 'Beobachten', red: 'Kritisch', grey: 'Prognose abgelaufen' }[value] || 'Keine Prognose' }
function sourceLabel(source) { return source === 'actual_departure_loading' ? 'Tatsächliche Abfahrt Ladestelle' : source === 'actual_arrival_loading' ? 'Tatsächliche Ankunft Ladestelle' : 'Voraussichtliche Ankunft Ladestelle' }
function expiredForecastMessage(source) {
  if (source === 'estimated_arrival_loading') return 'Für eine neue Berechnung wird die tatsächliche Ankunft oder die tatsächliche Abfahrt an der Ladestelle benötigt.'
  if (source === 'actual_arrival_loading') return 'Für eine neue Berechnung wird die tatsächliche Abfahrt an der Ladestelle benötigt.'
  return 'Bitte aktuelle Daten zur Ladestelle erfassen, damit eine neue Berechnung erstellt werden kann.'
}

function onTimeText(value) {
  if (value >= 100) return 'Das gesamte Ankunftsfenster liegt vor Ende des Entladefensters.'
  if (value <= 0) return 'Das Ankunftsfenster liegt nach Ende des Entladefensters.'
  return `${percentage(value)} des Ankunftsfensters liegen vor Ende des Entladefensters.`
}

function forecastStatus(forecast) {
  if (forecast?.kind === 'none') return { title: 'Prognose nicht verfügbar', message: forecast.message || 'Keine Prognosegrundlage vorhanden.', icon: <FaCircleInfo /> }
  if (forecast?.state === 'grey') return { title: 'Prognose abgelaufen', message: expiredForecastMessage(forecast.source), icon: <FaCircleInfo /> }
  if (forecast?.state === 'green') return { title: 'Prognose im Plan', message: onTimeText(forecast.onTimeSharePercent), icon: <FaThumbsUp /> }
  if (forecast?.state === 'yellow') return { title: 'Entladefenster knapp', message: onTimeText(forecast.onTimeSharePercent), icon: <FaHand /> }
  return { title: 'Voraussichtliche Verspätung', message: onTimeText(forecast?.onTimeSharePercent), icon: <FaThumbsDown /> }
}

function forecastRequest(forecast) {
  if (forecast?.kind === 'none' && !forecast.source) return { templateId: shipmentTrackingManualDispatchTemplateIds.loadingEta, label: 'ETA Ladestelle anfragen' }
  if (forecast?.kind === 'forecast' && forecast.state === 'grey' && forecast.source === 'estimated_arrival_loading') return { templateId: shipmentTrackingManualDispatchTemplateIds.loadingArrival, label: 'LS Ankunft anfragen' }
  if (forecast?.kind === 'forecast' && forecast.state === 'grey' && forecast.source === 'actual_arrival_loading') return { templateId: shipmentTrackingManualDispatchTemplateIds.loadingDeparture, label: 'LS Abfahrt anfragen' }
  return null
}

function ForecastStatusNotice({ forecast, onRequestForecastUpdate, requestDisabled = false }) {
  const status = forecastStatus(forecast)
  const request = forecastRequest(forecast)
  return <section className={`shipment-tracking-forecast-modal__status-notice shipment-tracking-forecast-modal__status-notice--${forecast.state}`} role="status"><span className="shipment-tracking-forecast-modal__status-icon" aria-hidden="true">{status.icon}</span><div><strong>{status.title}</strong><span>{status.message}</span>{request && onRequestForecastUpdate && <button className="button button--secondary shipment-tracking-forecast-modal__status-action" type="button" disabled={requestDisabled} onClick={() => onRequestForecastUpdate(request.templateId)}>{request.label}</button>}</div></section>
}

function dayKey(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function berlinMidnight(dateKeyValue) {
  const [year, month, day] = dateKeyValue.split('-').map(Number)
  const utcMidnight = Date.UTC(year, month - 1, day)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(utcMidnight))
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
  const berlinTimeAtUtcMidnight = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute)
  return utcMidnight - (berlinTimeAtUtcMidnight - utcMidnight)
}

function daySeparators(min, max) {
  const values = []
  const cursor = new Date(`${dayKey(min)}T00:00:00Z`)
  const end = new Date(`${dayKey(max)}T00:00:00Z`)
  while (cursor <= end) {
    values.push(berlinMidnight(cursor.toISOString().slice(0, 10)))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return values
}

function ArrivalTimeline({ forecast }) {
  const loadingStart = date(forecast?.loadingSlotStartAt)?.getTime()
  const loadingEnd = date(forecast?.loadingSlotEndAt)?.getTime()
  const unloadingStart = date(forecast?.slotStartAt || forecast?.deadlineAt)?.getTime()
  const unloadingEnd = date(forecast?.deadlineAt)?.getTime()
  const loadingFacts = [
    { id: 'eta', label: 'ETA', description: 'Voraussichtliche Ankunft Ladestelle', value: date(forecast?.loadingFacts?.estimatedArrivalAt)?.getTime() },
    { id: 'actual-arrival', label: 'IST', description: 'Tatsächliche Ankunft Ladestelle', value: date(forecast?.loadingFacts?.actualArrivalAt)?.getTime() },
    { id: 'departure', label: 'ABF', description: 'Tatsächliche Abfahrt Ladestelle', value: date(forecast?.loadingFacts?.actualDepartureAt)?.getTime() },
  ].filter((item) => Number.isFinite(item.value))
  const predictions = [
    { id: 'optimistic', label: 'Optimistisch', value: date(forecast?.arrivals?.optimistic)?.getTime() },
    { id: 'realistic', label: 'Realistisch', value: date(forecast?.arrivals?.realistic)?.getTime() },
    { id: 'pessimistic', label: 'Pessimistisch', value: date(forecast?.arrivals?.pessimistic)?.getTime() },
  ]
  const loadingWindow = Number.isFinite(loadingStart) && Number.isFinite(loadingEnd)
  const allValues = [unloadingStart, unloadingEnd, ...predictions.map((item) => item.value), ...loadingFacts.map((item) => item.value), ...(loadingWindow ? [loadingStart, loadingEnd] : [])]
  if (!allValues.every(Number.isFinite)) return null
  const actualMin = Math.min(...allValues)
  const actualMax = Math.max(...allValues)
  const padding = Math.max(2 * 60 * 60 * 1000, (actualMax - actualMin) * 0.14)
  const min = actualMin - padding
  const max = actualMax + padding
  const positionValue = (value) => Math.max(0, Math.min(100, ((value - min) / Math.max(1, max - min)) * 100))
  const position = (value) => `${positionValue(value)}%`
  let previousPredictionPosition = -Infinity
  let labelLane = 0
  const positionedPredictions = predictions.map((item) => {
    const currentPosition = positionValue(item.value)
    labelLane = currentPosition - previousPredictionPosition < 13 ? labelLane + 1 : 0
    previousPredictionPosition = currentPosition
    return { ...item, labelLane }
  })
  let previousFactPosition = -Infinity
  let factLabelLane = 0
  const positionedLoadingFacts = loadingFacts.map((item) => {
    const currentPosition = positionValue(item.value)
    factLabelLane = currentPosition - previousFactPosition < 5 ? factLabelLane + 1 : 0
    previousFactPosition = currentPosition
    return { ...item, labelLane: factLabelLane }
  })
  const windowMarkers = (prefix, start, end) => start === end
    ? [{ id: `${prefix}-fixed`, label: `${prefix} FIX`, value: start, window: prefix.toLowerCase(), edge: 'fixed' }]
    : [{ id: `${prefix}-from`, label: `${prefix} von`, value: start, window: prefix.toLowerCase(), edge: 'start' }, { id: `${prefix}-until`, label: `${prefix} bis`, value: end, window: prefix.toLowerCase(), edge: 'end' }]
  const slots = [...(loadingWindow ? windowMarkers('LS', loadingStart, loadingEnd) : []), ...windowMarkers('ES', unloadingStart, unloadingEnd)]
  return <section className="shipment-tracking-forecast-modal__timeline shipment-tracking-forecast-modal__timeline--axis" aria-label="Zeitstrahl für Entladefenster und Ankunftsprognose">
    <div className="shipment-tracking-forecast-modal__timeline-heading"><strong>Zeitliche Einordnung</strong><span>Ladefenster, Entladefenster und Ankunftsprognose</span></div>
    <div className="shipment-tracking-forecast-modal__timeline-ruler">
      <div className="shipment-tracking-forecast-modal__timeline-axis" aria-hidden="true" />
      {daySeparators(min, max).map((value) => <div className="shipment-tracking-forecast-modal__date-separator" key={value} style={{ left: position(value) }}><span>{dateLabel(value)}</span><i /></div>)}
      {slots.map((item) => <div className={`shipment-tracking-forecast-modal__slot-marker shipment-tracking-forecast-modal__slot-marker--${item.window} shipment-tracking-forecast-modal__slot-marker--${item.window}-${item.edge}`} key={item.id} style={{ left: position(item.value) }}><i /><span>{item.label}<strong>{clock(item.value)}</strong></span></div>)}
      {positionedLoadingFacts.map((item) => <div className={`shipment-tracking-forecast-modal__loading-fact shipment-tracking-forecast-modal__loading-fact--${item.id}`} key={item.id} style={{ left: position(item.value), '--loading-fact-label-lane': item.labelLane }} title={`${item.description}: ${timestamp(item.value)}`} aria-label={`${item.description}: ${timestamp(item.value)}`}><i /><span>{item.label}</span></div>)}
      {positionedPredictions.map((item) => <div className={`shipment-tracking-forecast-modal__forecast-marker shipment-tracking-forecast-modal__forecast-marker--${item.id}`} key={item.id} style={{ left: position(item.value), '--forecast-label-lane': item.labelLane }}><i /><span>{item.label}<strong>{clock(item.value)}</strong></span></div>)}
    </div>
  </section>
}

const scenarioSpeeds = { optimistic: 70, realistic: 65, pessimistic: 60 }
const scenarioLabels = { optimistic: 'Optimistisch', realistic: 'Realistisch', pessimistic: 'Pessimistisch' }

function ScenarioFactors({ forecast }) {
  const restPlanning = forecast.inputs?.regulatedRestPlanning || {}
  const distanceText = forecast.inputs?.positionAt ? `Reststrecke: ${forecast.inputs.usedDistanceKm} km ab Standortmeldung` : `Streckenbasis: ${forecast.inputs?.usedDistanceKm || forecast.distanceKm || '—'} km`
  return <section className="shipment-tracking-forecast-modal__scenario-factors" aria-label="Faktoren und Annahmen je Prognoseszenario">
    <div className="shipment-tracking-forecast-modal__scenario-factors-heading"><strong>Faktoren und Annahmen</strong><span>Je Szenario separat berechnet</span></div>
    <div className="shipment-tracking-forecast-modal__scenario-factors-grid">{Object.keys(scenarioLabels).map((scenario) => {
      const plan = restPlanning[scenario] || {}
      const pauseText = `${plan.breakCount || 0} Fahrpause${plan.breakCount === 1 ? '' : 'n'} à 45 Min.`
      const dailyRestText = `${plan.dailyRestCount || 0} tägliche Ruhezeit${plan.dailyRestCount === 1 ? '' : 'en'} à 11 Std.`
      const weeklyRestText = plan.weeklyRestHours ? `${plan.weeklyRestHours} Std. Wochenendruhe` : 'Keine Wochenendruhe erforderlich'
      return <section className={`shipment-tracking-forecast-modal__scenario shipment-tracking-forecast-modal__scenario--${scenario}`} key={scenario}>
        <h3>{scenarioLabels[scenario]}</h3>
        <ul>
          <li><strong>Tempo:</strong> {scenarioSpeeds[scenario]} km/h</li>
          <li><strong>Fahrzeug:</strong> {forecast.vehicle?.label || 'Standard'}{forecast.vehicle?.assumed ? ' · Annahme' : ''}</li>
          <li><strong>Fahrer:</strong> {forecast.driverCount || 1}</li>
          <li><strong>{distanceText}</strong></li>
          <li>{pauseText}</li>
          <li>{dailyRestText}</li>
          <li>{weeklyRestText}</li>
        </ul>
      </section>
    })}</div>
  </section>
}

function historyLabel(item) { return `${timestamp(item.createdAt)} · ${colorLabel(item.state)} · ${percentage(item.onTimeSharePercent)}${item.thresholds ? ` · rot bis ${item.thresholds.red}% / grün ab ${item.thresholds.green}%` : ''}` }

export default function ShipmentTrackingForecastModal({ data, loading, error, refreshing, onRefresh, onRequestForecastUpdate, requestDisabled = false, onClose }) {
  const forecast = data?.forecast
  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !refreshing) onClose() }}><section className="shipment-tracking-editor shipment-tracking-forecast-modal" role="dialog" aria-modal="true" aria-labelledby="shipment-tracking-forecast-title"><div className="shipment-tracking-editor__heading"><div><h2 id="shipment-tracking-forecast-title">Transportprognose <a className="shipment-tracking-forecast-modal__help" href="/hilfe/sendungsverfolgung" target="_blank" rel="noreferrer" aria-label="Erklärung zur Sendungsverfolgung in neuem Tab öffnen" title="Erklärung zur Sendungsverfolgung">?</a></h2></div><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={refreshing}><CloseIcon /></button></div>{loading && <p>Prognose wird geladen …</p>}{error && <p className="form-error">{error}</p>}{forecast?.kind === 'none' && <div className="shipment-tracking-forecast-modal__content"><ForecastStatusNotice forecast={forecast} onRequestForecastUpdate={onRequestForecastUpdate} requestDisabled={requestDisabled} /></div>}{forecast?.kind === 'arrival' && <div className={`shipment-tracking-forecast-modal__arrival shipment-tracking-forecast-modal__arrival--${forecast.state}`}><strong>{forecast.state === 'green' ? 'Angekommen innerhalb des Entladefensters' : 'Angekommen nach Ende des Entladefensters'}</strong><span>{timestamp(forecast.actualArrivalUnloadingAt)}</span></div>}{forecast?.kind === 'forecast' && <div className="shipment-tracking-forecast-modal__content"><ForecastStatusNotice forecast={forecast} onRequestForecastUpdate={onRequestForecastUpdate} requestDisabled={requestDisabled} /><ArrivalTimeline forecast={forecast} /><ScenarioFactors forecast={forecast} /><dl className="shipment-tracking-forecast-modal__details"><div><dt>Grundlage</dt><dd>{sourceLabel(forecast.source)}</dd></div><div><dt>Gültig bis</dt><dd>{forecast.expiresAt ? timestamp(forecast.expiresAt) : 'Bis zur tatsächlichen Entladeankunft'}</dd></div><div><dt>Farbgrenzen</dt><dd>Rot bis {forecast.thresholds.red}% · Grün ab {forecast.thresholds.green}%</dd></div><div><dt>Berechnete Pünktlichkeit</dt><dd>{percentage(forecast.onTimeSharePercent)} der Spanne vor Slotende</dd></div></dl>{data?.history?.length > 0 && <details className="shipment-tracking-forecast-modal__history"><summary>Prognosehistorie ({data.history.length})</summary><ol>{data.history.map((item) => <li key={item.id}>{historyLabel(item)}</li>)}</ol></details>}</div>}<div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={refreshing}>Schließen</button>{onRefresh && <button className="button" type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Aktualisiert …' : 'Aktualisieren'}</button>}</div></section></div>, document.body)
}
