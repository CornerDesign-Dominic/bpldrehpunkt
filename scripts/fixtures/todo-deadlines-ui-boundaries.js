export * from './todo-ui-boundaries.js'
import { calendarDaysUntil } from '../../src/lib/caseDeadline.js'
export const todoDeadlinePresentation = deadline => {
  const days = calendarDaysUntil(deadline.date)
  return { days, kind: days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 3 ? 'urgent' : days <= 7 ? 'warning' : 'none', label: days < 0 ? `${Math.abs(days)} Tage überfällig` : days === 0 ? 'Heute' : days <= 7 ? `In ${days} Tagen` : 'Später' }
}
