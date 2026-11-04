import { useRef } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'

const fields = [
  ['company', 'Firma / Name', 'Company / name'], ['street', 'Straße', 'Street'],
  ['postalCode', 'PLZ', 'Postal code'], ['city', 'Ort', 'City'], ['country', 'Land', 'Country'], ['date', 'Datum', 'Date'],
]
export default function LiabilityStopSelection({ order, selectedStops, onChange }) {
  const drafts = useRef(new Map())
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  function toggle(stop) {
    const ids = new Set(selectedStops.map(item => item.id))
    if (ids.has(stop.id)) { drafts.current.set(stop.id, selectedStops.find(item => item.id === stop.id)); ids.delete(stop.id) }
    else ids.add(stop.id)
    onChange(order.stops.filter(item => ids.has(item.id)).map(item => selectedStops.find(selected => selected.id === item.id) || drafts.current.get(item.id) || { ...item }))
  }
  function edit(id, field, value) {
    const next = selectedStops.map(stop => stop.id === id ? { ...stop, [field]: value } : stop)
    drafts.current.set(id, next.find(stop => stop.id === id))
    onChange(next)
  }
  return <section className="template-form-section" aria-labelledby="liability-stops-heading">
    <div className="template-section-heading"><div><h2 id="liability-stops-heading">{w('Betroffene Lade-/Entladestellen', 'Affected loading / unloading locations')}</h2><p>{w('Wähle die für dieses Schreiben betroffenen Stellen. Übernommene Angaben kannst du korrigieren.', 'Select the locations affected by this letter. You can correct the imported details.')}</p></div></div>
    {!order.stops.length && <p className="form-error">{w('Der Auftrag enthält keine Lade-/Entladestellen. Bitte die Angaben im Formular ergänzen.', 'The order contains no locations. Please enter the details in the form.')}</p>}
    <div className="liability-stops">
      {order.stops.map((stop, index) => {
        const selected = selectedStops.find(item => item.id === stop.id)
        return <section key={stop.id} className="template-address-section">
          <label className="liability-stop-option"><input type="checkbox" checked={Boolean(selected)} onChange={() => toggle(stop)} /><span><strong>{`${index + 1}. ${stop.type === 'loading' ? w('Ladestelle', 'Loading location') : w('Entladestelle', 'Unloading location')}`}</strong><small>{[stop.company, stop.originalText || [stop.street, stop.postalCode, stop.city, stop.country].filter(Boolean).join(', '), stop.date].filter(Boolean).join(' · ') || w('Adressdaten fehlen', 'Address details missing')}</small></span></label>
          {selected && <div className="template-address-section__grid">
            {(stop.originalText ? [['originalText', 'Anschrift / Originalangabe', 'Address / original text'], ['date', 'Datum', 'Date']] : fields).map(([field, de, en]) => <label className="form-field" key={field}><span>{w(de, en)}</span><input type={field === 'date' ? 'date' : 'text'} value={selected[field] || ''} onChange={event => edit(stop.id, field, event.target.value)} /></label>)}
          </div>}
        </section>
      })}
    </div>
    {order.stops.length > 0 && !selectedStops.length && <p role="status">{w('Bitte mindestens eine betroffene Stelle auswählen.', 'Please select at least one affected location.')}</p>}
  </section>
}
