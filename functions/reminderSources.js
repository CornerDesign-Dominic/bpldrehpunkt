import { createHash } from 'node:crypto'
import { resolveReminderTime } from './shared/reminderTime.js'
import { canReadTodoForUser, todoAudienceMember, todoReminderRecipientIds } from './shared/todoCollaboration.js'

export const reminderCaseModules = Object.freeze({ damageCases: 'damages', inkassoCases: 'inkasso', legalDisputes: 'legalDisputes', insolvencies: 'insolvencies', todos: 'todos' })
const systemCalendars = new Set(['system-damages', 'system-insolvencies', 'system-legal-disputes', 'system-inkasso'])
const labels = { damageCases: 'Schadenfall', inkassoCases: 'Inkassofall', legalDisputes: 'Gericht / Streit', insolvencies: 'Insolvenzfall', todos: 'To-do' }
export const reminderHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const reminderSourceKey = (path) => reminderHash(path)
const text = (value) => typeof value === 'string' ? value.trim() : ''
const identifier = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 240 && !value.includes('/') && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) && !['.', '..'].includes(value)
const canView = (profile, module) => profile?.active === true && (profile.role === 'superadmin' || ['view', 'edit'].includes(profile.permissions?.[module]))

/** Explicit registry. Mirrors and arbitrary collection-group paths never enter
 * either the scheduler or the status endpoint. Add sources here deliberately. */
export const reminderSourceRegistry = Object.freeze([
  { id: 'calendar-events', match: (parts) => parts.length === 4 && parts[0] === 'calendars' && parts[2] === 'events' && !systemCalendars.has(parts[1]), module: 'calendar', kind: 'calendar-event' },
  { id: 'todo-reminders', match: (parts) => parts.length === 2 && parts[0] === 'todos', module: 'todos', kind: 'todo' },
  { id: 'case-deadlines', match: (parts) => parts.length === 4 && Object.hasOwn(reminderCaseModules, parts[0]) && parts[2] === 'deadlines', kind: 'deadline' },
])

export function reminderSourceDescriptor(sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.length > 1000) return null
  const parts = sourcePath.split('/')
  if (parts.some((part) => !identifier(part))) return null
  const adapter = reminderSourceRegistry.find((item) => item.match(parts))
  if (!adapter) return null
  return { sourcePath, adapter: adapter.id, kind: adapter.kind, module: adapter.module || reminderCaseModules[parts[0]], root: parts[0], parentPath: parts.slice(0, 2).join('/'), calendarId: adapter.kind === 'calendar-event' ? parts[1] : null }
}

export function reminderParentSuppressed(descriptor, parent, source) {
  if (!parent || !source) return 'Die Quelle wurde gelöscht.'
  if (parent.splitArchivedAt || parent.archivedAt || parent.mergedIntoPartnerId || source.splitArchivedAt || source.archivedAt) return 'Der Vorgang ist archiviert.'
  if (descriptor.kind === 'calendar-event') return parent.active === false ? 'Der Kalender ist deaktiviert.' : null
  if (descriptor.root === 'todos' && ['completed', 'withdrawn'].includes(parent.status)) return 'Das To-do ist abgeschlossen oder zurückgezogen.'
  if (descriptor.root === 'damageCases' && ['economically_closed', 'completed'].includes(parent.status)) return 'Der Schadenfall ist abgeschlossen.'
  if (['inkassoCases', 'legalDisputes'].includes(descriptor.root) && (parent.status === 'completed' || parent.isClosed === true)) return 'Der Vorgang ist abgeschlossen.'
  return null
}

export function reminderRecipientPolicy(descriptor, parent, source = parent) {
  if (descriptor.kind === 'calendar-event') return parent.kind === 'personal' ? { type: 'users', userIds: identifier(parent.ownerUserId) ? [parent.ownerUserId] : [] } : { type: 'calendar-readers', userIds: [] }
  if (descriptor.root === 'todos') return { type: 'todo-audience', mode: source?.reminderRecipientMode || 'all', userIds: source?.reminderRecipientMode === 'selected' && Array.isArray(source.reminderRecipientUserIds) ? source.reminderRecipientUserIds.filter(identifier) : [] }
  const userId = parent.responsibleUserId
  return { type: 'users', userIds: identifier(userId) ? [userId] : [] }
}

