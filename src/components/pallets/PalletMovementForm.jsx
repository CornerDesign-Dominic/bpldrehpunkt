import { formatPalletNumber } from './palletFormatters.js'

export default function PalletMovementForm({ carriers, customers, editingMovement, formError, isSubmitting, movementCalculation, movementForm, onCancel, onChange, onStationChange, onSubmit, selectedCarrier, selectedCustomer }) {
  return <form className="pallet-entry-form pallet-movement-form" onSubmit={onSubmit}>
    <div className="pallet-entry-form__header"><h3>{editingMovement ? 'Palettenbewegung bearbeiten' : 'Bewegung hinzufügen'}</h3></div>
    <div className="pallet-movement-reference-grid">
      <label className="form-field"><span>Tournummer / unsere Nummer</span><input value={movementForm.tourNumber} onChange={(event) => onChange('tourNumber', event.target.value)} /></label>
      <label className="form-field"><span>Datum</span><input type="date" value={movementForm.date} onChange={(event) => onChange('date', event.target.value)} /></label>
      <label className="form-field"><span>Palettenschein-Nr.</span><input value={movementForm.palletReceiptNumber} onChange={(event) => onChange('palletReceiptNumber', event.target.value)} /></label>
    </div>
    <section className="pallet-movement-partner-grid">
      <label className="form-field pallet-movement-partner"><span>Kunde</span><select value={movementForm.customerId} onChange={(event) => onChange('customerId', event.target.value)}><option value="">Kunde auswählen</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.companyName} · Debitor {item.debtorNumber}</option>)}</select></label>
      <label className="form-field pallet-movement-partner"><span>Unternehmer</span><select value={movementForm.carrierId} onChange={(event) => onChange('carrierId', event.target.value)}><option value="">Unternehmer auswählen</option>{carriers.map((item) => <option key={item.id} value={item.id}>{item.companyName} · Kreditor {item.creditorNumber}</option>)}</select></label>
    </section>
    <section className="pallet-movement-matrix">
      <div className="pallet-movement-matrix__grid">
        <span></span><span>Erhalten</span><span>Abgegeben</span>
        <strong>Ladestelle</strong><label><span className="sr-only">Ladestelle erhalten</span><input aria-label="Ladestelle erhalten" inputMode="numeric" min="0" step="1" type="number" value={movementForm.loadingPoint.received} onChange={(event) => onStationChange('loadingPoint', 'received', event.target.value)} /></label><label><span className="sr-only">Ladestelle abgegeben</span><input aria-label="Ladestelle abgegeben" inputMode="numeric" min="0" step="1" type="number" value={movementForm.loadingPoint.delivered} onChange={(event) => onStationChange('loadingPoint', 'delivered', event.target.value)} /></label>
        <strong>Entladestelle</strong><label><span className="sr-only">Entladestelle erhalten</span><input aria-label="Entladestelle erhalten" inputMode="numeric" min="0" step="1" type="number" value={movementForm.unloadingPoint.received} onChange={(event) => onStationChange('unloadingPoint', 'received', event.target.value)} /></label><label><span className="sr-only">Entladestelle abgegeben</span><input aria-label="Entladestelle abgegeben" inputMode="numeric" min="0" step="1" type="number" value={movementForm.unloadingPoint.delivered} onChange={(event) => onStationChange('unloadingPoint', 'delivered', event.target.value)} /></label>
      </div>
    </section>
    <section className="pallet-movement-result">
      <h4>Ergebnis der Buchung</h4>
      <div>{selectedCarrier && <article><span>Unternehmer</span><strong>{selectedCarrier.companyName}</strong><output>{formatPalletNumber(movementCalculation.carrierBalance, true)} Paletten</output></article>}{selectedCustomer && <article><span>Kunde</span><strong>{selectedCustomer.companyName}</strong><output>{formatPalletNumber(movementCalculation.customerBalance, true)} Paletten</output></article>}</div>
    </section>
    <label className="form-field pallet-movement-note"><span>Bemerkung</span><input value={movementForm.note} onChange={(event) => onChange('note', event.target.value)} /></label>
    {formError && <p className="field-error">{formError}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" onClick={onCancel}>Verwerfen</button><button className="button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </form>
}
