import { inkassoCaseStatusLabel } from '../../lib/inkasso.js'

function formatCurrency(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function TableHeader({ children }) {
  return <th><span className="table-sort-button">{children}</span></th>
}

export default function InkassoCasesTable({ cases, emptyMessage, onOpen }) {
  if (!cases.length) return <p className="todos-gallery__state">{emptyMessage}</p>

  return <div className="inkasso-cases-table-frame"><table className="data-table todos-table inkasso-cases-table"><thead><tr><TableHeader>Akten-/Fallnummer</TableHeader><TableHeader>Kunde / Schuldner</TableHeader><TableHeader>Forderungsbetrag</TableHeader><TableHeader>Status</TableHeader></tr></thead><tbody>{cases.map((inkassoCase) => {
    const canOpen = typeof onOpen === 'function'
    return <tr className={canOpen ? 'inkasso-cases-table__row' : ''} key={inkassoCase.id} {...(canOpen ? { tabIndex: 0, role: 'link', 'aria-label': `Inkassofall ${inkassoCase.caseNumber || inkassoCase.id} öffnen`, onClick: () => onOpen(inkassoCase), onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(inkassoCase) } } } : {})}>
      <td className="todos-table__title">{inkassoCase.caseNumber || '—'}</td>
      <td>{inkassoCase.debtorName || inkassoCase.customerName || '—'}</td>
      <td>{formatCurrency(inkassoCase.claimAmount)}</td>
      <td><span className={`todo-status damage-status damage-status--${inkassoCase.status}`}>{inkassoCaseStatusLabel(inkassoCase.status)}</span></td>
    </tr>
  })}</tbody></table></div>
}
