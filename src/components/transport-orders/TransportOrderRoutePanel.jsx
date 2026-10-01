import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
function estimatedDriveTime(distanceKm) {
  const totalMinutes = Math.round((distanceKm / 70) * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours} Std.${minutes ? ` ${minutes} Min.` : ''}` : `${minutes} Min.`
}

export default function TransportOrderRoutePanel({ route, canEdit, calculating, error, needsRecalculation = false, onCalculate }) {
  const hasResult = Number.isFinite(route?.roundedDistanceKm)
  const shownError = error || (route?.status === 'failed' ? route.userSafeError : '')
  const buttonLabel = calculating ? 'Wird berechnet …' : hasResult ? 'Neu berechnen' : 'Berechnen'
  return <section className="transport-order-detail-section transport-order-route-panel"><div className="transport-order-route-panel__heading"><h3><StaticText source={"Strecke"} /></h3><button type="button" className={`button ${needsRecalculation ? 'button--warning' : 'button--secondary'}`} disabled={!canEdit || calculating} title={needsRecalculation ? 'Die Adresse wurde geändert. Bitte die Strecke neu berechnen.' : undefined} onClick={onCalculate}>{buttonLabel}</button></div>{hasResult && <div className="transport-order-route-panel__result"><span>{route.roundedDistanceKm} km</span><div className="transport-order-route-panel__drive-time"><span><StaticText source={"Fahrzeit:"} /> <strong>{estimatedDriveTime(route.roundedDistanceKm)}</strong></span><TranslatedProps sources={{"title":"Berechnung: Kilometerzahl geteilt durch die durchschnittliche Geschwindigkeit von 70 km/h.","aria-label":"Berechnung: Kilometerzahl geteilt durch die durchschnittliche Geschwindigkeit von 70 km/h."}}><span className="transport-order-route-panel__info" title="Berechnung: Kilometerzahl geteilt durch die durchschnittliche Geschwindigkeit von 70 km/h." aria-label="Berechnung: Kilometerzahl geteilt durch die durchschnittliche Geschwindigkeit von 70 km/h.">i</span></TranslatedProps></div></div>}{shownError && <p className="form-error">{shownError}</p>}{!canEdit && <p><StaticText source={"Für die Streckenberechnung ist die Berechtigung „Transportaufträge bearbeiten“ erforderlich."} /></p>}</section>
}
