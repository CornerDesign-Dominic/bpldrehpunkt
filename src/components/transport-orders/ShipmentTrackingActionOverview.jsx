import { FaCircleCheck, FaCircleExclamation, FaCircleInfo, FaClock } from 'react-icons/fa6'
import { shipmentTrackingDryRunPresentation } from '../../lib/shipmentTrackingDryRunPresentation.js'

const stateLabels = Object.freeze({ planned: 'Geplant', missed: 'Verpasst', sent: 'Versendet', skipped: 'Übersprungen', blocked: 'Blockiert' })
const stateIcons = Object.freeze({ planned: FaClock, missed: FaCircleExclamation, sent: FaCircleCheck, skipped: FaCircleInfo, blocked: FaCircleExclamation })

function ruleQualifier(entry) {
  if (entry.title === 'Interne Eskalation') return 'intern'
  if (entry.title === 'Erste Anfrage an Unternehmer') return 'Erste Anfrage'
  if (entry.title === 'Erinnerung an Unternehmer') {
    const reminder = entry.id.match(/\.reminder\.(\d+)$/)
    return reminder ? `${reminder[1]}. Erinnerung` : 'Erinnerung'
  }
  return entry.title
}

/** Compact, read-only plan of all effective tracking actions and outcomes. */
export default function ShipmentTrackingActionOverview({ preview, loading = false, error = '' }) {
  const model = shipmentTrackingDryRunPresentation(preview)
  if (loading) return <section className="shipment-tracking-action-overview" aria-labelledby="shipment-tracking-action-overview-heading"><div className="shipment-tracking-action-overview__heading"><h4 id="shipment-tracking-action-overview-heading">Aktionsübersicht</h4></div><p>Aktionsübersicht wird berechnet …</p></section>
  if (error) return null
  return <section className="shipment-tracking-action-overview" aria-labelledby="shipment-tracking-action-overview-heading">
    <div className="shipment-tracking-action-overview__heading"><h4 id="shipment-tracking-action-overview-heading">Aktionsübersicht</h4></div>
    {model.entries.length ? <ol className="shipment-tracking-action-overview__entries">{model.entries.map((entry) => {
      const Icon = stateIcons[entry.state] || FaCircleInfo
      return <li className={`shipment-tracking-action-overview__entry shipment-tracking-action-overview__entry--${entry.state}`} key={entry.id}>
        <div className="shipment-tracking-action-overview__entry-main"><div className="shipment-tracking-action-overview__entry-content"><strong>{entry.topic} <span className="shipment-tracking-action-overview__qualifier">({ruleQualifier(entry)})</span></strong><span className="shipment-tracking-action-overview__status-text">{entry.statusText}</span></div><div className="shipment-tracking-action-overview__meta"><span className="shipment-tracking-action-overview__state"><Icon aria-hidden="true" />{stateLabels[entry.state] || entry.state}</span><span className="shipment-tracking-action-overview__time">{entry.time}</span></div></div>
        <details className="shipment-tracking-action-overview__details"><summary>Weitere Infos</summary><dl><div><dt>Auslöser</dt><dd>{entry.trigger}</dd></div><div><dt>Regel</dt><dd>{entry.reason || 'Keine zusätzliche Regelbeschreibung vorhanden.'}</dd></div><div><dt>Empfänger</dt><dd>{entry.recipient}</dd></div>{entry.ruleIds.length > 1 && <div><dt>Regelstufen</dt><dd>{entry.ruleIds.length} zeitgleiche Regelstufen zusammengefasst.</dd></div>}{entry.adjustmentReason && <div><dt>Berechnung</dt><dd>{entry.adjustmentReason}</dd></div>}{entry.state === 'missed' && <div><dt>Status</dt><dd>Verpasst – die automatische Ausführung wurde nicht dokumentiert.</dd></div>}{entry.state === 'skipped' && <div><dt>Grund</dt><dd>{entry.pauseText || 'Die Automatik war zum Fälligkeitszeitpunkt pausiert.'}</dd></div>}{entry.state === 'blocked' && <div><dt>Grund</dt><dd>{entry.recipient === 'Empfänger fehlt' ? 'Für diese externe Anfrage ist keine manuell hinterlegte Unternehmer-E-Mail vorhanden.' : 'Der Fälligkeitszeitpunkt konnte nicht berechnet werden.'}</dd></div>}{entry.state === 'sent' && <div><dt>Versandzeitpunkt</dt><dd>{entry.statusText.replace(/^Versendet /, '')}</dd></div>}</dl></details>
      </li>
    })}</ol> : <p>{model.emptyMessage}</p>}
  </section>
}
