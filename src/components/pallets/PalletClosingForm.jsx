import { PALLET_CLOSING_TYPES } from '../../constants/pallets.js'
import { formatPalletNumber } from './palletFormatters.js'

export default function PalletClosingForm({ accountBalance, closingForm, formError, isSubmitting, newClosingBalance, onCancel, onChange, onSubmit }) {
  const formatAmount = (value) => `${formatPalletNumber(value)} Paletten`
  const hasDirection = Boolean(closingForm.direction)

  return <form className="pallet-entry-form pallet-closing-form" onSubmit={onSubmit}>
    <div className="pallet-entry-form__header"><h3>Abschluss hinzufügen</h3></div>
    <div className="pallet-closing-reference-grid">
      <label className="form-field"><span>Datum</span><input type="date" value={closingForm.date} onChange={(event) => onChange('date', event.target.value)} /></label>
      <label className="form-field"><span>Art des Abschlusses</span><select value={closingForm.type} onChange={(event) => onChange('type', event.target.value)}>{PALLET_CLOSING_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      <label className="form-field"><span>Referenz</span><input value={closingForm.reference} onChange={(event) => onChange('reference', event.target.value)} /></label>
    </div>
    <section className="pallet-closing-adjustment"><div className="pallet-closing-change"><h4>Saldoänderung</h4><div className="pallet-closing-change__controls"><div className="pallet-closing-direction"><button className={closingForm.direction === 'add' ? 'is-active' : ''} type="button" onClick={() => onChange('direction', 'add')} aria-pressed={closingForm.direction === 'add'}>+ Hinzufügen</button><button className={closingForm.direction === 'subtract' ? 'is-active' : ''} type="button" onClick={() => onChange('direction', 'subtract')} aria-pressed={closingForm.direction === 'subtract'}>− Abziehen</button></div><div className="pallet-closing-quantity-row"><label className="form-field pallet-closing-quantity"><span>Anzahl</span><input autoFocus inputMode="numeric" min="0" step="1" type="number" value={closingForm.quantity} onChange={(event) => onChange('quantity', event.target.value)} /></label><span className="pallet-closing-unit">Paletten</span></div></div></div><div className="pallet-closing-balances"><div className="pallet-closing-value"><span>Aktueller Saldo</span><strong>{formatAmount(accountBalance)}</strong></div><div className="pallet-closing-value"><span>Neuer Saldo</span><strong>{formatAmount(newClosingBalance)}</strong></div></div><div className="pallet-closing-note"><h4>Bemerkung</h4><label className="form-field"><span className="sr-only">Bemerkung</span><input value={closingForm.note} onChange={(event) => onChange('note', event.target.value)} /></label></div></section>
    {formError && <p className="field-error">{formError}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" onClick={onCancel}>Verwerfen</button><button className="button" type="submit" disabled={isSubmitting || !hasDirection}>{isSubmitting ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </form>
}
