const uidOf = (entry) => entry?.id || entry?.userId || entry?.uid || ''
const readable = (profile) => profile?.active === true && (profile.role === 'superadmin' || ['view', 'edit'].includes(profile.permissions?.todos))
// The reduced, active-only UI directory exposes its To-do level, never the
// full permission map. This projection is not used for actor authorization.
const readableDirectory = (profile) => profile?.active === undefined ? ['view', 'edit'].includes(profile?.todoAccessLevel) : readable(profile)
const actorId = (actor) => actor?.user?.uid || actor?.userId || ''

export function todoAudienceMember(todo, userId, profile) {
  if (!todo || !userId) return false
  if (todo.audienceType === 'all') return true
  if (todo.audienceType === 'person') return todo.audienceId === userId
  if (todo.audienceType === 'people') return Array.isArray(todo.audienceIds) && todo.audienceIds.includes(userId)
  return todo.audienceType === 'department' && typeof profile?.department === 'string' && todo.audienceId === profile.department.trim()
}

export function canReadTodoForUser(todo, userId, profile) {
  if (!todo || !userId) return false
  return readable(profile) && (profile.role === 'superadmin' || todo?.creatorUserId === userId || (todo?.status !== 'withdrawn' && todoAudienceMember(todo, userId, profile)))
}

export function canCollaborateTodo(todo, actor) {
  const profile = actor?.profile
  return canReadTodoForUser(todo, actorId(actor), profile) && (profile.role === 'superadmin' || profile.permissions?.todos === 'edit')
}

export function canManageTodoAudience(todo, actor) {
  return canCollaborateTodo(todo, actor) && (actor.profile.role === 'superadmin' || todo.creatorUserId === actorId(actor))
}

export function todoEligibleParticipants(todo, directory) {
  const entries = directory instanceof Map ? [...directory.values()] : Array.isArray(directory) ? directory : []
  return entries.filter((entry) => readableDirectory(entry.profile || entry) && todoAudienceMember(todo, uidOf(entry), entry.profile || entry))
    .map((entry) => ({ ...(entry.profile || entry), ...entry, id: uidOf(entry) }))
}

export function normalizeTodoReminderRecipients(values, previous = null) {
  const mode = values?.reminderRecipientMode ?? previous?.reminderRecipientMode ?? 'all'
  if (!['all', 'selected'].includes(mode)) throw new Error('Bitte gültige Erinnerungsempfänger auswählen.')
  const source = values?.reminderRecipientUserIds ?? previous?.reminderRecipientUserIds ?? []
  if (!Array.isArray(source) || source.length > 50 || source.some((id) => typeof id !== 'string' || !id.trim() || id.length > 128 || [...id].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === '/'))) throw new Error('Bitte gültige Erinnerungsempfänger auswählen.')
  return { reminderRecipientMode: mode, reminderRecipientUserIds: mode === 'selected' ? [...new Set(source.map((id) => id.trim()))] : [] }
}

export function todoReminderRecipientIds(todo, source, directory) {
  const eligible = todoEligibleParticipants(todo, directory).map((entry) => entry.id)
  const mode = source?.reminderRecipientMode || 'all'
  if (mode !== 'selected') return mode === 'all' ? eligible : []
  const selected = new Set(Array.isArray(source?.reminderRecipientUserIds) ? source.reminderRecipientUserIds : [])
  return eligible.filter((id) => selected.has(id))
}
