function TableHeader({ children }) {
  return <th><span className="table-sort-button legal-disputes-cases-table__header">{children}</span></th>
}

export default function LegalDisputeCasesTable({ cases, emptyMessage }) {
  if (!cases.length) return <p className="todos-gallery__state">{emptyMessage}</p>

  return <div className="todos-table-frame"><table className="todos-table legal-disputes-cases-table"><thead><tr><TableHeader>Aktenzeichen / Referenz</TableHeader><TableHeader>Fall / Betreff</TableHeader><TableHeader>Beteiligter / Gegner</TableHeader><TableHeader>Art</TableHeader><TableHeader>Status</TableHeader><TableHeader>Streitwert</TableHeader><TableHeader>Nächster Termin / Frist</TableHeader><TableHeader>Zuständig</TableHeader><TableHeader>Zuletzt geändert</TableHeader></tr></thead><tbody>{cases.map((legalDispute) => <tr key={legalDispute.id}>
    <td className="todos-table__title">{legalDispute.reference || '—'}</td>
    <td>{legalDispute.subject || '—'}</td>
    <td>{legalDispute.counterparty || '—'}</td>
    <td>{legalDispute.type || '—'}</td>
    <td>{legalDispute.status || '—'}</td>
    <td>{legalDispute.amount || '—'}</td>
    <td>{legalDispute.nextDate || '—'}</td>
    <td>{legalDispute.responsibleUserName || '—'}</td>
    <td>{legalDispute.updatedAt || '—'}</td>
  </tr>)}</tbody></table></div>
}
