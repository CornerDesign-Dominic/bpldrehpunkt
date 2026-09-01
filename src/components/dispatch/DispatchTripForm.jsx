import { useState } from 'react'
import { createEmptyTrip, isTripRangeValid, TRIP_STATUSES, tripToForm } from '../../lib/dispatchCockpit.js'

export default function DispatchTripForm({ trip, vehicles, partners, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => trip ? tripToForm(trip) : createEmptyTrip(vehicles[0]?.id))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }

  async function submit(event) {
    event.preventDefault()
    if (!isTripRangeValid(form)) {
      setError('Bitte Tour, Fahrzeug sowie einen gültigen Start- und Endzeitpunkt erfassen.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(form)
    } catch {
      setError('Die Tour konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  return <form className="dispatch-form" onSubmit={submit} noValidate>
    <div className="dispatch-form__heading"><h2>{trip ? 'Transport bearbeiten' : 'Transport anlegen'}</h2><button className="text-button" type="button" onClick={onCancel}>Abbrechen</button></div>
    <div className="dispatch-form__grid">
      <label className="form-field"><span>Tour-Nr. *</span><input value={form.tourNumber} onChange={(event) => update('tourNumber', event.target.value)} autoFocus /></label>
      <label className="form-field"><span>Fahrzeug *</span><select value={form.vehicleId} onChange={(event) => update('vehicleId', event.target.value)}><option value="">Fahrzeug wählen</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.licensePlate} · {vehicle.vehicleType}</option>)}</select></label>
      <label className="form-field"><span>Startdatum *</span><input type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} /></label>
      <label className="form-field"><span>Startzeit *</span><input type="time" value={form.startTime} onChange={(event) => update('startTime', event.target.value)} /></label>
      <label className="form-field"><span>Enddatum *</span><input type="date" value={form.endDate} onChange={(event) => update('endDate', event.target.value)} /></label>
      <label className="form-field"><span>Endzeit *</span><input type="time" value={form.endTime} onChange={(event) => update('endTime', event.target.value)} /></label>
      <label className="form-field"><span>Startort</span><input value={form.origin} onChange={(event) => update('origin', event.target.value)} /></label>
      <label className="form-field"><span>Zielort</span><input value={form.destination} onChange={(event) => update('destination', event.target.value)} /></label>
      <label className="form-field"><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}>{TRIP_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
      <label className="form-field"><span>Fahrer (optional)</span><input value={form.driverName} onChange={(event) => update('driverName', event.target.value)} /></label>
      <label className="form-field"><span>Geschäftspartner (optional)</span><select value={form.partnerId} onChange={(event) => update('partnerId', event.target.value)}><option value="">Kein Geschäftspartner</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></label>
      <label className="form-field dispatch-form__note"><span>Notiz</span><textarea rows="2" value={form.note} onChange={(event) => update('note', event.target.value)} /></label>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : 'Transport speichern'}</button></div>
  </form>
}
