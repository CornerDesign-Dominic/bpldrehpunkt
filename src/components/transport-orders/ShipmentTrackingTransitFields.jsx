import { timestampToDateTimeInput } from '../../lib/shipmentTrackingPresentation.js'

const durationOptions = [
  { value: '15', label: '15 Min. · Teilpause' },
  { value: '30', label: '30 Min. · Teilpause' },
  { value: '45', label: '45 Min. · Fahrpause' },
  { value: '540', label: '9 Std. · verkürzte Tagesruhe' },
  { value: '660', label: '11 Std. · Tagesruhe' },
]

function TransitEntryFields({ entry, number, onUpdate, onRemove, original }) {
  const label = entry.kind === 'position' ? 'Standortmeldung' : 'Pause'
  const aiField = (field) => entry.source === 'ai_mail' && entry[field] === original?.[field]
  const aiProps = (field) => ({ className: aiField(field) ? 'shipment-tracking-editor__input--ai' : undefined, title: aiField(field) ? 'Von KI aus einer Status-Mail übernommen' : undefined })
  return <div className="shipment-tracking-transit__entry">
    <div className="shipment-tracking-transit__entry-heading"><h3>{label} {number}</h3>{onRemove && <button type="button" className="button button--secondary" onClick={onRemove} aria-label={`${label} ${number} entfernen`}>Entfernen</button>}</div>
    <div className="shipment-tracking-transit__fields">
      <label className="form-field"><span>{entry.kind === 'position' ? 'Zeitpunkt (Tag und Uhrzeit)' : 'Pausenbeginn (Tag und Uhrzeit)'}</span><input type="datetime-local" required value={entry.at} onChange={(event) => onUpdate({ at: event.target.value })} {...aiProps('at')} /></label>
      {entry.kind === 'position' ? <>
        <label className="form-field"><span>Kilometer bis Entladestelle (Ziel)</span><input type="number" min="0" max="100000" step="0.1" inputMode="decimal" required value={entry.kilometersToDestination} onChange={(event) => onUpdate({ kilometersToDestination: event.target.value })} {...aiProps('kilometersToDestination')} /></label>
        <label className="form-field shipment-tracking-transit__location"><span>Ort / Streckenpunkt (optional)</span><input maxLength="160" placeholder="z. B. bei Hannover auf der A2" value={entry.location} onChange={(event) => onUpdate({ location: event.target.value })} {...aiProps('location')} /></label>
      </> : <>
        <label className="form-field"><span>Dauer auswählen</span><select value={entry.durationChoice} onChange={(event) => onUpdate({ durationChoice: event.target.value, durationMinutes: event.target.value === 'custom' ? '' : event.target.value })} {...aiProps('durationMinutes')}>{durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}<option value="custom">Individuell</option></select></label>
        {entry.durationChoice === 'custom' && <label className="form-field"><span>Individuelle Dauer in Minuten</span><input type="number" min="1" max="10080" step="1" inputMode="numeric" required value={entry.durationMinutes} onChange={(event) => onUpdate({ durationMinutes: event.target.value })} {...aiProps('durationMinutes')} /></label>}
      </>}
    </div>
  </div>
}

export default function ShipmentTrackingTransitFields({ entries, onChange, existingEntries = [], initialExisting = [], onExistingChange }) {
  function add(kind) {
    if (entries.length >= 20) return
    onChange([...entries, { id: crypto.randomUUID(), kind, at: timestampToDateTimeInput(new Date()), ...(kind === 'position' ? { location: '', kilometersToDestination: '' } : { durationChoice: '45', durationMinutes: '45' }) }])
  }
  function update(id, patch) { onChange(entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry)) }
  function remove(id) { onChange(entries.filter((entry) => entry.id !== id)) }
  function updateExisting(id, patch) { onExistingChange(existingEntries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry)) }

  return <div className="shipment-tracking-transit">
    <p>Standortmeldungen und Pausen werden einzeln im Verlauf gespeichert. Sie ändern keine ETA und lösen keine Automatik aus.</p>
    {existingEntries.length > 0 && <div className="shipment-tracking-transit__existing"><h3>Vorhandene Meldungen</h3>{existingEntries.map((entry, index) => <TransitEntryFields key={entry.id} entry={entry} original={initialExisting[index]} number={index + 1} onUpdate={(patch) => updateExisting(entry.id, patch)} />)}</div>}
    {entries.map((entry, index) => <TransitEntryFields key={entry.id} entry={entry} number={index + 1} onUpdate={(patch) => update(entry.id, patch)} onRemove={() => remove(entry.id)} />)}
    <div className="shipment-tracking-transit__add"><button className="button button--secondary" type="button" disabled={entries.length >= 20} onClick={() => add('position')}>+ Standortmeldung</button><button className="button button--secondary" type="button" disabled={entries.length >= 20} onClick={() => add('pause')}>+ Pause</button></div>
  </div>
}
