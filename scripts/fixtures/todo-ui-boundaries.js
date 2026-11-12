const state = () => globalThis.__todoUiTest
const clone = value => value ? { ...value } : null
const watch = (key, callback, onError) => {
  const current = state()
  current.listeners ||= {}
  current.listeners[key] ||= new Set()
  const listener = { callback, onError }
  current.listeners[key].add(listener)
  queueMicrotask(() => { if (current.listeners[key].has(listener)) callback(key === 'todo' ? clone(current.todo) : [...(current[key] || [])]) })
  return () => current.listeners[key].delete(listener)
}
export const subscribeTodo = (_id, onValue, onError) => watch('todo', onValue, onError)
export const subscribeTodoUpdates = (_id, onValue, onError) => watch('updates', onValue, onError)
export const subscribeTodoDeadlines = (_id, onValue, onError) => watch('deadlines', onValue, onError)
export const TODO_STATUS = { open: 'Offen', in_progress: 'In Bearbeitung', completed: 'Erledigt', withdrawn: 'Zurückgezogen' }
export const TODO_PRIORITY = { high: 'Hoch', medium: 'Mittel', low: 'Gering' }
export const TODO_SCHEDULE_TYPES = [{ value: 'deadline', label: 'Frist' }, { value: 'appointment', label: 'Termin' }]
export const useAuth = () => state().actor
export const usePermissions = () => ({ canEdit: key => state().actor.profile.permissions?.[key] === 'edit' || state().actor.profile.role === 'superadmin', canView: key => ['view', 'edit'].includes(state().actor.profile.permissions?.[key]) || state().actor.profile.role === 'superadmin' })
export const getUserDisplayName = entry => [entry?.firstName, entry?.lastName].filter(Boolean).join(' ') || entry?.name || 'Benutzer'
export const listVisibleUserDirectory = async () => { if (state().directoryError) throw state().directoryError; return state().users }
export const listBusinessPartners = async () => []
export const listDamageCases = async () => []
export const listInsolvencies = async () => []
export const listTransportOrdersPage = async () => ({ entries: [], nextCursor: null })
export const getTodoById = async () => ({ ...state().todo })
export const listTodoUpdates = async () => state().updates || []
export const listTodoDeadlines = async () => state().deadlines || []
export const todoStatus = todo => todo.status
export const todoPriority = todo => todo.priority || 'medium'
export const todoDeadlinePresentation = () => ({ kind: 'none', label: 'Später' })
export const todoDuePresentation = () => ({ kind: 'none', days: null, label: 'Keine Fälligkeit' })
export const todoScheduleTypeLabel = type => type === 'appointment' ? 'Termin' : 'Frist'
export const isSelfTodo = (todo, id) => todo.creatorUserId === id && todo.audienceType === 'person' && todo.audienceId === id
export const createEmptyTodo = () => ({ title: '', description: '', dueDate: '', reminderDate: '', reminderTime: '', reminderOccurrence: null, reminderRecipientMode: 'all', reminderRecipientUserIds: [], priority: 'medium', audienceType: 'self', audienceId: '', audienceIds: [], transportOrderLinks: [], customerId: '', carrierId: '' })
export const createEmptyTodoDeadline = () => ({ type: 'deadline', date: '2026-12-01', time: '', reminderEnabled: false })
export const audienceHasChanged = (todo, values, currentId) => {
  const kind = values.audienceType === 'self' ? 'person' : values.audienceType
  return kind !== todo.audienceType || (kind === 'person' && currentId !== todo.audienceId) || (kind === 'people' && JSON.stringify(values.audienceIds) !== JSON.stringify(todo.audienceIds)) || (kind === 'department' && values.audienceId !== todo.audienceId)
}
const record = (name, args) => { state().calls.push({ name, args }) }
const mutation = async (name, args, change) => {
  record(name, args); await state().pendingMutation; if (state().mutationError) throw state().mutationError; change?.()
  for (const [key, listeners] of Object.entries(state().listeners || {})) for (const listener of listeners) listener.callback(key === 'todo' ? clone(state().todo) : [...(state()[key] || [])])
}
export const updateTodoByCreator = async (...args) => mutation('update', args, () => { state().todo = { ...state().todo, ...args[1] } })
export const completeTodoForCurrentUser = async (...args) => mutation('complete', args, () => { state().todo = { ...state().todo, status: 'completed' } })
export const reactivateTodoForCurrentUser = async (...args) => mutation('reopen', args, () => { state().todo = { ...state().todo, status: 'open' } })
export const withdrawTodo = async (...args) => mutation('withdraw', args, () => { state().todo = { ...state().todo, status: 'withdrawn' } })
export const addTodoNote = async (...args) => record('note', args)
export const createTodoDeadline = async (...args) => mutation('deadline.create', args, () => { state().deadlines.push({ id: `date-${state().deadlines.length}`, ...args[1] }) })
export const updateTodoDeadline = async (...args) => mutation('deadline.update', args, () => { state().deadlines = state().deadlines.map(item => item.id === args[1].id ? { ...item, ...args[2] } : item) })
export const deleteTodoDeadline = async (...args) => mutation('deadline.delete', args, () => { state().deadlines = state().deadlines.filter(item => item.id !== args[1].id) })
export const reportTechnicalFailure = async () => false
export const getReminderStatus = async () => ({ status: 'scheduled', recipients: [] })
