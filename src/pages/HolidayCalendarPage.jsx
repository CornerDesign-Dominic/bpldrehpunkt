import { useEffect, useMemo, useState } from 'react'
import HolidayMonthCalendar from '../components/holidays/HolidayMonthCalendar.jsx'
import HolidayDetailModal from '../components/holidays/HolidayDetailModal.jsx'
import { EUROPEAN_COUNTRIES, GERMAN_STATES, SYNCHRONIZED_HOLIDAY_COUNTRY_CODES, getVisibleHolidays, holidayYears } from '../lib/holidayCalendar.js'
import { listPublicHolidays, listSchoolHolidays } from '../lib/holidayData.js'
import { schoolHolidayDaysForMonth } from '../lib/schoolHolidayCalendar.js'
import { VACATION_MONTHS } from '../lib/vacationCalendar.js'
import '../styles/holidayCalendar.css'

function localTodayValue() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

export default function HolidayCalendarPage() {
  const now = new Date()
  const years = useMemo(() => holidayYears(), [])
  const [year, setYear] = useState(() => now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [germanyEnabled, setGermanyEnabled] = useState(true)
  const [selectedStates, setSelectedStates] = useState(() => GERMAN_STATES.map((state) => state.code))
  const [selectedCountryCodes, setSelectedCountryCodes] = useState(['DE'])
  const [expandedCountries, setExpandedCountries] = useState(() => new Set(['DE']))
  const [selectedHoliday, setSelectedHoliday] = useState(null)
  const [holidayRecords, setHolidayRecords] = useState([])
  const [holidayLoadError, setHolidayLoadError] = useState('')
  const [schoolHolidaysEnabled, setSchoolHolidaysEnabled] = useState(true)
  const [schoolHolidaySubdivisionCode, setSchoolHolidaySubdivisionCode] = useState('DE-NW')
  const [schoolHolidayRecords, setSchoolHolidayRecords] = useState([])
  const [schoolHolidayLoadError, setSchoolHolidayLoadError] = useState('')
  const holidays = useMemo(() => getVisibleHolidays(holidayRecords, year, germanyEnabled, selectedStates, selectedCountryCodes), [germanyEnabled, holidayRecords, selectedCountryCodes, selectedStates, year])
  const schoolHolidayDays = useMemo(() => schoolHolidaysEnabled ? schoolHolidayDaysForMonth(schoolHolidayRecords, year, month) : {}, [month, schoolHolidayRecords, schoolHolidaysEnabled, year])
  const allCountriesSelected = SYNCHRONIZED_HOLIDAY_COUNTRY_CODES.every((countryCode) => selectedCountryCodes.includes(countryCode))
  const today = localTodayValue()

  useEffect(() => {
    let active = true
    Promise.all(selectedCountryCodes.map((countryCode) => listPublicHolidays(countryCode)))
      .then((results) => { if (active) { setHolidayRecords(results.flat()); setHolidayLoadError('') } })
      .catch(() => { if (active) setHolidayLoadError('Feiertage konnten nicht geladen werden.') })
    return () => { active = false }
  }, [selectedCountryCodes])

  useEffect(() => {
    if (!schoolHolidaysEnabled) return undefined
    let active = true
    listSchoolHolidays('DE', schoolHolidaySubdivisionCode)
      .then((records) => { if (active) { setSchoolHolidayRecords(records); setSchoolHolidayLoadError('') } })
      .catch(() => { if (active) { setSchoolHolidayRecords([]); setSchoolHolidayLoadError('Ferien konnten nicht geladen werden.') } })
    return () => { active = false }
  }, [schoolHolidaySubdivisionCode, schoolHolidaysEnabled])

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
    setSelectedCountryCodes((current) => checked ? [...new Set([...current, 'DE'])] : current.filter((countryCode) => countryCode !== 'DE'))
  }

  function toggleCountry(countryCode, checked) {
    if (countryCode === 'DE') { toggleGermany(checked); return }
    setSelectedCountryCodes((current) => checked ? [...new Set([...current, countryCode])] : current.filter((code) => code !== countryCode))
  }

  function toggleAllCountries(checked) {
    setSelectedCountryCodes(checked ? [...SYNCHRONIZED_HOLIDAY_COUNTRY_CODES] : [])
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
      <HolidayMonthCalendar year={year} month={month} today={today} holidays={holidays} schoolHolidayDays={schoolHolidayDays} onHolidayClick={setSelectedHoliday} />
    </section>

    <div className="holiday-sidebar">
      <section className="school-holidays-card">
        <div className="school-holidays-card__heading"><h2>Schulferien</h2></div>
        <label className="school-holidays-card__toggle"><input type="checkbox" checked={schoolHolidaysEnabled} onChange={(event) => setSchoolHolidaysEnabled(event.target.checked)} /><span>Ferien einblenden</span></label>
        <label className="filter-field school-holidays-card__field"><span className="sr-only">Bundesland</span><select aria-label="Bundesland" value={schoolHolidaySubdivisionCode} disabled={!schoolHolidaysEnabled} onChange={(event) => setSchoolHolidaySubdivisionCode(event.target.value)}>{GERMAN_STATES.map((state) => <option key={state.code} value={`DE-${state.code}`}>{state.name}</option>)}</select></label>
        {schoolHolidayLoadError && <p className="school-holidays-card__error">{schoolHolidayLoadError}</p>}
      </section>
      <aside className="holiday-countries-card">
        <div className="holiday-countries-card__heading"><h2>Feiertage</h2></div>
      <div className="holiday-country-list"><label className="holiday-country-list__all"><input type="checkbox" checked={allCountriesSelected} onChange={(event) => toggleAllCountries(event.target.checked)} /><span>Alle Länder</span></label>{EUROPEAN_COUNTRIES.map((country) => {
        const isExpanded = expandedCountries.has(country.code)
        return <div className={`holiday-country${country.available ? '' : ' holiday-country--unavailable'}`} key={country.code}>
          <div className="holiday-country__row">
            {country.regions.length > 0 ? <button className={`holiday-country__toggle${isExpanded ? ' holiday-country__toggle--open' : ''}`} type="button" onClick={() => toggleCountryExpansion(country.code)} aria-label={`${country.name} ${isExpanded ? 'einklappen' : 'ausklappen'}`}>›</button> : <span className="holiday-country__toggle-placeholder" />}
            <label><input type="checkbox" checked={country.code === 'DE' ? germanyEnabled : selectedCountryCodes.includes(country.code)} disabled={!country.available} onChange={(event) => toggleCountry(country.code, event.target.checked)} /><span>{country.name}</span></label>
            {!country.available && <small>Feiertage folgen</small>}
          </div>
          {country.code === 'DE' && isExpanded && <div className="holiday-state-list">{country.regions.map((state) => <label className="holiday-state" key={state.code}><input type="checkbox" checked={selectedStates.includes(state.code)} disabled={!germanyEnabled} onChange={(event) => toggleState(state.code, event.target.checked)} /><span>{state.name}</span></label>)}</div>}
        </div>
      })}</div>
      </aside>
    </div>
    {selectedHoliday && <HolidayDetailModal holiday={selectedHoliday} onClose={() => setSelectedHoliday(null)} />}
  </div>
}
