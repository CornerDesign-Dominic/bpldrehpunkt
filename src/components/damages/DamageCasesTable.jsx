import { damageCaseStatusLabel, damageDuePresentation } from '../../lib/damages.js'

function formatCurrency(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function DueDate({ damageCase }) {
  const due = damageDuePresentation(damageCase)
  const value = damageCase.dueDate ? `${due.label} · ${formatDate(damageCase.dueDate)}` : '—'
  return <span className={`damage-due damage-due--${due.kind}`}>{value}</span>
}

export default function DamageCasesTable({ cases, onOpen }) {
  if (!cases.length) return <p className="damage-cases__empty">Keine Fälle vorhanden.</p>
  return <div className="damage-table-frame"><table className="damage-table"><thead><tr><th>Fallnummer</th><th>Status</th><th>Referenz / Auftrag</th><th>Anspruchsteller / Kunde</th><th>Unternehmer</th><th>Schadenhöhe</th><th>Offenes BPL-Risiko</th><th>Nächste Frist</th><th>Verantwortlich</th></tr></thead><tbody>{cases.map((damageCase) => <tr key={damageCase.id} tabIndex="0" onClick={() => onOpen(damageCase)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(damageCase) } }}>
    <td className="damage-table__case-number">{damageCase.caseNumber}</td>
    <td><span className={`damage-status damage-status--${damageCase.status}`}>{damageCaseStatusLabel(damageCase.status)}</span></td>
    <td title={damageCase.transportReference || ''}>{damageCase.transportReference || '—'}</td>
    <td title={damageCase.claimant || ''}>{damageCase.claimant || '—'}</td>
    <td title={damageCase.contractor || ''}>{damageCase.contractor || '—'}</td>
    <td>{formatCurrency(damageCase.damageAmount)}</td>
    <td>{formatCurrency(damageCase.openBplRisk)}</td>
    <td><DueDate damageCase={damageCase} /></td>
    <td>{damageCase.responsibleUserName || '—'}</td>
  </tr>)}</tbody></table></div>
}
