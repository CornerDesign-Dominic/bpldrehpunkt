import { useState } from 'react'
import { LEGAL_DISPUTE_FINANCIAL_DIRECTIONS, LEGAL_DISPUTE_PAYMENT_RECIPIENTS, createEmptyLegalDisputeFinancialEntry } from '../../lib/legalDisputes.js'
import { CheckIcon, CloseIcon, EditIcon, TrashIcon } from '../icons.jsx'

function formatCurrency(value) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0)) }
function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }
function labelFor(options, value) { return options.find((option) => option.value === value)?.label || '—' }
function valueClass(value) { return value > 0 ? 'damage-financial-overview__amount--positive' : value < 0 ? 'damage-financial-overview__amount--negative' : 'damage-financial-overview__amount--neutral' }

function EntryFields({ draft, onChange }) {
  return <>
    <td><input aria-label="Zahlungsdatum" type="date" value={draft.date} onChange={(event) => onChange('date', event.target.value)} /></td>
    <td><select aria-label="Bewegung" value={draft.direction} onChange={(event) => onChange('direction', event.target.value)}>{LEGAL_DISPUTE_FINANCIAL_DIRECTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td>
    <td><select aria-label="Von oder an" value={draft.payeeType} onChange={(event) => onChange('payeeType', event.target.value)}><option value="">Auswahl</option>{LEGAL_DISPUTE_PAYMENT_RECIPIENTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td>
    <td><input aria-label="Nettobetrag" type="number" min="0" step="0.01" inputMode="decimal" value={draft.netAmount} onChange={(event) => onChange('netAmount', event.target.value)} /></td>
    <td><input aria-label="Umsatzsteuer" type="number" min="0" step="0.01" inputMode="decimal" value={draft.vatAmount} onChange={(event) => onChange('vatAmount', event.target.value)} /></td>
    <td className="legal-dispute-financial-overview__gross">{formatCurrency(Number(draft.netAmount || 0) + Number(draft.vatAmount || 0))}</td>
  </>
}

export default function LegalDisputeFinancialOverview({ canEdit, entries, legalDispute, loading, onDeleteEntry, onEditDispute, onSaveEntry }) {
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const received = entries.filter((entry) => entry.direction === 'received').reduce((total, entry) => total + Number(entry.netAmount || 0) + Number(entry.vatAmount || 0), 0)
  const paid = entries.filter((entry) => entry.direction === 'paid').reduce((total, entry) => total + Number(entry.netAmount || 0) + Number(entry.vatAmount || 0), 0)
  const currentBalance = received - paid
  const columns = canEdit ? 7 : 6

  function startNew() { setError(''); setDraft({ mode: 'new', values: createEmptyLegalDisputeFinancialEntry() }) }
  function startEdit(entry) { setError(''); setDraft({ mode: 'edit', entry, values: { date: entry.date, direction: entry.direction, payeeType: entry.payeeType || '', netAmount: entry.netAmount, vatAmount: entry.vatAmount } }) }
  function updateDraft(field, value) { setDraft((current) => ({ ...current, values: { ...current.values, [field]: value } })); setError('') }

  async function saveDraft() {
    if (!draft) return
    setSaving(true); setError('')
    try { await onSaveEntry(draft.mode === 'edit' ? draft.entry : null, draft.values); setDraft(null) } catch (saveError) { setError(saveError.message || 'Die Zahlungsposition konnte nicht gespeichert werden.') } finally { setSaving(false) }
  }

  async function deleteEntry(entry) {
    setSaving(true); setError('')
    try { await onDeleteEntry(entry) } catch (deleteError) { setError(deleteError.message || 'Die Zahlungsposition konnte nicht gelöscht werden.') } finally { setSaving(false) }
  }

  return <section className="todo-detail-content damage-financial-overview legal-dispute-financial-overview" aria-labelledby="legal-dispute-financial-overview-title">
    <div className="todo-detail-section-heading"><h3 id="legal-dispute-financial-overview-title">Finanzieller Überblick</h3>{canEdit && <div className="legal-dispute-financial-overview__actions"><button className="button button--secondary damage-financial-overview__add" type="button" disabled={Boolean(draft) || saving} onClick={onEditDispute}>Streitbetrag bearbeiten</button></div>}</div>
    <div className="legal-dispute-financial-overview__claim"><span>Streitbetrag · SOLL</span><strong>{legalDispute.amountInDispute === null || legalDispute.amountInDispute === undefined ? '—' : formatCurrency(legalDispute.amountInDispute)}</strong></div>
    {canEdit && <div className="legal-dispute-financial-overview__payment-action"><button className="button damage-financial-overview__add" type="button" disabled={Boolean(draft) || saving} onClick={startNew}>Zahlung hinzufügen</button></div>}
    {error && <p className="form-error">{error}</p>}
    <div className="todos-table-frame damage-financial-overview__table-frame"><table className="data-table todos-table damage-financial-overview__table legal-dispute-financial-overview__table"><thead><tr><th>Datum</th><th>Bewegung</th><th>Von / an</th><th>Netto</th><th>USt.</th><th>Brutto</th>{canEdit && <th className="damage-financial-overview__actions"><span className="sr-only">Aktionen</span></th>}</tr></thead><tbody>
      {loading ? <tr><td className="table-state" colSpan={columns}>Zahlungspositionen werden geladen …</td></tr> : !entries.length && draft?.mode !== 'new' ? <tr><td className="table-state legal-dispute-financial-overview__empty-state" colSpan={columns}>Noch keine Ist-Zahlungen hinterlegt.</td></tr> : entries.map((entry) => {
        const editing = draft?.mode === 'edit' && draft.entry.id === entry.id
        const grossAmount = Number(entry.netAmount || 0) + Number(entry.vatAmount || 0)
        const directionLabel = labelFor(LEGAL_DISPUTE_FINANCIAL_DIRECTIONS, entry.direction)
        const counterpartyLabel = labelFor(LEGAL_DISPUTE_PAYMENT_RECIPIENTS, entry.payeeType)
        return <tr className={editing ? 'damage-financial-overview__row--editing' : ''} key={entry.id}>{editing ? <><EntryFields draft={draft.values} onChange={updateDraft} /><td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--save" type="button" disabled={saving} onClick={saveDraft} aria-label="Speichern" title="Speichern"><CheckIcon size={15} /></button><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--cancel" type="button" disabled={saving} onClick={() => setDraft(null)} aria-label="Abbrechen" title="Abbrechen"><CloseIcon size={15} /></button></td></> : <><td>{formatDate(entry.date)}</td><td><span className={`legal-dispute-financial-overview__direction legal-dispute-financial-overview__direction--${entry.direction}`}>{directionLabel}</span></td><td>{counterpartyLabel}</td><td>{formatCurrency(entry.netAmount)}</td><td>{formatCurrency(entry.vatAmount)}</td><td className={entry.direction === 'received' ? 'damage-financial-overview__amount--positive' : 'damage-financial-overview__amount--negative'}>{formatCurrency(grossAmount)}</td>{canEdit && <td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action" type="button" disabled={Boolean(draft) || saving} onClick={() => startEdit(entry)} aria-label="Bearbeiten" title="Bearbeiten"><EditIcon size={15} /></button><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--delete" type="button" disabled={Boolean(draft) || saving} onClick={() => deleteEntry(entry)} aria-label="Löschen" title="Löschen"><TrashIcon size={15} /></button></td>}</>}</tr>
      })}
      {canEdit && draft?.mode === 'new' && <tr className="damage-financial-overview__row--editing"><EntryFields draft={draft.values} onChange={updateDraft} /><td className="damage-financial-overview__actions"><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--save" type="button" disabled={saving} onClick={saveDraft} aria-label="Speichern" title="Speichern"><CheckIcon size={15} /></button><button className="damage-financial-overview__icon-action damage-financial-overview__icon-action--cancel" type="button" disabled={saving} onClick={() => setDraft(null)} aria-label="Abbrechen" title="Abbrechen"><CloseIcon size={15} /></button></td></tr>}
    </tbody></table></div>
    <div className="damage-financial-overview__totals legal-dispute-financial-overview__totals"><div><span>IST erhalten</span><strong className="damage-financial-overview__amount--positive">{formatCurrency(received)}</strong></div><div><span>IST bezahlt</span><strong className="damage-financial-overview__amount--negative">{formatCurrency(paid)}</strong></div><div><span>Aktueller IST-Stand</span><strong className={valueClass(currentBalance)}>{formatCurrency(currentBalance)}</strong></div></div>
  </section>
}
