import { useState } from 'react'
import { createEmptyVehicle, getVehicleStatusLabel, VEHICLE_STATUSES, VEHICLE_TYPES, vehicleToForm } from '../../lib/dispatchCockpit.js'

export default function FleetVehicleManager({ vehicles, partners, onClose, onCreate, onUpdate }) {
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(createEmptyVehicle)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  function startEdit(vehicle) { setEditing(vehicle); setForm(vehicleToForm(vehicle)); setError('') }
  function cancelEdit() { setEditing(null); setForm(createEmptyVehicle()); setError('') }

  async function submit(event) {
    event.preventDefault()
    if (!form.licensePlate.trim()) { setError('Bitte ein Kennzeichen erfassen.'); return }
    setSubmitting(true); setError('')
    try {
      if (editing) await onUpdate(editing.id, form)
      else await onCreate(form)
      cancelEdit()
    } catch {
      setError('Das Fahrzeug konnte nicht gespeichert werden.')
    } finally { setSubmitting(false) }
  }

  return <section className="fleet-manager">
    <div className="fleet-manager__heading"><div><h2>Fahrzeugverwaltung</h2><p>Fahrzeuge können bearbeitet oder inaktiv gesetzt werden. Es gibt keine Löschfunktion.</p></div><button className="text-button" type="button" onClick={onClose}>Schließen</button></div>
    <div className="table-frame fleet-manager__table"><table><thead><tr><th>Kennzeichen</th><th>Fahrzeugtyp</th><th>Eigentümer</th><th>Status</th><th>Aktion</th></tr></thead><tbody>{vehicles.length ? vehicles.map((vehicle) => <tr key={vehicle.id}><td><strong>{vehicle.licensePlate}</strong></td><td>{vehicle.vehicleType}</td><td>{partners.find((partner) => partner.id === vehicle.ownerPartnerId)?.companyName || '—'}</td><td><span className={`status-badge status-badge--${vehicle.status}`}>{getVehicleStatusLabel(vehicle.status)}</span></td><td className="fleet-manager__actions"><button type="button" onClick={() => startEdit(vehicle)}>Bearbeiten</button>{vehicle.status !== 'inactive' && <button type="button" onClick={() => onUpdate(vehicle.id, { ...vehicleToForm(vehicle), status: 'inactive' })}>Inaktiv setzen</button>}</td></tr>) : <tr><td colSpan="5" className="table-state">Noch keine Fahrzeuge angelegt.</td></tr>}</tbody></table></div>
    <form className="vehicle-form" onSubmit={submit} noValidate>
      <div className="vehicle-form__heading"><h3>{editing ? 'Fahrzeug bearbeiten' : 'Fahrzeug anlegen'}</h3>{editing && <button className="text-button" type="button" onClick={cancelEdit}>Abbrechen</button>}</div>
      <div className="vehicle-form__grid">
        <label className="form-field"><span>Kennzeichen *</span><input value={form.licensePlate} onChange={(event) => update('licensePlate', event.target.value)} /></label>
        <label className="form-field"><span>Fahrzeugtyp</span><select value={form.vehicleType} onChange={(event) => update('vehicleType', event.target.value)}>{VEHICLE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label className="form-field"><span>Eigentümer</span><select value={form.ownerPartnerId} onChange={(event) => update('ownerPartnerId', event.target.value)}><option value="">Kein Geschäftspartner</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></label>
        <label className="form-field"><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}>{VEHICLE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        <label className="form-field vehicle-form__note"><span>Notiz</span><input value={form.note} onChange={(event) => update('note', event.target.value)} /></label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : editing ? 'Fahrzeug speichern' : 'Fahrzeug anlegen'}</button></div>
    </form>
  </section>
}
