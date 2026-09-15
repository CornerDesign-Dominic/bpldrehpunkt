import { useMemo, useState } from 'react'
import HolidayMonthCalendar from '../components/holidays/HolidayMonthCalendar.jsx'
import { EUROPEAN_COUNTRIES, GERMAN_STATES, HOLIDAY_YEARS, getVisibleHolidays } from '../lib/holidayCalendar.js'
import { VACATION_MONTHS } from '../lib/vacationCalendar.js'
import '../styles/holidayCalendar.css'

function localTodayValue() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

export default function HolidayCalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(() => HOLIDAY_YEARS.includes(now.getFullYear()) ? now.getFullYear() : HOLIDAY_YEARS[0])
  const [month, setMonth] = useState(now.getMonth())
  const [germanyEnabled, setGermanyEnabled] = useState(true)
  const [selectedStates, setSelectedStates] = useState(() => GERMAN_STATES.map((state) => state.code))
  const [expandedCountries, setExpandedCountries] = useState(() => new Set(['DE']))
  const holidays = useMemo(() => getVisibleHolidays(year, germanyEnabled, selectedStates), [germanyEnabled, selectedStates, year])
  const today = localTodayValue()

  function moveMonth(delta) {
    const next = new Date(year, month + delta, 1)
    if (!HOLIDAY_YEARS.includes(next.getFullYear())) return
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  function showToday() {
    const current = new Date()
    if (!HOLIDAY_YEARS.includes(current.getFullYear())) return
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
          <label className="filter-field"><span className="sr-only">Jahr</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{HOLIDAY_YEARS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <button className="holiday-nav-button" type="button" onClick={() => moveMonth(-1)} aria-label="Vorheriger Monat">‹</button>
          <button className="holiday-today-button" type="button" onClick={showToday}>Heute</button>
          <button className="holiday-nav-button" type="button" onClick={() => moveMonth(1)} aria-label="Nächster Monat">›</button>
        </div>
      </div>
      <HolidayMonthCalendar year={year} month={month} today={today} holidays={holidays} />
      <div className="holiday-legend" aria-label="Legende"><span className="holiday-legend__item holiday-legend__item--national">Bundesweit</span><span className="holiday-legend__item holiday-legend__item--regional">Bundeslandweit</span></div>
    </section>

    <aside className="holiday-countries-card">
      <div className="holiday-countries-card__heading"><h2>Länder</h2><p>Feiertagsauswahl</p></div>
      <div className="holiday-country-list">{EUROPEAN_COUNTRIES.map((country) => {
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
  </div>
}
