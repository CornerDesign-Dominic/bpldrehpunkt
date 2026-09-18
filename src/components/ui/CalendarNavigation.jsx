export default function CalendarNavigation({ children, onNext, onPrevious, onToday }) {
  return <div className="calendar-navigation">
    <button className="calendar-navigation__button calendar-navigation__button--previous" type="button" onClick={onPrevious} aria-label="Vorheriger Monat">‹</button>
    <button className="calendar-navigation__button calendar-navigation__button--today" type="button" onClick={onToday}>Heute</button>
    <button className="calendar-navigation__button calendar-navigation__button--next" type="button" onClick={onNext} aria-label="Nächster Monat">›</button>
    <div className="calendar-navigation__period">{children}</div>
  </div>
}
