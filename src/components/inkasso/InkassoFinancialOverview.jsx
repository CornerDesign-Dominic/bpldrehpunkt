import { useState } from 'react'
import { createEmptyInkassoMovement, INKASSO_FINANCIAL_COST_TYPES } from '../../lib/inkasso.js'
import { CheckIcon, CloseIcon, EditIcon, TrashIcon } from '../icons.jsx'

function formatCurrency(value) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0) }
function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }
const financialCostTypes = new Set(INKASSO_FINANCIAL_COST_TYPES.map((item) => item.value))
function costTypeLabel(type) { return INKASSO_FINANCIAL_COST_TYPES.find((item) => item.value === type)?.label || 'Gebühr' }
function movementDirection(movement) { return movement.direction === 'received' ? 'received' : movement.type === 'payment' ? 'received' : 'paid' }
function directionLabel(direction) { return direction === 'received' ? 'Erhalten' : 'Bezahlt' }

function MovementFields({ draft, onChange }) {
  return <><td><input aria-label="Datum" type="date" value={draft.date} onChange={(event) => onChange('date', event.target.value)} /></td><td><select aria-label="Art" value={draft.type} onChange={(event) => onChange('type', event.target.value)}>{INKASSO_FINANCIAL_COST_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></td><td><select aria-label="Erhalten oder bezahlt" value={draft.direction} onChange={(event) => onChange('direction', event.target.value)}><option value="received">Erhalten</option><option value="paid">Bezahlt</option></select></td><td><input aria-label="Betrag netto" type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => onChange('amount', event.target.value)} /></td></>
}

export default function InkassoFinancialOverview({ canEdit, embedded = false, invoices = [], loading, movements, onDelete, onSave }) {
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const costMovements = movements.filter((movement) => financialCostTypes.has(movement.type))
  const totalClaims = invoices.reduce((total, invoice) => total + Number(invoice.netAmount || 0), 0)
  const paidClaims = invoices.filter((invoice) => invoice.isPaid === true).reduce((total, invoice) => total + Number(invoice.netAmount || 0), 0)
  const otherMovements = costMovements.reduce((total, movement) => total + (movementDirection(movement) === 'received' ? 1 : -1) * Number(movement.amount || 0), 0)
  const balance = totalClaims - paidClaims + otherMovements
  const columns = canEdit ? 5 : 4

  function updateDraft(field, value) { setDraft((current) => ({ ...current, values: { ...current.values, [field]: value } })); setError('') }
  async function saveDraft() { if (!draft) return; setSaving(true); setError(''); try { await onSave(draft.mode === 'edit' ? draft.movement : null, draft.values); setDraft(null) } catch (saveError) { setError(saveError.message || 'Die Betragsbewegung konnte nicht gespeichert werden.') } finally { setSaving(false) } }
  async function remove(movement) { setSaving(true); setError(''); try { await onDelete(movement) } catch (deleteError) { setError(deleteError.message || 'Die Betragsbewegung konnte nicht gelöscht werden.') } finally { setSaving(false) } }

  const Wrapper = embedded ? 'div' : 'section'
  const wrapperProps = embedded ? { className: 'inkasso-invoices-card__financial' } : { className: 'todo-detail-content damage-financial-overview inkasso-financial-overview' }

  return <Wrapper {...wrapperProps} aria-labelledby="inkasso-financial-overview-title">
    <div className="todo-detail-section-heading"><h3 id="inkasso-financial-overview-title">Bewegungen</h3>{canEdit && <button className="button damage-financial-overview__add" type="button" disabled={Boolean(draft) || saving} onClick={() => { setError(''); setDraft({ mode: 'new', values: createEmptyInkassoMovement() }) }}>Bewegung hinzufügen</button>}</div>
    {error && <p className="form-error">{error}</p>}
    <div className="todos-table-frame damage-financial-overview__table-frame"><table className="data-table todos-table damage-financial-overview__table"><colgroup><col className="damage-financial-overview__date-column" /><col className="damage-financial-overview__movement-column" /><col className="damage-financial-overview__movement-column" /><col className="damage-financial-overview__amount-column" />{canEdit && <col className="damage-financial-overview__actions-column" />}</colgroup><thead><tr><th>Datum</th><th>Art</th><th>Erhalten / bezahlt</th><th>Betrag netto</th>{canEdit && <th className="damage-financial-overview__actions"><span className="sr-only">Aktionen</span></th>}</tr></thead><tbody>
      {loading ? <tr><td className="table-state" colSpan={columns}>Bewegungen werden geladen …</td></tr> : !costMovements.length && draft?.mode !== 'new' ? <tr><td className="table-state inkasso-empty-state" colSpan={columns}>Noch keine Bewegungen hinterlegt.</td></tr> : costMovements.map((movement) => {
        const editing = draft?.mode === 'edit' && draft.movement.id === movement.id
        return <tr className={editing ? 'damage-financial-overview__row--editing' : ''} key={movement.id}>{editing ? <><MovementFields draft={draft.values} onChange={updateDraft} /><td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--save" type="button" disabled={saving} onClick={saveDraft} aria-label="Speichern" title="Speichern"><CheckIcon size={15} /></button><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--cancel" type="button" disabled={saving} onClick={() => setDraft(null)} aria-label="Abbrechen" title="Abbrechen"><CloseIcon size={15} /></button></td></> : <><td>{formatDate(movement.date)}</td><td><span className="damage-financial-overview__movement">{costTypeLabel(movement.type)}</span></td><td>{directionLabel(movementDirection(movement))}</td><td>{formatCurrency(movement.amount)}</td>{canEdit && <td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action" type="button" disabled={Boolean(draft) || saving} onClick={() => { setError(''); setDraft({ mode: 'edit', movement, values: { date: movement.date, type: movement.type, direction: movementDirection(movement), amount: movement.amount } }) }} aria-label="Bearbeiten" title="Bearbeiten"><EditIcon size={15} /></button><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--delete" type="button" disabled={Boolean(draft) || saving} onClick={() => remove(movement)} aria-label="Löschen" title="Löschen"><TrashIcon size={15} /></button></td>}</>}</tr>
      })}
      {canEdit && draft?.mode === 'new' && <tr className="damage-financial-overview__row--editing"><MovementFields draft={draft.values} onChange={updateDraft} /><td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--save" type="button" disabled={saving} onClick={saveDraft} aria-label="Speichern" title="Speichern"><CheckIcon size={15} /></button><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--cancel" type="button" disabled={saving} onClick={() => setDraft(null)} aria-label="Abbrechen" title="Abbrechen"><CloseIcon size={15} /></button></td></tr>}
    </tbody></table></div>
    <div className="inkasso-financial-overview__summary"><div><span>Gesamt Forderungen</span><strong>{formatCurrency(totalClaims)}</strong></div><div><span>Forderungen bezahlt</span><strong>{formatCurrency(paidClaims)}</strong></div><div><span>Weitere Bewegungen</span><strong>{formatCurrency(otherMovements)}</strong></div><div className="inkasso-financial-overview__total"><span>Saldo Forderungen + Bewegungen</span><strong>{formatCurrency(balance)}</strong></div></div>
  </Wrapper>
}
