import { useState } from 'react'
import { createEmptyDamageMovement, DAMAGE_MOVEMENT_COUNTERPARTIES, DAMAGE_MOVEMENT_TRANSACTION_TYPES } from '../../lib/damages.js'
import { CheckIcon, CloseIcon, EditIcon, TrashIcon } from '../icons.jsx'

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

function MovementFields({ draft, onChange }) {
  return <><td><input aria-label="Datum" type="date" value={draft.date} onChange={(event) => onChange('date', event.target.value)} /></td><td><div className="damage-financial-overview__edit-movement"><select aria-label="Vorgang" value={draft.transactionType} onChange={(event) => onChange('transactionType', event.target.value)}>{DAMAGE_MOVEMENT_TRANSACTION_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label} {option.value === 'received' || option.value === 'paid' ? '(IST)' : '(SOLL)'}</option>)}</select><select aria-label="Gegenpartei" value={draft.counterpartyType} onChange={(event) => onChange('counterpartyType', event.target.value)}>{DAMAGE_MOVEMENT_COUNTERPARTIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></td><td><input aria-label="Betrag" type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => onChange('amount', event.target.value)} /></td></>
}

export default function DamageFinancialOverview({ canEdit, loading, movements, onDelete, onSave }) {
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const received = sum(movements, 'received')
  const paid = sum(movements, 'paid')
  const expectedReceivable = sum(movements, 'expected_receivable')
  const expectedPayable = sum(movements, 'expected_payable')
  const actualBalance = received - paid
  const expectedBalance = actualBalance + expectedReceivable - expectedPayable
  const columns = canEdit ? 4 : 3

  function startNew() {
    setError('')
    setDraft({ mode: 'new', values: createEmptyDamageMovement() })
  }

  function startEdit(movement) {
    setError('')
    setDraft({ mode: 'edit', movement, values: { date: movement.date, transactionType: movement.transactionType, counterpartyType: movement.counterpartyType, amount: movement.amount } })
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, values: { ...current.values, [field]: value } }))
    setError('')
  }

  async function saveDraft() {
    if (!draft) return
    setSaving(true)
    setError('')
    try {
      await onSave(draft.mode === 'edit' ? draft.movement : null, draft.values)
      setDraft(null)
    } catch (saveError) { setError(saveError.message || 'Die Betragsbewegung konnte nicht gespeichert werden.') } finally { setSaving(false) }
  }

  async function deleteMovement(movement) {
    setSaving(true)
    setError('')
    try { await onDelete(movement) } catch (deleteError) { setError(deleteError.message || 'Die Betragsbewegung konnte nicht gelöscht werden.') } finally { setSaving(false) }
  }

  return <section className="todo-detail-content damage-financial-overview" aria-labelledby="damage-financial-overview-title">
    <div className="todo-detail-section-heading"><h3 id="damage-financial-overview-title">Finanzieller Überblick</h3>{canEdit && <button className="button damage-financial-overview__add" type="button" disabled={Boolean(draft) || saving} onClick={startNew}>Bewegung hinzufügen</button>}</div>
    {error && <p className="form-error">{error}</p>}
    <div className="todos-table-frame damage-financial-overview__table-frame"><table className="todos-table damage-financial-overview__table"><colgroup><col className="damage-financial-overview__date-column" /><col className="damage-financial-overview__movement-column" /><col className="damage-financial-overview__amount-column" />{canEdit && <col className="damage-financial-overview__actions-column" />}</colgroup><thead><tr><th>Datum</th><th>Bewegung</th><th>Betrag</th>{canEdit && <th className="damage-financial-overview__actions">Aktionen</th>}</tr></thead><tbody>
      {loading ? <tr><td className="table-state" colSpan={columns}>Betragsbewegungen werden geladen …</td></tr> : !movements.length && draft?.mode !== 'new' ? <tr><td className="table-state" colSpan={columns}>Noch keine Betragsbewegungen hinterlegt.</td></tr> : movements.map((movement) => {
        const isEditing = draft?.mode === 'edit' && draft.movement.id === movement.id
        return <tr className={isEditing ? 'damage-financial-overview__row--editing' : ''} key={movement.id}>{isEditing ? <><MovementFields draft={draft.values} onChange={updateDraft} /><td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--save" type="button" disabled={saving} onClick={saveDraft} aria-label="Speichern" title="Speichern"><CheckIcon size={15} /></button><button className="damage-financial-overview__icon-action" type="button" disabled={saving} onClick={() => setDraft(null)} aria-label="Abbrechen" title="Abbrechen"><CloseIcon size={15} /></button></td></> : <><td>{formatDate(movement.date)}</td><td><span className="damage-financial-overview__movement">{labelFor(DAMAGE_MOVEMENT_TRANSACTION_TYPES, movement.transactionType)} {labelFor(DAMAGE_MOVEMENT_COUNTERPARTIES, movement.counterpartyType)}</span></td><td className={`damage-financial-overview__value damage-financial-overview__value--${movement.transactionType}`}>{formatCurrency(movement.amount)}</td>{canEdit && <td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action" type="button" disabled={Boolean(draft) || saving} onClick={() => startEdit(movement)} aria-label="Bearbeiten" title="Bearbeiten"><EditIcon size={15} /></button><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--delete" type="button" disabled={Boolean(draft) || saving} onClick={() => deleteMovement(movement)} aria-label="Löschen" title="Löschen"><TrashIcon size={15} /></button></td>}</>}</tr>
      })}
      {canEdit && draft?.mode === 'new' && <tr className="damage-financial-overview__row--editing"><MovementFields draft={draft.values} onChange={updateDraft} /><td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--save" type="button" disabled={saving} onClick={saveDraft} aria-label="Speichern" title="Speichern"><CheckIcon size={15} /></button><button className="damage-financial-overview__icon-action" type="button" disabled={saving} onClick={() => setDraft(null)} aria-label="Abbrechen" title="Abbrechen"><CloseIcon size={15} /></button></td></tr>}
    </tbody></table></div>
    <div className="damage-financial-overview__totals"><div><span>Ist-Saldo BPL</span><strong className={valueClass(actualBalance)}>{formatCurrency(actualBalance)}</strong></div><div><span>Voraussichtlicher Saldo BPL</span><strong className={valueClass(expectedBalance)}>{formatCurrency(expectedBalance)}</strong></div></div>
  </section>
}
