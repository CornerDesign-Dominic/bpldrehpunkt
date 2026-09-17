function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }
function formatCurrency(value) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0) }

function TableHeader({ children }) {
  return <th><span className="table-sort-button insolvencies-table__header">{children}</span></th>
}

export default function InsolvenciesTable({ insolvencies, emptyMessage = 'Noch keine Insolvenzfälle vorhanden.', onOpen }) {
  if (!insolvencies.length) return <p className="todos-gallery__state">{emptyMessage}</p>
  return <div className="todos-table-frame"><table className="todos-table insolvencies-table"><thead><tr><TableHeader>Unternehmen</TableHeader><TableHeader>Insolvenzdatum</TableHeader><TableHeader>Aktenzeichen</TableHeader><TableHeader>Gerichtsstand</TableHeader><TableHeader>Verlust Netto</TableHeader></tr></thead><tbody>{insolvencies.map((insolvency) => <tr className="insolvencies-table__row" key={insolvency.id} tabIndex="0" role="link" aria-label={`Insolvenz von ${insolvency.partnerName} öffnen`} onClick={() => onOpen(insolvency)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(insolvency) } }}><td className="todos-table__title">{insolvency.partnerName}</td><td>{formatDate(insolvency.insolvencyDate)}</td><td>{insolvency.courtReference || '—'}</td><td>{insolvency.courtVenue || '—'}</td><td className={insolvency.lossNet > 0 ? 'insolvencies-table__net-loss insolvencies-table__net-loss--positive' : 'insolvencies-table__net-loss'}>{formatCurrency(insolvency.lossNet)}</td></tr>)}</tbody></table></div>
}
