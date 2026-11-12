import { useLanguage } from '../../i18n/useLanguage.js'

export default function TodoReminderHelp() {
  const { language } = useLanguage()
  const en = language === 'en'
  return <details className="todo-reminder-help" onKeyDown={(event) => {
    if (event.key === 'Escape' && event.currentTarget.open) {
      event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false
      event.currentTarget.querySelector('summary')?.focus()
    }
  }}>
    <summary aria-label={en ? 'About email reminders' : 'Hinweise zur Mail-Erinnerung'}>?</summary>
    <div className="todo-reminder-help__content">
      <p>{en ? 'Times use Europe/Berlin. Missed reminders are not sent later.' : 'Alle Uhrzeiten gelten für Europe/Berlin. Verpasste Erinnerungen werden nicht nachgeholt.'}</p>
      <p>{en ? 'Only the selected current participants receive an email. Department to-dos appear in the department calendar; other to-dos appear in the selected personal calendars.' : 'Eine Mail erhalten nur die ausgewählten aktuellen Beteiligten. Abteilungs-To-dos erscheinen im Abteilungskalender, andere To-dos in den ausgewählten persönlichen Kalendern.'}</p>
    </div>
  </details>
}
