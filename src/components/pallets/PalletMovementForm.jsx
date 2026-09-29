import { formatPalletNumber } from './palletFormatters.js'
import { PALLET_TYPES } from '../../constants/pallets.js'

export default function PalletMovementForm({ carriers, customers, editingMovement, formError, historicalCarrier, historicalCustomer, isSubmitting, movementCalculation, movementForm, onCancel, onChange, onDelete, onStationChange, onSubmit, selectedCarrier, selectedCustomer }) {
  return <form className="pallet-entry-form pallet-movement-form" onSubmit={onSubmit}>
    <div className="pallet-entry-form__header"><h3>{editingMovement ? 'Palettenbewegung bearbeiten' : 'Bewegung hinzufügen'}</h3></div>
    <div className="pallet-movement-reference-grid">
      <label className="form-field"><span>Tournummer / unsere Nummer</span><input value={movementForm.tourNumber} onChange={(event) => onChange('tourNumber', event.target.value)} /></label>
      <label className="form-field"><span>Datum</span><input type="date" value={movementForm.date} onChange={(event) => onChange('date', event.target.value)} /></label>
      <label className="form-field"><span>Palettenschein-Nr.</span><input value={movementForm.palletReceiptNumber} onChange={(event) => onChange('palletReceiptNumber', event.target.value)} /></label>
      <label className="form-field"><span>Palettenart</span><select value={movementForm.palletType} onChange={(event) => onChange('palletType', event.target.value)}>{PALLET_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
    </div>
    <section className="pallet-movement-partner-grid">
      <label className="form-field pallet-movement-partner"><span>Kunde</span><select value={movementForm.customerId} onChange={(event) => onChange('customerId', event.target.value)}><option value="">Kunde auswählen</option>{historicalCustomer && <option value={historicalCustomer.id}>{historicalCustomer.label}</option>}{customers.map((item) => <option key={item.id} value={item.id}>{item.companyName} · {item.debtorNumber ? `Debitor ${item.debtorNumber}` : 'ohne Debitorennummer'}</option>)}</select></label>
      <output className="pallet-movement-change"><span>Palettenveränderung</span><strong>{selectedCustomer ? `${formatPalletNumber(movementCalculation.customerBalance, true)} Paletten` : '0 Paletten'}</strong></output>
      <label className="form-field pallet-movement-partner"><span>Unternehmer</span><select value={movementForm.carrierId} onChange={(event) => onChange('carrierId', event.target.value)}><option value="">Unternehmer auswählen</option>{historicalCarrier && <option value={historicalCarrier.id}>{historicalCarrier.label}</option>}{carriers.map((item) => <option key={item.id} value={item.id}>{item.companyName} · {item.creditorNumber ? `Kreditor ${item.creditorNumber}` : 'ohne Kreditorennummer'}</option>)}</select></label>
      <output className="pallet-movement-change"><span>Palettenveränderung</span><strong>{selectedCarrier ? `${formatPalletNumber(movementCalculation.carrierBalance, true)} Paletten` : '0 Paletten'}</strong></output>
    </section>
    <section className="pallet-movement-matrix">
      <div className="pallet-movement-matrix__grid">
        <span></span><span>Erhalten</span><span>Abgegeben</span><span>Bemerkung</span>
        <strong>Ladestelle</strong><label><span className="sr-only">Ladestelle erhalten</span><input aria-label="Ladestelle erhalten" inputMode="numeric" min="0" step="1" type="number" value={movementForm.loadingPoint.received} onChange={(event) => onStationChange('loadingPoint', 'received', event.target.value)} /></label><label><span className="sr-only">Ladestelle abgegeben</span><input aria-label="Ladestelle abgegeben" inputMode="numeric" min="0" step="1" type="number" value={movementForm.loadingPoint.delivered} onChange={(event) => onStationChange('loadingPoint', 'delivered', event.target.value)} /></label><label><span className="sr-only">Bemerkung zur Ladestelle</span><input aria-label="Bemerkung zur Ladestelle" value={movementForm.loadingPoint.note} onChange={(event) => onStationChange('loadingPoint', 'note', event.target.value)} /></label>
        <strong>Entladestelle</strong><label><span className="sr-only">Entladestelle erhalten</span><input aria-label="Entladestelle erhalten" inputMode="numeric" min="0" step="1" type="number" value={movementForm.unloadingPoint.received} onChange={(event) => onStationChange('unloadingPoint', 'received', event.target.value)} /></label><label><span className="sr-only">Entladestelle abgegeben</span><input aria-label="Entladestelle abgegeben" inputMode="numeric" min="0" step="1" type="number" value={movementForm.unloadingPoint.delivered} onChange={(event) => onStationChange('unloadingPoint', 'delivered', event.target.value)} /></label><label><span className="sr-only">Bemerkung zur Entladestelle</span><input aria-label="Bemerkung zur Entladestelle" value={movementForm.unloadingPoint.note} onChange={(event) => onStationChange('unloadingPoint', 'note', event.target.value)} /></label>
      </div>
    </section>
    {formError && <p className="field-error">{formError}</p>}
    <div className="form-actions">{editingMovement && <button className="button button--danger form-actions__delete" type="button" onClick={onDelete} disabled={isSubmitting}>Löschen</button>}<button className="button button--secondary" type="button" onClick={onCancel} disabled={isSubmitting}>Verwerfen</button><button className="button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </form>
}
