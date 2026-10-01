import { useLanguage } from '../../i18n/useLanguage.js'

export default function CalendarNavigation({ children, onNext, onPrevious, onToday }) {
  const { t } = useLanguage()
  return <div className="calendar-navigation">
    <button className="calendar-navigation__button calendar-navigation__button--previous" type="button" onClick={onPrevious} aria-label={t('calendar.previousMonth')}>‹</button>
    <button className="calendar-navigation__button calendar-navigation__button--today" type="button" onClick={onToday}>{t('calendar.today')}</button>
    <button className="calendar-navigation__button calendar-navigation__button--next" type="button" onClick={onNext} aria-label={t('calendar.nextMonth')}>›</button>
    <div className="calendar-navigation__period">{children}</div>
  </div>
}
