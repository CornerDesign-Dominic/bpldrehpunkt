import { PALLET_CASE_STATUSES } from '../../lib/palletCases.js'

export default function PalletCaseForm({ initialValues, submitting = false, onCancel, onSubmit }) {
  const values = { title: '', description: '', status: 'open', ...initialValues }
  return <form className="pallet-case-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ title: event.currentTarget.title.value, description: event.currentTarget.description.value, status: event.currentTarget.status.value }) }}>
    <div className="pallet-entry-form__header"><h2>{initialValues?.caseNumber ? 'Palettenfall bearbeiten' : 'Palettenfall anlegen'}</h2></div>
    <label className="form-field"><span>Kurzbezeichnung</span><input name="title" defaultValue={values.title} required autoFocus disabled={submitting} /></label>
    <label className="form-field"><span>Status</span><select name="status" defaultValue={values.status} disabled={submitting}>{PALLET_CASE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <label className="form-field pallet-case-form__description"><span>Beschreibung</span><textarea name="description" defaultValue={values.description} rows="6" disabled={submitting} /></label>
    <div className="form-actions"><button className="button button--secondary" type="button" onClick={onCancel} disabled={submitting}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </form>
}
