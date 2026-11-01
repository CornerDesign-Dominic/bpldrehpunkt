const invalid = () => Object.assign(new Error('Die Serverantwort ist unvollständig.'), { code: 'diagnostic/invalid-response' })
const text = (value) => typeof value === 'string' && Boolean(value.trim())
export function assertReminderStatuses(value, paths) {
  if (!Array.isArray(value?.statuses) || value.statuses.length !== new Set(paths).size) throw invalid()
  const remaining = new Set(paths)
  for (const status of value.statuses) {
    if (!remaining.delete(status?.sourcePath) || !text(status.status) || !(status.dueAt === null || (text(status.dueAt) && Number.isFinite(Date.parse(status.dueAt)))) || !Array.isArray(status.recipients)) throw invalid()
    if (status.reason !== undefined && typeof status.reason !== 'string') throw invalid()
    if (status.recipients.some((recipient) => !text(recipient?.userId) || !text(recipient?.name) || !text(recipient?.status))) throw invalid()
  }
  return value
}
export function assertReminderUsers(value) {
  if (!Array.isArray(value?.users) || value.users.some((user) => !text(user?.id) || !text(user?.name) || typeof user?.canReceiveMail !== 'boolean')) throw invalid()
  return value
}
export function assertReminderResponsibility(value) {
  if (!value || !(value.responsibleUserId === null || text(value.responsibleUserId)) || !(value.responsibleUserName === null || text(value.responsibleUserName)) || typeof value.changed !== 'boolean' || Boolean(value.responsibleUserId) !== Boolean(value.responsibleUserName)) throw invalid()
  return value
}
