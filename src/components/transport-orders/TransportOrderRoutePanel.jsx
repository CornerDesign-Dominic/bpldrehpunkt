import { useState } from 'react'

const dateFormatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' })

function routeDate(value) { return value?.toDate ? dateFormatter.format(value.toDate()) : '—' }
function estimatedDriveTime(distanceKm) {
  const totalMinutes = Math.round((distanceKm / 70) * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours} Std.${minutes ? ` ${minutes} Min.` : ''}` : `${minutes} Min.`
}

export default function TransportOrderRoutePanel({ route, canEdit, calculating, error, onCalculate }) {
  const hasResult = Number.isFinite(route?.roundedDistanceKm)
  const shownError = error || (route?.status === 'failed' ? route.userSafeError : '')
  const buttonLabel = calculating ? 'Wird berechnet …' : hasResult ? 'Neu berechnen' : 'Berechnen'
  const [detailsOpen, setDetailsOpen] = useState(false)
  return <section className="transport-order-detail-section transport-order-route-panel"><div className="transport-order-route-panel__heading"><h3>Strecke</h3><button type="button" className="button button--secondary" disabled={!canEdit || calculating} onClick={onCalculate}>{buttonLabel}</button></div>{hasResult && <div className="transport-order-route-panel__result"><span>{route.roundedDistanceKm} km</span><div className="transport-order-route-panel__drive-time"><span>Fahrzeit: <strong>{estimatedDriveTime(route.roundedDistanceKm)}</strong></span><span className="transport-order-route-panel__info" title="Berechnung: Kilometerzahl geteilt durch die durchschnittliche Geschwindigkeit von 70 km/h." aria-label="Berechnung: Kilometerzahl geteilt durch die durchschnittliche Geschwindigkeit von 70 km/h.">i</span></div><button type="button" className="transport-order-route-panel__details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>Weitere Details <span aria-hidden="true">{detailsOpen ? '⌃' : '⌄'}</span></button>{detailsOpen && <div className="transport-order-route-panel__details"><small>Zuletzt berechnet am {routeDate(route.calculatedAt)}</small></div>}</div>}{shownError && <p className="form-error">{shownError}</p>}{!canEdit && <p>Für die Streckenberechnung ist die Berechtigung „Transportaufträge bearbeiten“ erforderlich.</p>}</section>
}
