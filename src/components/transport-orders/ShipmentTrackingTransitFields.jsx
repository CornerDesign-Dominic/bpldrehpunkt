import { timestampToDateTimeInput } from '../../lib/shipmentTrackingPresentation.js'

const durationOptions = [
  { value: '15', label: '15 Min. · Teilpause' },
  { value: '30', label: '30 Min. · Teilpause' },
  { value: '45', label: '45 Min. · Fahrpause' },
  { value: '540', label: '9 Std. · verkürzte Tagesruhe' },
  { value: '660', label: '11 Std. · Tagesruhe' },
]

export default function ShipmentTrackingTransitFields({ entries, onChange }) {
  function add(kind) {
    if (entries.length >= 20) return
    onChange([...entries, { id: crypto.randomUUID(), kind, at: timestampToDateTimeInput(new Date()), ...(kind === 'position' ? { location: '', kilometersToDestination: '' } : { durationChoice: '45', durationMinutes: '45' }) }])
  }
  function update(id, patch) { onChange(entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry)) }
  function remove(id) { onChange(entries.filter((entry) => entry.id !== id)) }

  return <div className="shipment-tracking-transit">
    <p>Standortmeldungen und Pausen werden einzeln im Verlauf gespeichert. Sie ändern keine ETA und lösen keine Automatik aus.</p>
    {entries.map((entry, index) => { const number = entries.slice(0, index + 1).filter((candidate) => candidate.kind === entry.kind).length; const label = entry.kind === 'position' ? 'Standortmeldung' : 'Pause'; return <div className="shipment-tracking-transit__entry" key={entry.id}>
      <div className="shipment-tracking-transit__entry-heading"><h3>{label} {number}</h3><button type="button" className="button button--secondary" onClick={() => remove(entry.id)} aria-label={`${label} ${number} entfernen`}>Entfernen</button></div>
      <div className="shipment-tracking-transit__fields">
        <label className="form-field"><span>{entry.kind === 'position' ? 'Zeitpunkt (Tag und Uhrzeit)' : 'Pausenbeginn (Tag und Uhrzeit)'}</span><input type="datetime-local" required value={entry.at} onChange={(event) => update(entry.id, { at: event.target.value })} /></label>
        {entry.kind === 'position' ? <>
          <label className="form-field"><span>Kilometer bis Entladestelle (Ziel)</span><input type="number" min="0" max="100000" step="0.1" inputMode="decimal" required value={entry.kilometersToDestination} onChange={(event) => update(entry.id, { kilometersToDestination: event.target.value })} /></label>
          <label className="form-field shipment-tracking-transit__location"><span>Ort / Streckenpunkt (optional)</span><input maxLength="160" placeholder="z. B. bei Hannover auf der A2" value={entry.location} onChange={(event) => update(entry.id, { location: event.target.value })} /></label>
        </> : <>
          <label className="form-field"><span>Dauer auswählen</span><select value={entry.durationChoice} onChange={(event) => update(entry.id, { durationChoice: event.target.value, durationMinutes: event.target.value === 'custom' ? '' : event.target.value })}>{durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}<option value="custom">Individuell</option></select></label>
          {entry.durationChoice === 'custom' && <label className="form-field"><span>Individuelle Dauer in Minuten</span><input type="number" min="1" max="10080" step="1" inputMode="numeric" required value={entry.durationMinutes} onChange={(event) => update(entry.id, { durationMinutes: event.target.value })} /></label>}
        </>}
      </div>
    </div> })}
    <div className="shipment-tracking-transit__add"><button className="button button--secondary" type="button" disabled={entries.length >= 20} onClick={() => add('position')}>+ Standortmeldung</button><button className="button button--secondary" type="button" disabled={entries.length >= 20} onClick={() => add('pause')}>+ Pause</button></div>
  </div>
}
