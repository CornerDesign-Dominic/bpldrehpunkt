import { damageCaseStatusLabel, damageDuePresentation } from '../../lib/damages.js'

function formatCurrency(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function dueDatePresentation(damageCase) {
  const due = damageDuePresentation(damageCase)
  return { appearance: due.days === null ? 'none' : due.days <= 0 ? 'critical' : due.days <= 2 ? 'urgent' : due.days <= 5 ? 'warning' : 'none', value: damageCase.dueDate ? `${due.label} · ${formatDate(damageCase.dueDate)}` : 'Keine Frist' }
}

function TableHeader({ children }) {
  return <th><span className="table-sort-button damage-cases-table__header">{children}</span></th>
}

export default function DamageCasesTable({ cases, onOpen }) {
  if (!cases.length) return <p className="todos-gallery__state">Keine Fälle vorhanden.</p>
  return <div className="todos-table-frame"><table className="todos-table damage-cases-table"><thead><tr><TableHeader>Fallnummer</TableHeader><TableHeader>Status</TableHeader><TableHeader>Referenz / Auftrag</TableHeader><TableHeader>Anspruchsteller / Kunde</TableHeader><TableHeader>Unternehmer</TableHeader><TableHeader>Schadenhöhe</TableHeader><TableHeader>Offenes BPL-Risiko</TableHeader><TableHeader>Nächste Frist</TableHeader><TableHeader>Verantwortlich</TableHeader></tr></thead><tbody>{cases.map((damageCase) => {
    const due = dueDatePresentation(damageCase)
    return <tr className={`damage-cases-table__row todos-table__row--${due.appearance}`} key={damageCase.id} tabIndex="0" role="link" aria-label={`Fall ${damageCase.caseNumber} öffnen`} onClick={() => onOpen(damageCase)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(damageCase) } }}>
      <td className="todos-table__title damage-cases-table__case-number">{damageCase.caseNumber}</td>
      <td><span className={`todo-status damage-status damage-status--${damageCase.status}`}>{damageCaseStatusLabel(damageCase.status)}</span></td>
      <td title={damageCase.transportReference || ''}>{damageCase.transportReference || '—'}</td>
      <td title={damageCase.claimant || ''}>{damageCase.claimant || '—'}</td>
      <td title={damageCase.contractor || ''}>{damageCase.contractor || '—'}</td>
      <td>{formatCurrency(damageCase.damageAmount)}</td>
      <td>{formatCurrency(damageCase.openBplRisk)}</td>
      <td className={`todos-table__due todos-table__due--${due.appearance}`}>{due.value}</td>
      <td>{damageCase.responsibleUserName || '—'}</td>
    </tr>
  })}</tbody></table></div>
}
