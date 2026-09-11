function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }

function TableHeader({ children }) {
  return <th><span className="table-sort-button insolvencies-table__header">{children}</span></th>
}

export default function InsolvenciesTable({ insolvencies, emptyMessage = 'Noch keine Insolvenzfälle vorhanden.', onOpen }) {
  if (!insolvencies.length) return <p className="todos-gallery__state">{emptyMessage}</p>
  return <div className="todos-table-frame"><table className="todos-table insolvencies-table"><thead><tr><TableHeader>Unternehmen</TableHeader><TableHeader>Insolvenzdatum</TableHeader><TableHeader>Aktenzeichen</TableHeader><TableHeader>Gerichtsstand</TableHeader></tr></thead><tbody>{insolvencies.map((insolvency) => <tr className="insolvencies-table__row" key={insolvency.id} tabIndex="0" role="link" aria-label={`Insolvenz von ${insolvency.partnerName} öffnen`} onClick={() => onOpen(insolvency)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(insolvency) } }}><td className="todos-table__title">{insolvency.partnerName}</td><td>{formatDate(insolvency.insolvencyDate)}</td><td>{insolvency.courtReference || '—'}</td><td>{insolvency.courtVenue || '—'}</td></tr>)}</tbody></table></div>
}
