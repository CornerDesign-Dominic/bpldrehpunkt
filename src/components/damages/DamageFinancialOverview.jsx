import { DAMAGE_MOVEMENT_DIRECTIONS, DAMAGE_MOVEMENT_STATUSES } from '../../lib/damages.js'

const pendingStatuses = new Set(['expected', 'requested', 'promised'])

function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0)
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function labelFor(options, value) {
  return options.find((option) => option.value === value)?.label || '—'
}

function valueClass(value) {
  return value > 0 ? 'damage-financial-overview__amount--positive' : value < 0 ? 'damage-financial-overview__amount--negative' : 'damage-financial-overview__amount--neutral'
}

function sum(movements, predicate) {
  return movements.filter(predicate).reduce((total, movement) => total + Number(movement.amount || 0), 0)
}

export default function DamageFinancialOverview({ canEdit, loading, movements, onAdd, onDelete, onEdit }) {
  const receivedIncome = sum(movements, (movement) => movement.direction === 'income' && movement.status === 'received')
  const paidExpenses = sum(movements, (movement) => movement.direction === 'expense' && movement.status === 'paid')
  const balance = receivedIncome - paidExpenses
  const expectedIncome = sum(movements, (movement) => movement.direction === 'income' && pendingStatuses.has(movement.status))
  const expectedExpenses = sum(movements, (movement) => movement.direction === 'expense' && pendingStatuses.has(movement.status))
  const expectedBalance = balance + expectedIncome - expectedExpenses
  const columns = canEdit ? 7 : 6

  return <section className="todo-detail-content damage-financial-overview" aria-labelledby="damage-financial-overview-title">
    <div className="todo-detail-section-heading"><h3 id="damage-financial-overview-title">Finanzieller Überblick</h3>{canEdit && <button className="button damage-financial-overview__add" type="button" onClick={onAdd}>Bewegung hinzufügen</button>}</div>
    <div className="todos-table-frame damage-financial-overview__table-frame"><table className="todos-table damage-financial-overview__table"><thead><tr><th>Datum</th><th>Richtung</th><th>Betrag</th><th>Zweck / Beschreibung</th><th>Beteiligter</th><th>Status</th>{canEdit && <th className="damage-financial-overview__actions">Aktionen</th>}</tr></thead><tbody>
      {loading ? <tr><td className="table-state" colSpan={columns}>Betragsbewegungen werden geladen …</td></tr> : !movements.length ? <tr><td className="table-state" colSpan={columns}>Noch keine Betragsbewegungen hinterlegt.</td></tr> : movements.map((movement) => <tr key={movement.id}><td>{formatDate(movement.movementDate)}</td><td><span className={`damage-movement-direction damage-movement-direction--${movement.direction}`}>{labelFor(DAMAGE_MOVEMENT_DIRECTIONS, movement.direction)}</span></td><td className={`damage-financial-overview__value damage-financial-overview__value--${movement.direction}`}>{formatCurrency(movement.amount)}</td><td className="damage-financial-overview__description" title={movement.description || ''}>{movement.description || '—'}</td><td>{movement.participant}</td><td><span className="damage-movement-status">{labelFor(DAMAGE_MOVEMENT_STATUSES, movement.status)}</span></td>{canEdit && <td className="damage-financial-overview__actions"><button type="button" onClick={() => onEdit(movement)}>Bearbeiten</button><button type="button" onClick={() => onDelete(movement)}>Löschen</button></td>}</tr>)}
    </tbody></table></div>
    <div className="damage-financial-overview__totals"><div className="damage-financial-overview__actual"><div><span>Einnahmen BPL</span><strong>{formatCurrency(receivedIncome)}</strong></div><div><span>Ausgaben BPL</span><strong>{formatCurrency(paidExpenses)}</strong></div><div className="damage-financial-overview__balance"><span>Saldo BPL</span><strong className={valueClass(balance)}>{formatCurrency(balance)}</strong></div></div><div className="damage-financial-overview__expected"><span>Erwartete Einnahmen: <strong>{formatCurrency(expectedIncome)}</strong></span><span>Erwartete Ausgaben: <strong>{formatCurrency(expectedExpenses)}</strong></span><span>Voraussichtlicher Saldo: <strong className={valueClass(expectedBalance)}>{formatCurrency(expectedBalance)}</strong></span></div></div>
  </section>
}
