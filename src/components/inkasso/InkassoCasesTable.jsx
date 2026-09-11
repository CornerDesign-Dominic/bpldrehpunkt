function formatCurrency(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function formatDate(value) {
  if (!value) return '—'
  const date = typeof value?.toDate === 'function' ? value.toDate() : value instanceof Date ? value : new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE').format(date)
}

function TableHeader({ children }) {
  return <th><span className="table-sort-button">{children}</span></th>
}

export default function InkassoCasesTable({ cases, emptyMessage, onOpen }) {
  if (!cases.length) return <p className="todos-gallery__state">{emptyMessage}</p>

  return <div className="todos-table-frame"><table className="todos-table"><thead><tr><TableHeader>Akten-/Fallnummer</TableHeader><TableHeader>Kunde / Schuldner</TableHeader><TableHeader>Forderungsbetrag</TableHeader><TableHeader>Status</TableHeader><TableHeader>Zuständig</TableHeader><TableHeader>Erstellt am</TableHeader><TableHeader>Letzter Bearbeitungsstand</TableHeader></tr></thead><tbody>{cases.map((inkassoCase) => {
    const canOpen = typeof onOpen === 'function'
    return <tr className={canOpen ? 'damage-cases-table__row' : ''} key={inkassoCase.id} {...(canOpen ? { tabIndex: 0, role: 'link', 'aria-label': `Inkassofall ${inkassoCase.caseNumber || inkassoCase.id} öffnen`, onClick: () => onOpen(inkassoCase), onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(inkassoCase) } } } : {})}>
      <td className="todos-table__title">{inkassoCase.caseNumber || '—'}</td>
      <td>{inkassoCase.debtorName || inkassoCase.customerName || '—'}</td>
      <td>{formatCurrency(inkassoCase.claimAmount)}</td>
      <td>{inkassoCase.status || '—'}</td>
      <td>{inkassoCase.responsibleUserName || '—'}</td>
      <td>{formatDate(inkassoCase.createdAt)}</td>
      <td>{inkassoCase.lastProcessingStatus || '—'}</td>
    </tr>
  })}</tbody></table></div>
}