export async function loadReminderSource(db, sourcePath, reader = { get: (reference) => reference.get() }) {
  const descriptor = reminderSourceDescriptor(sourcePath)
  if (!descriptor) return null
  const sourceRef = db.doc(sourcePath)
  const sourceSnapshot = await reader.get(sourceRef)
  const parentSnapshot = sourcePath === descriptor.parentPath ? sourceSnapshot : await reader.get(db.doc(descriptor.parentPath))
  const source = sourceSnapshot.exists ? sourceSnapshot.data() : null
  const parent = parentSnapshot.exists ? parentSnapshot.data() : null
  const enabled = descriptor.kind === 'todo' ? Boolean(text(source?.reminderDate)) : source?.reminderEnabled === true
  const date = descriptor.kind === 'deadline' ? source?.date : source?.reminderDate
  const time = descriptor.kind === 'deadline' ? source?.time : source?.reminderTime
  const occurrence = source?.reminderOccurrence || null
  const resolved = resolveReminderTime({ date, time, occurrence })
  const policy = parent ? reminderRecipientPolicy(descriptor, parent, source) : { type: 'users', userIds: [] }
  const suppressed = reminderParentSuppressed(descriptor, parent, source)
  const configuration = !resolved.valid ? resolved.message : policy.type === 'todo-audience' && policy.mode === 'selected' && !policy.userIds.length ? 'Keine Erinnerungsempfänger ausgewählt.' : policy.type === 'users' && !policy.userIds.length ? 'Bitte eine zuständige Person festlegen.' : null
  const scheduleId = resolved.valid ? reminderHash([sourcePath, resolved.dueAt]) : null
  const title = descriptor.kind === 'deadline' ? text(parent?.caseNumber) || text(parent?.title) || text(parent?.partnerName) || text(parent?.debtorName) || labels[descriptor.root] : text(source?.title) || 'Kalendertermin'
  const note = descriptor.kind === 'todo' ? '' : text(source?.note) || (descriptor.kind === 'calendar-event' ? text(source?.description) : '')
  const version = reminderHash([scheduleId, enabled, suppressed, policy, title, note, parent?.kind || '', parent?.ownerUserId || ''])
  return { ...descriptor, sourceRef, source, parent, exists: Boolean(source && parent), enabled, date, time, occurrence: resolved.valid ? resolved.occurrence : occurrence, dueAt: resolved.valid ? resolved.dueAt : null, scheduleId, version, policy, suppressed, configuration, title, note, sourceType: descriptor.kind === 'calendar-event' ? 'Kalendertermin' : labels[descriptor.root], resolved }
}

export function reminderParentVersion(value) {
  const keys = ['status', 'isClosed', 'responsibleUserId', 'assignedUserId', 'creatorUserId', 'ownerUserId', 'kind', 'active', 'splitArchivedAt', 'archivedAt', 'mergedIntoPartnerId', 'title', 'caseNumber', 'partnerName', 'debtorName', 'audienceType', 'audienceId', 'audienceIds', 'reminderRecipientMode', 'reminderRecipientUserIds']
  return reminderHash(value ? keys.map((key) => value[key] ?? null) : null)
}

export function reminderParentChanged(before, after) { return reminderParentVersion(before) !== reminderParentVersion(after) }

export function reminderSourceChanged(before, after) {
  const keys = ['reminderEnabled', 'reminderDate', 'reminderTime', 'reminderOccurrence', 'date', 'time', 'title', 'note', 'description', 'splitArchivedAt', 'archivedAt', 'reminderRecipientMode', 'reminderRecipientUserIds']
  const select = (value) => value ? keys.map((key) => value[key] ?? null) : null
  return JSON.stringify(select(before)) !== JSON.stringify(select(after))
}

/** Mirrors the actual read Rules, including the module gate and the restricted
 * To-do audience. Personal mail recipients remain owner-only independently. */
export function canReadReminderSource(context, userId, profile, permission = null) {
  if (!context?.exists || !canView(profile, context.module)) return false
  if (context.kind === 'calendar-event') return profile.role === 'superadmin' || context.parent.ownerUserId === userId || ['view', 'edit'].includes(permission?.level)
  if (context.root !== 'todos') return true
  return canReadTodoForUser(context.parent, userId, profile)
}

export async function reminderPermission(db, context, userId, reader = { get: (reference) => reference.get() }) {
  return context.kind === 'calendar-event' ? (await reader.get(db.doc(`calendarPermissions/${context.calendarId}_${userId}`))).data() || null : null
}

