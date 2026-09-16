import { useEffect, useMemo, useState } from 'react'
import HolidayMonthCalendar from '../components/holidays/HolidayMonthCalendar.jsx'
import { EUROPEAN_COUNTRIES, GERMAN_STATES, getHolidayStateNames, getVisibleHolidays, holidayYears } from '../lib/holidayCalendar.js'
import { listPublicHolidays } from '../lib/holidayData.js'
import { VACATION_MONTHS } from '../lib/vacationCalendar.js'
import '../styles/holidayCalendar.css'

function localTodayValue() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

const holidayDateFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })

function HolidayDetailModal({ holiday, onClose }) {
  return <div className="holiday-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="holiday-modal" role="dialog" aria-modal="true" aria-labelledby="holiday-modal-title"><div className="holiday-modal__heading"><div><h2 id="holiday-modal-title">{holiday.name}</h2><p>{holidayDateFormatter.format(new Date(`${holiday.date}T12:00:00`))}</p></div><button type="button" className="holiday-modal__close" onClick={onClose} aria-label="Dialog schließen">×</button></div><div className="holiday-modal__content"><h3>Gültig in</h3><ul>{holiday.countries.map((country) => { const states = getHolidayStateNames(country.stateCodes); return <li key={country.countryCode}><strong>{country.name}</strong>{states.length > 0 && <small>{states.join(', ')}</small>}</li> })}</ul></div><div className="holiday-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Schließen</button></div></section></div>
}

export default function HolidayCalendarPage() {
  const now = new Date()
  const years = useMemo(() => holidayYears(), [])
  const [year, setYear] = useState(() => now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [germanyEnabled, setGermanyEnabled] = useState(true)
  const [selectedStates, setSelectedStates] = useState(() => GERMAN_STATES.map((state) => state.code))
  const [expandedCountries, setExpandedCountries] = useState(() => new Set(['DE']))
  const [selectedHoliday, setSelectedHoliday] = useState(null)
  const [holidayRecords, setHolidayRecords] = useState([])
  const [holidayLoadError, setHolidayLoadError] = useState('')
  const holidays = useMemo(() => getVisibleHolidays(holidayRecords, year, germanyEnabled, selectedStates), [germanyEnabled, holidayRecords, selectedStates, year])
  const today = localTodayValue()

  useEffect(() => {
    let active = true
    listPublicHolidays('DE')
      .then((records) => { if (active) { setHolidayRecords(records); setHolidayLoadError('') } })
      .catch(() => { if (active) setHolidayLoadError('Feiertage konnten nicht geladen werden.') })
    return () => { active = false }
  }, [])

  function moveMonth(delta) {
    const next = new Date(year, month + delta, 1)
    if (!years.includes(next.getFullYear())) return
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  function showToday() {
    const current = new Date()
    if (!years.includes(current.getFullYear())) return
    setYear(current.getFullYear())
    setMonth(current.getMonth())
  }

  function toggleGermany(checked) {
    setGermanyEnabled(checked)
    setSelectedStates(checked ? GERMAN_STATES.map((state) => state.code) : [])
  }

  function toggleState(code, checked) {
    setSelectedStates((current) => checked ? [...new Set([...current, code])] : current.filter((stateCode) => stateCode !== code))
  }

  function toggleCountryExpansion(code) {
    setExpandedCountries((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  return <div className="holiday-page">
    <section className="holiday-calendar-card">
      <div className="holiday-toolbar">
        <div className="holiday-toolbar__period">
          <label className="filter-field"><span className="sr-only">Monat</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{VACATION_MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label>
          <label className="filter-field"><span className="sr-only">Jahr</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <button className="holiday-nav-button" type="button" onClick={() => moveMonth(-1)} aria-label="Vorheriger Monat">‹</button>
          <button className="holiday-today-button" type="button" onClick={showToday}>Heute</button>
          <button className="holiday-nav-button" type="button" onClick={() => moveMonth(1)} aria-label="Nächster Monat">›</button>
        </div>
      </div>
      {holidayLoadError && <p className="holiday-calendar-state">{holidayLoadError}</p>}
      <HolidayMonthCalendar year={year} month={month} today={today} holidays={holidays} onHolidayClick={setSelectedHoliday} />
    </section>

    <aside className="holiday-countries-card">
      <div className="holiday-countries-card__heading"><h2>Länder</h2><p>Feiertagsauswahl</p></div>
      <div className="holiday-country-list"><label className="holiday-country-list__all"><input type="checkbox" checked={germanyEnabled} onChange={(event) => toggleGermany(event.target.checked)} /><span>Alle Länder</span></label>{EUROPEAN_COUNTRIES.map((country) => {
        const isExpanded = expandedCountries.has(country.code)
        return <div className={`holiday-country${country.available ? '' : ' holiday-country--unavailable'}`} key={country.code}>
          <div className="holiday-country__row">
            {country.regions.length > 0 ? <button className={`holiday-country__toggle${isExpanded ? ' holiday-country__toggle--open' : ''}`} type="button" onClick={() => toggleCountryExpansion(country.code)} aria-label={`${country.name} ${isExpanded ? 'einklappen' : 'ausklappen'}`}>›</button> : <span className="holiday-country__toggle-placeholder" />}
            <label><input type="checkbox" checked={country.code === 'DE' ? germanyEnabled : false} disabled={!country.available} onChange={(event) => { if (country.code === 'DE') toggleGermany(event.target.checked) }} /><span>{country.name}</span></label>
            {!country.available && <small>Feiertage folgen</small>}
          </div>
          {country.code === 'DE' && isExpanded && <div className="holiday-state-list">{country.regions.map((state) => <label className="holiday-state" key={state.code}><input type="checkbox" checked={selectedStates.includes(state.code)} disabled={!germanyEnabled} onChange={(event) => toggleState(state.code, event.target.checked)} /><span>{state.name}</span></label>)}</div>}
        </div>
      })}</div>
    </aside>
    {selectedHoliday && <HolidayDetailModal holiday={selectedHoliday} onClose={() => setSelectedHoliday(null)} />}
  </div>
}
