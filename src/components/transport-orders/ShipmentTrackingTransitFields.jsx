import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
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
  const aiField = (field) => entry.source === 'ai_mail' && entry[field] !== '' && entry[field] !== null && entry[field] === original?.[field]
  const aiProps = (field) => ({ className: aiField(field) ? 'shipment-tracking-editor__input--ai' : undefined, title: aiField(field) ? 'Von KI aus einer Status-Mail übernommen' : undefined })
  return <div className="shipment-tracking-transit__entry">
    <div className="shipment-tracking-transit__entry-heading"><h3><StaticText source={label} /> {number}</h3>{onRemove && <button type="button" className="button button--secondary" onClick={onRemove} aria-label={`${label} ${number} entfernen`}><StaticText source="Entfernen" /></button>}</div>
    <div className="shipment-tracking-transit__fields">
      <label className="form-field"><span><StaticText source={entry.kind === 'position' ? 'Zeitpunkt (Tag und Uhrzeit)' : 'Pausenbeginn (Tag und Uhrzeit)'} /></span><input type="datetime-local" required value={entry.at} onChange={(event) => onUpdate({ at: event.target.value })} {...aiProps('at')} /></label>
      {entry.kind === 'position' ? <>
        <label className="form-field"><span><StaticText source="Kilometer bis Entladestelle (Ziel)" /></span><input type="number" min="0" max="100000" step="0.1" inputMode="decimal" required value={entry.kilometersToDestination} onChange={(event) => onUpdate({ kilometersToDestination: event.target.value })} {...aiProps('kilometersToDestination')} /></label>
        <label className="form-field shipment-tracking-transit__location"><span><StaticText source="Ort / Streckenpunkt (optional)" /></span><TranslatedProps sources={{ placeholder: 'z. B. bei Hannover auf der A2' }}><input maxLength="160" placeholder="z. B. bei Hannover auf der A2" value={entry.location} onChange={(event) => onUpdate({ location: event.target.value })} {...aiProps('location')} /></TranslatedProps></label>
      </> : <>
        <label className="form-field"><span><StaticText source="Dauer auswählen" /></span><select value={entry.durationChoice} onChange={(event) => onUpdate({ durationChoice: event.target.value, durationMinutes: event.target.value === 'custom' ? '' : event.target.value })} {...aiProps('durationMinutes')}>{durationOptions.map((option) => <option key={option.value} value={option.value}><StaticText source={option.label} /></option>)}<option value="custom"><StaticText source="Individuell" /></option></select></label>
        {entry.durationChoice === 'custom' && <label className="form-field"><span><StaticText source="Individuelle Dauer in Minuten" /></span><input type="number" min="1" max="10080" step="1" inputMode="numeric" required value={entry.durationMinutes} onChange={(event) => onUpdate({ durationMinutes: event.target.value })} {...aiProps('durationMinutes')} /></label>}
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
  function removeExisting(id) { onExistingChange(existingEntries.filter((entry) => entry.id !== id)) }

  return <div className="shipment-tracking-transit">
    {existingEntries.map((entry, index) => <TransitEntryFields key={entry.id} entry={entry} original={initialExisting.find((initial) => initial.id === entry.id)} number={index + 1} onUpdate={(patch) => updateExisting(entry.id, patch)} onRemove={() => removeExisting(entry.id)} />)}
    {entries.map((entry, index) => <TransitEntryFields key={entry.id} entry={entry} number={index + 1} onUpdate={(patch) => update(entry.id, patch)} onRemove={() => remove(entry.id)} />)}
    <div className="shipment-tracking-transit__add"><button className="button button--secondary" type="button" disabled={entries.length >= 20} onClick={() => add('position')}>+ <StaticText source="Standortmeldung" /></button><button className="button button--secondary" type="button" disabled={entries.length >= 20} onClick={() => add('pause')}>+ <StaticText source="Pause" /></button></div>
  </div>
}
