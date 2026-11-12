const state = () => globalThis.__calendarUiTest
export const useAuth = () => state().actor
export const useCompanyHolidaySettings = () => ({ calendarEntries: [] })
export const listUserCalendars = async () => [{ id: 'personal-alice', name: 'Mein Kalender', color: '#c99a3d', kind: 'personal', ownerUserId: 'alice', accessLevel: 'edit' }]
export const listCalendarEvents = async () => []
export const listSystemCalendarEvents = async () => []
export const listSystemCalendars = () => []
export const createCalendarEvent = async () => {}
export const updateCalendarEvent = async () => {}
export const deleteCalendarEvent = async () => {}
export const reportTechnicalFailure = async () => false
export const listTodoCalendarProjection = async (range) => {
  state().loads += 1
  state().ranges?.push({ ...range })
  if (state().failure) throw state().failure
  return { calendars: [], entries: state().entries.map((entry) => ({ ...entry })) }
}
export { todoProjectionCalendars, mergeTodoCalendars } from '../../src/lib/todoCalendarPresentation.js'
export default function CalendarEventModal() { return null }
