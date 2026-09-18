import { inkassoCaseStatusLabel, inkassoDeadlinePresentation } from '../../lib/inkasso.js'

function formatCurrency(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function nextDeadlinePresentation(inkassoCase) {
  const due = inkassoDeadlinePresentation(inkassoCase.nextDeadline)
  const appearance = due.kind === 'overdue' || due.kind === 'today' ? 'critical' : due.kind === 'urgent' ? 'urgent' : due.kind === 'warning' ? 'warning' : 'none'
  return { appearance, value: inkassoCase.nextDeadline ? `${due.label} · ${formatDate(inkassoCase.nextDeadline.date)}` : '—' }
}

function TableHeader({ children }) {
  return <th><span className="table-sort-button">{children}</span></th>
}

export default function InkassoCasesTable({ cases, emptyMessage, onOpen }) {
  if (!cases.length) return <p className="todos-gallery__state">{emptyMessage}</p>

  return <div className="inkasso-cases-table-frame"><table className="data-table todos-table inkasso-cases-table"><thead><tr><TableHeader>Akten-/Fallnummer</TableHeader><TableHeader>Schuldner</TableHeader><TableHeader>Forderungsbetrag</TableHeader><TableHeader>Status</TableHeader><TableHeader>Nächste Fälligkeit / Termin</TableHeader></tr></thead><tbody>{cases.map((inkassoCase) => {
    const canOpen = typeof onOpen === 'function'
    const due = nextDeadlinePresentation(inkassoCase)
    return <tr className={`${canOpen ? 'inkasso-cases-table__row' : ''} todos-table__row--${due.appearance}`} key={inkassoCase.id} {...(canOpen ? { tabIndex: 0, role: 'link', 'aria-label': `Inkassofall ${inkassoCase.caseNumber || inkassoCase.id} öffnen`, onClick: () => onOpen(inkassoCase), onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(inkassoCase) } } } : {})}>
      <td className="todos-table__title">{inkassoCase.caseNumber || '—'}</td>
      <td>{inkassoCase.debtorName || inkassoCase.customerName || '—'}</td>
      <td>{formatCurrency(inkassoCase.claimAmount)}</td>
      <td><span className={`todo-status damage-status damage-status--${inkassoCase.status}`}>{inkassoCaseStatusLabel(inkassoCase.status)}</span></td>
      <td className={`todos-table__due todos-table__due--${due.appearance}`}>{due.value}</td>
    </tr>
  })}</tbody></table></div>
}
