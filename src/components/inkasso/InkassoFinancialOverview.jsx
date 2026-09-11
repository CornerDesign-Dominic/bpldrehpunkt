import { useState } from 'react'
import { createEmptyInkassoMovement, INKASSO_MOVEMENT_TYPES } from '../../lib/inkasso.js'
import { CheckIcon, CloseIcon, EditIcon, TrashIcon } from '../icons.jsx'

function formatCurrency(value) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0) }
function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }
function typeLabel(type) { return INKASSO_MOVEMENT_TYPES.find((item) => item.value === type)?.label || '—' }
function sum(movements, type) { return movements.filter((movement) => movement.type === type).reduce((total, movement) => total + Number(movement.amount || 0), 0) }

function MovementFields({ draft, onChange }) {
  return <><td><input aria-label="Datum" type="date" value={draft.date} onChange={(event) => onChange('date', event.target.value)} /></td><td><div className="damage-financial-overview__edit-movement"><select aria-label="Art" value={draft.type} onChange={(event) => onChange('type', event.target.value)}>{INKASSO_MOVEMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input aria-label="Hinweis" value={draft.description || ''} maxLength="500" placeholder="Hinweis" onChange={(event) => onChange('description', event.target.value)} /></div></td><td><input aria-label="Betrag" type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => onChange('amount', event.target.value)} /></td></>
}

export default function InkassoFinancialOverview({ canEdit, loading, movements, onDelete, onSave }) {
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const mainClaim = sum(movements, 'main_claim')
  const paid = sum(movements, 'payment')
  const dunningCosts = sum(movements, 'dunning_costs')
  const interest = sum(movements, 'interest')
  const legalFees = sum(movements, 'legal_fees')
  const courtCosts = sum(movements, 'court_costs')
  const collectionCosts = sum(movements, 'collection_costs')
  const otherCosts = sum(movements, 'other_costs')
  const totalClaim = mainClaim + dunningCosts + interest + legalFees + courtCosts + collectionCosts + otherCosts
  const outstandingMainClaim = Math.max(0, mainClaim - paid)
  const outstandingTotal = Math.max(0, totalClaim - paid)
  const columns = canEdit ? 4 : 3

  function updateDraft(field, value) { setDraft((current) => ({ ...current, values: { ...current.values, [field]: value } })); setError('') }
  async function saveDraft() { if (!draft) return; setSaving(true); setError(''); try { await onSave(draft.mode === 'edit' ? draft.movement : null, draft.values); setDraft(null) } catch (saveError) { setError(saveError.message || 'Die Betragsbewegung konnte nicht gespeichert werden.') } finally { setSaving(false) } }
  async function remove(movement) { setSaving(true); setError(''); try { await onDelete(movement) } catch (deleteError) { setError(deleteError.message || 'Die Betragsbewegung konnte nicht gelöscht werden.') } finally { setSaving(false) } }

  return <section className="todo-detail-content damage-financial-overview inkasso-financial-overview" aria-labelledby="inkasso-financial-overview-title">
    <div className="todo-detail-section-heading"><h3 id="inkasso-financial-overview-title">Finanzieller Überblick</h3>{canEdit && <button className="button damage-financial-overview__add" type="button" disabled={Boolean(draft) || saving} onClick={() => { setError(''); setDraft({ mode: 'new', values: createEmptyInkassoMovement() }) }}>Bewegung hinzufügen</button>}</div>
    {error && <p className="form-error">{error}</p>}
    <div className="inkasso-financial-overview__summary"><div><span>Ursprüngliche Hauptforderung</span><strong>{formatCurrency(mainClaim)}</strong></div><div><span>Bereits gezahlt</span><strong>{formatCurrency(paid)}</strong></div><div><span>Offene Hauptforderung</span><strong>{formatCurrency(outstandingMainClaim)}</strong></div><div><span>Mahnkosten</span><strong>{formatCurrency(dunningCosts)}</strong></div><div><span>Zinsen</span><strong>{formatCurrency(interest)}</strong></div><div><span>Rechtsanwaltskosten</span><strong>{formatCurrency(legalFees)}</strong></div><div><span>Gerichtskosten</span><strong>{formatCurrency(courtCosts)}</strong></div><div><span>Inkasso- / sonstige Kosten</span><strong>{formatCurrency(collectionCosts + otherCosts)}</strong></div><div className="inkasso-financial-overview__total"><span>Gesamtforderung</span><strong>{formatCurrency(totalClaim)}</strong></div><div className="inkasso-financial-overview__total"><span>Noch offener Gesamtbetrag</span><strong>{formatCurrency(outstandingTotal)}</strong></div></div>
    <div className="todos-table-frame damage-financial-overview__table-frame"><table className="todos-table damage-financial-overview__table"><colgroup><col className="damage-financial-overview__date-column" /><col className="damage-financial-overview__movement-column" /><col className="damage-financial-overview__amount-column" />{canEdit && <col className="damage-financial-overview__actions-column" />}</colgroup><thead><tr><th>Datum</th><th>Bewegung</th><th>Betrag</th>{canEdit && <th className="damage-financial-overview__actions"><span className="sr-only">Aktionen</span></th>}</tr></thead><tbody>
      {loading ? <tr><td className="table-state" colSpan={columns}>Betragsbewegungen werden geladen …</td></tr> : !movements.length && draft?.mode !== 'new' ? <tr><td className="table-state" colSpan={columns}>Noch keine Betragsbewegungen hinterlegt.</td></tr> : movements.map((movement) => {
        const editing = draft?.mode === 'edit' && draft.movement.id === movement.id
        return <tr className={editing ? 'damage-financial-overview__row--editing' : ''} key={movement.id}>{editing ? <><MovementFields draft={draft.values} onChange={updateDraft} /><td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--save" type="button" disabled={saving} onClick={saveDraft} aria-label="Speichern" title="Speichern"><CheckIcon size={15} /></button><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--cancel" type="button" disabled={saving} onClick={() => setDraft(null)} aria-label="Abbrechen" title="Abbrechen"><CloseIcon size={15} /></button></td></> : <><td>{formatDate(movement.date)}</td><td><span className="damage-financial-overview__movement">{typeLabel(movement.type)}{movement.description ? ` · ${movement.description}` : ''}</span></td><td>{formatCurrency(movement.amount)}</td>{canEdit && <td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action" type="button" disabled={Boolean(draft) || saving} onClick={() => { setError(''); setDraft({ mode: 'edit', movement, values: { date: movement.date, type: movement.type, amount: movement.amount, description: movement.description || '' } }) }} aria-label="Bearbeiten" title="Bearbeiten"><EditIcon size={15} /></button><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--delete" type="button" disabled={Boolean(draft) || saving} onClick={() => remove(movement)} aria-label="Löschen" title="Löschen"><TrashIcon size={15} /></button></td>}</>}</tr>
      })}
      {canEdit && draft?.mode === 'new' && <tr className="damage-financial-overview__row--editing"><MovementFields draft={draft.values} onChange={updateDraft} /><td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--save" type="button" disabled={saving} onClick={saveDraft} aria-label="Speichern" title="Speichern"><CheckIcon size={15} /></button><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--cancel" type="button" disabled={saving} onClick={() => setDraft(null)} aria-label="Abbrechen" title="Abbrechen"><CloseIcon size={15} /></button></td></tr>}
    </tbody></table></div>
  </section>
}
