import { PALLET_CLOSING_TYPES } from '../../constants/pallets.js'
import { formatPalletNumber } from './palletFormatters.js'

export default function PalletClosingForm({ accountBalance, closingForm, formError, isSubmitting, newClosingBalance, onCancel, onChange, onSubmit }) {
  return <form className="pallet-entry-form" onSubmit={onSubmit}>
    <div className="pallet-entry-form__header"><h3>Abschluss hinzufügen</h3><button className="button button--secondary" type="button" onClick={onCancel}>Abbrechen</button></div>
    <div className="pallet-entry-form__grid pallet-closing-form__grid">
      <label className="form-field"><span>Datum</span><input type="date" value={closingForm.date} onChange={(event) => onChange('date', event.target.value)} /></label>
      <label className="form-field"><span>Aktueller Saldo vor Abschluss</span><output className="derived-value">{formatPalletNumber(accountBalance, true)}</output></label>
      <label className="form-field"><span>Abschlussbetrag / Saldoänderung</span><input autoFocus inputMode="decimal" type="number" step="0.01" value={closingForm.adjustment} onChange={(event) => onChange('adjustment', event.target.value)} /></label>
      <label className="form-field"><span>Neuer Saldo</span><output className="derived-value">{formatPalletNumber(newClosingBalance, true)}</output></label>
      <label className="form-field"><span>Grund / Art des Abschlusses</span><select value={closingForm.type} onChange={(event) => onChange('type', event.target.value)}>{PALLET_CLOSING_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      <label className="form-field"><span>Referenz</span><input value={closingForm.reference} onChange={(event) => onChange('reference', event.target.value)} /></label>
      <label className="form-field pallet-entry-form__wide"><span>Bemerkung</span><input value={closingForm.note} onChange={(event) => onChange('note', event.target.value)} /></label>
    </div>
    {formError && <p className="field-error">{formError}</p>}
    <div className="form-actions"><button className="button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Wird gespeichert …' : 'Abschluss speichern'}</button></div>
  </form>
}