function recipientDetails(context, userId, profile, permission) {
  const named = [text(profile?.firstName), text(profile?.lastName)].filter(Boolean).join(' ') || 'Benutzer'
  const email = text(profile?.email)
  const permitted = canReadReminderSource(context, userId, profile, permission)
  const selected = context.policy.type === 'todo-audience'
    ? todoAudienceMember(context.parent, userId, profile) && (context.policy.mode === 'all' || (context.policy.mode === 'selected' && context.policy.userIds.includes(userId)))
    : context.policy.type === 'calendar-readers' || context.policy.userIds.includes(userId)
  const eligible = selected && permitted && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  return { userId, name: named.slice(0, 160), email, eligible, permitted, reason: !profile || profile.active !== true ? 'Die zuständige Person ist nicht aktiv.' : !selected || !permitted ? 'Die zuständige Person hat keinen aktuellen Lesezugriff.' : !eligible ? 'Für die zuständige Person fehlt eine gültige Profil-E-Mail-Adresse.' : null }
}

export async function loadReminderRecipient(db, context, userId, reader = { get: (reference) => reference.get() }) {
  if (!identifier(userId)) return null
  const snapshot = await reader.get(db.doc(`users/${userId}`))
  const permission = await reminderPermission(db, context, userId, reader)
  return recipientDetails(context, userId, snapshot.exists ? snapshot.data() : null, permission)
}

/** Cache lifetime is exactly one status request/source audience lookup. Claims
 * and the HTTP gate always use loadReminderRecipient with fresh documents. */
export function createReminderRecipientCache(db) {
  let directory
  const profiles = new Map(), calendarPermissions = new Map()
  const profileFor = (id) => {
    if (!profiles.has(id)) profiles.set(id, db.doc(`users/${id}`).get().then((snapshot) => snapshot.exists ? snapshot.data() : null))
    return profiles.get(id)
  }
  return { async recipients(context) {
    if (context.policy.type === 'todo-audience') {
      directory ||= db.collection('users').where('active', '==', true).select('active', 'firstName', 'lastName', 'email', 'role', 'permissions', 'department').get().then((snapshot) => snapshot.docs.map((entry) => ({ userId: entry.id, profile: entry.data() })))
      const users = await directory
      const selected = new Set(todoReminderRecipientIds(context.parent, context.source || { reminderRecipientMode: context.policy.mode, reminderRecipientUserIds: context.policy.userIds }, users))
      return users.filter((entry) => selected.has(entry.userId)).map((entry) => recipientDetails(context, entry.userId, entry.profile, null))
    }
    if (context.policy.type !== 'calendar-readers') return Promise.all(context.policy.userIds.map(async (id) => recipientDetails(context, id, await profileFor(id), await reminderPermission(db, context, id))))
    directory ||= db.collection('users').where('active', '==', true).select('active', 'firstName', 'lastName', 'email', 'role', 'permissions', 'department').get().then((snapshot) => snapshot.docs.map((entry) => ({ userId: entry.id, profile: entry.data() })))
    const users = (await directory).filter((item) => canView(item.profile, 'calendar'))
    if (!calendarPermissions.has(context.calendarId)) calendarPermissions.set(context.calendarId, (async () => {
      const result = new Map()
      // Read the canonical Rules keys, never trust arbitrary permission IDs or
      // infer access from fields on noncanonical permission documents.
      const ids = users.filter((item) => item.profile.role !== 'superadmin').map((item) => item.userId)
      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100)
        const snapshots = await db.getAll(...batch.map((id) => db.doc(`calendarPermissions/${context.calendarId}_${id}`)))
        snapshots.forEach((snapshot, index) => result.set(batch[index], snapshot.data() || null))
      }
      return result
    })())
    const permissions = await calendarPermissions.get(context.calendarId)
    return users.map((item) => recipientDetails(context, item.userId, item.profile, permissions.get(item.userId))).filter((item) => item.permitted)
  } }
}

export function loadReminderRecipients(db, context, cache = createReminderRecipientCache(db)) {
  return cache.recipients(context)
}

export function reminderDeliveryId(context, userId) { return reminderHash([context.sourcePath, context.dueAt, userId]) }

export function legacyReminderDeliveryId(context, email) {
  return context.kind === 'deadline' ? createHash('sha256').update(`${context.sourcePath}|${context.date}|${context.time}|${email.toLowerCase()}`).digest('hex') : null
}
