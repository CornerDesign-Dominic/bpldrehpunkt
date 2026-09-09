import { DAMAGE_MOVEMENT_COUNTERPARTIES, DAMAGE_MOVEMENT_TRANSACTION_TYPES } from '../../lib/damages.js'
import { EditIcon, TrashIcon } from '../icons.jsx'

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

function sum(movements, transactionType) {
  return movements.filter((movement) => movement.transactionType === transactionType).reduce((total, movement) => total + Number(movement.amount || 0), 0)
}

export default function DamageFinancialOverview({ canEdit, loading, movements, onAdd, onDelete, onEdit }) {
  const received = sum(movements, 'received')
  const paid = sum(movements, 'paid')
  const expectedReceivable = sum(movements, 'expected_receivable')
  const expectedPayable = sum(movements, 'expected_payable')
  const actualBalance = received - paid
  const expectedBalance = actualBalance + expectedReceivable - expectedPayable
  const columns = canEdit ? 4 : 3

  return <section className="todo-detail-content damage-financial-overview" aria-labelledby="damage-financial-overview-title">
    <div className="todo-detail-section-heading"><h3 id="damage-financial-overview-title">Finanzieller Überblick</h3>{canEdit && <button className="button damage-financial-overview__add" type="button" onClick={onAdd}>Bewegung hinzufügen</button>}</div>
    <div className="todos-table-frame damage-financial-overview__table-frame"><table className="todos-table damage-financial-overview__table"><colgroup><col className="damage-financial-overview__date-column" /><col className="damage-financial-overview__movement-column" /><col className="damage-financial-overview__amount-column" />{canEdit && <col className="damage-financial-overview__actions-column" />}</colgroup><thead><tr><th>Datum</th><th>Bewegung</th><th>Betrag</th>{canEdit && <th className="damage-financial-overview__actions">Aktionen</th>}</tr></thead><tbody>
      {loading ? <tr><td className="table-state" colSpan={columns}>Betragsbewegungen werden geladen …</td></tr> : !movements.length ? <tr><td className="table-state" colSpan={columns}>Noch keine Betragsbewegungen hinterlegt.</td></tr> : movements.map((movement) => <tr key={movement.id}><td>{formatDate(movement.date)}</td><td><span className="damage-financial-overview__movement">{labelFor(DAMAGE_MOVEMENT_TRANSACTION_TYPES, movement.transactionType)} {labelFor(DAMAGE_MOVEMENT_COUNTERPARTIES, movement.counterpartyType)}</span></td><td className={`damage-financial-overview__value damage-financial-overview__value--${movement.transactionType}`}>{formatCurrency(movement.amount)}</td>{canEdit && <td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action" type="button" onClick={() => onEdit(movement)} aria-label="Bearbeiten" title="Bearbeiten"><EditIcon size={15} /></button><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--delete" type="button" onClick={() => onDelete(movement)} aria-label="Löschen" title="Löschen"><TrashIcon size={15} /></button></td>}</tr>)}
    </tbody></table></div>
    <div className="damage-financial-overview__totals"><div><span>Ist-Saldo BPL</span><strong className={valueClass(actualBalance)}>{formatCurrency(actualBalance)}</strong></div><div><span>Voraussichtlicher Saldo BPL</span><strong className={valueClass(expectedBalance)}>{formatCurrency(expectedBalance)}</strong></div></div>
  </section>
}
