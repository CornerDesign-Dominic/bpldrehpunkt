function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }
function formatTimestamp(value) { const date = value?.toDate?.(); return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date) : '—' }

export default function InsolvenciesTable({ insolvencies, onOpen }) {
  if (!insolvencies.length) return <p className="todos-gallery__state">Noch keine Insolvenzfälle vorhanden.</p>
  return <div className="todos-table-frame"><table className="todos-table"><thead><tr><th>Unternehmen</th><th>Insolvenzdatum</th><th>Aktenzeichen</th><th>Gerichtsstand</th><th>Zuletzt geändert</th></tr></thead><tbody>{insolvencies.map((insolvency) => <tr className="legal-disputes-cases-table__row" key={insolvency.id} tabIndex="0" role="link" aria-label={`Insolvenz von ${insolvency.partnerName} öffnen`} onClick={() => onOpen(insolvency)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(insolvency) } }}><td className="todos-table__title">{insolvency.partnerName}</td><td>{formatDate(insolvency.insolvencyDate)}</td><td>{insolvency.courtReference || '—'}</td><td>{insolvency.courtVenue || '—'}</td><td>{formatTimestamp(insolvency.updatedAt)}</td></tr>)}</tbody></table></div>
}
