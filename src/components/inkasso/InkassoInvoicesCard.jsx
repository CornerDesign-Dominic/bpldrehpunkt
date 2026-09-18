import { useEffect, useState } from 'react'
import { EditIcon } from '../icons.jsx'

function formatCurrency(value) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0) }

function InvoiceModal({ canEdit, invoice, mode, onClose, onSave }) {
  const [editing, setEditing] = useState(mode === 'new')
  const [values, setValues] = useState(() => ({ invoiceNumber: invoice?.invoiceNumber || '', netAmount: invoice?.netAmount ?? '', vatAmount: invoice?.vatAmount ?? '' }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { function closeOnEscape(event) { if (event.key === 'Escape' && !saving) onClose() } window.addEventListener('keydown', closeOnEscape); return () => window.removeEventListener('keydown', closeOnEscape) }, [onClose, saving])
  const update = (field, value) => { setValues((current) => ({ ...current, [field]: value })); setError('') }
  async function submit(event) { event.preventDefault(); setSaving(true); setError(''); try { await onSave(mode === 'new' ? null : invoice, values); onClose() } catch (saveError) { setError(saveError.message || 'Die Rechnung konnte nicht gespeichert werden.') } finally { setSaving(false) } }
  const title = mode === 'new' ? 'Rechnung hinzufügen' : editing ? 'Rechnung bearbeiten' : 'Rechnungsdetails'

  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}><section className="todo-quick-edit-modal damage-deadline-modal" role="dialog" aria-modal="true" aria-labelledby="inkasso-invoice-modal-title"><form className="todo-quick-editor" onSubmit={submit} noValidate>
    <div className="todo-quick-editor__heading damage-deadline-modal__heading"><h2 id="inkasso-invoice-modal-title">{title}</h2>{canEdit && mode !== 'new' && !editing && <button className="todo-detail-section-edit" type="button" onClick={() => { setValues({ invoiceNumber: invoice.invoiceNumber, netAmount: invoice.netAmount, vatAmount: invoice.vatAmount }); setEditing(true) }} title="Rechnung bearbeiten" aria-label="Rechnung bearbeiten"><EditIcon size={14} /></button>}</div>
    {editing ? <div className="todo-quick-editor__grid damage-deadline-modal__fields"><label className="form-field"><span>Rechnungsnummer *</span><input autoFocus value={values.invoiceNumber} maxLength="240" required onChange={(event) => update('invoiceNumber', event.target.value)} /></label><label className="form-field"><span>Nettobetrag *</span><input type="number" min="0" step="0.01" inputMode="decimal" value={values.netAmount} required onChange={(event) => update('netAmount', event.target.value)} /></label><label className="form-field"><span>USt.-Betrag *</span><input type="number" min="0" step="0.01" inputMode="decimal" value={values.vatAmount} required onChange={(event) => update('vatAmount', event.target.value)} /></label></div> : <div className="damage-deadline-modal__details"><section><h3>Rechnungsdaten</h3><dl><div><dt>Rechnungsnummer</dt><dd>{invoice.invoiceNumber}</dd></div><div><dt>Nettobetrag</dt><dd>{formatCurrency(invoice.netAmount)}</dd></div><div><dt>USt.-Betrag</dt><dd>{formatCurrency(invoice.vatAmount)}</dd></div><div><dt>Gesamtbetrag</dt><dd>{formatCurrency(invoice.grossAmount)}</dd></div><div><dt>Zahlungsstatus</dt><dd>{invoice.isPaid ? 'Bezahlt' : 'Offen'}</dd></div></dl></section></div>}
    {error && <p className="form-error">{error}</p>}<div className="form-actions">{editing ? <><button className="button button--secondary" type="button" disabled={saving} onClick={mode === 'new' ? onClose : () => setEditing(false)}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></> : <button className="button button--secondary" type="button" onClick={onClose}>Schließen</button>}</div>
  </form></section></div>
}

export default function InkassoInvoicesCard({ canEdit, invoices, inkassoCase, loading, onPaymentChange, onSave, savingInvoiceId }) {
  const [modal, setModal] = useState(null)
  const columns = 5
  const paidAmount = Number(inkassoCase.paidAmount || 0)
  const claimAmount = Number(inkassoCase.claimAmount || 0)

  return <section className="todo-detail-content damage-financial-overview inkasso-invoices-card" aria-labelledby="inkasso-invoices-title">
    {modal && <InvoiceModal canEdit={canEdit} invoice={modal.invoice} mode={modal.mode === 'new' ? 'new' : 'details'} onClose={() => setModal(null)} onSave={onSave} />}
    <div className="todo-detail-section-heading"><h3 id="inkasso-invoices-title">Rechnungen</h3><span>{invoices.length}</span>{canEdit && <button className="button damage-deadlines__add" type="button" onClick={() => setModal({ mode: 'new', invoice: null })}>Rechnung hinzufügen</button>}</div>
    <div className="inkasso-financial-overview__summary"><div><span>Offene Forderung</span><strong>{formatCurrency(claimAmount)}</strong></div><div><span>Bereits bezahlt</span><strong>{formatCurrency(paidAmount)}</strong></div></div>
    <div className="damage-cases-table-frame"><table className="data-table todos-table"><thead><tr><th>Rechnungsnummer</th><th>Netto</th><th>USt.</th><th>Gesamt</th><th>Bezahlt</th></tr></thead><tbody>
      {loading ? <tr><td className="table-state" colSpan={columns}>Rechnungen werden geladen …</td></tr> : !invoices.length ? <tr><td className="table-state" colSpan={columns}>Keine Rechnungen hinterlegt.</td></tr> : invoices.map((invoice) => <tr key={invoice.id} className="damage-deadlines__row" tabIndex="0" role="button" onClick={() => setModal({ mode: 'details', invoice })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setModal({ mode: 'details', invoice }) } }} aria-label={`Rechnung ${invoice.invoiceNumber} öffnen`}><td className="todos-table__title">{invoice.invoiceNumber}</td><td>{formatCurrency(invoice.netAmount)}</td><td>{formatCurrency(invoice.vatAmount)}</td><td>{formatCurrency(invoice.grossAmount)}</td><td><label className="damage-filter-toggle" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><input type="checkbox" checked={invoice.isPaid === true} disabled={!canEdit || Boolean(savingInvoiceId)} onChange={(event) => onPaymentChange(invoice, event.target.checked)} />Bezahlt</label></td></tr>)}
    </tbody></table></div>
  </section>
}
