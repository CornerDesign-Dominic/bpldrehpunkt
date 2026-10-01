import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { getHolidayStateNames } from '../../lib/holidayCalendar.js'

const holidayDateFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })

function scopeLabel(holiday) {
  return holiday.countries?.some((country) => country.stateCodes?.length) ? 'Regionaler Feiertag' : 'Bundesweiter Feiertag'
}

export default function HolidayDetailModal({ holiday, onClose }) {
  const countries = Array.isArray(holiday?.countries) ? holiday.countries : []
  return <div className="holiday-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="holiday-modal" role="dialog" aria-modal="true" aria-labelledby="holiday-modal-title"><div className="holiday-modal__heading"><div><h2 id="holiday-modal-title">{holiday.name}</h2><p>{holidayDateFormatter.format(new Date(`${holiday.date}T12:00:00`))}</p><small>{scopeLabel(holiday)} <StaticText source={"· Quelle:"} /> {holiday.sourceName || holiday.name}</small></div><TranslatedProps sources={{"aria-label":"Dialog schließen"}}><button type="button" className="holiday-modal__close" onClick={onClose} aria-label="Dialog schließen">×</button></TranslatedProps></div><div className="holiday-modal__content"><h3><StaticText source={"Gültig in"} /></h3><ul>{countries.map((country) => { const states = getHolidayStateNames(country.stateCodes || []); return <li key={country.countryCode}><strong>{country.name || country.countryCode}</strong>{states.length > 0 && <small>{<StaticText source={states.join(', ')} />}</small>}</li> })}</ul></div><div className="holiday-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}><StaticText source={"Schließen"} /></button></div></section></div>
}
