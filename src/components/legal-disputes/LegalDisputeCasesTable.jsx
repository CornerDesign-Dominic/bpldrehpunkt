import { legalDisputeStatusLabel } from '../../lib/legalDisputes.js'

function TableHeader({ children }) {
  return <th><span className="table-sort-button legal-disputes-cases-table__header">{children}</span></th>
}

function formatCurrency(value) { return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value) }
function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }

export default function LegalDisputeCasesTable({ cases, emptyMessage, onOpen }) {
  if (!cases.length) return <p className="todos-gallery__state">{emptyMessage}</p>

  return <div className="todos-table-frame"><table className="data-table todos-table legal-disputes-cases-table"><thead><tr><TableHeader>Aktenzeichen</TableHeader><TableHeader>Gegenseite</TableHeader><TableHeader>Art</TableHeader><TableHeader>Status</TableHeader><TableHeader>Streitwert</TableHeader><TableHeader>Termin / Frist</TableHeader></tr></thead><tbody>{cases.map((legalDispute) => <tr className={onOpen ? 'legal-disputes-cases-table__row' : ''} key={legalDispute.id} tabIndex={onOpen ? 0 : undefined} role={onOpen ? 'link' : undefined} aria-label={onOpen ? `Fall ${legalDispute.caseNumber || legalDispute.reference || ''} öffnen` : undefined} onClick={() => onOpen?.(legalDispute)} onKeyDown={(event) => { if (onOpen && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(legalDispute) } }}>
    <td className="todos-table__title">{legalDispute.caseNumber || legalDispute.reference || '—'}</td>
    <td>{legalDispute.counterparty || '—'}</td>
    <td>{legalDispute.caseType || '—'}</td>
    <td><span className={`todo-status damage-status damage-status--${legalDispute.status}`}>{legalDisputeStatusLabel(legalDispute.status)}</span></td>
    <td>{formatCurrency(legalDispute.amountInDispute)}</td>
    <td>{legalDispute.nextHearing ? formatDate(legalDispute.nextHearing) : formatDate(legalDispute.nextDeadline)}</td>
  </tr>)}</tbody></table></div>
}
