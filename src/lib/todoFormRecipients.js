import { todoEligibleParticipants } from '../../shared/todoCollaboration.js'

export function todoFormAudience(values, currentUserId) {
  return values.audienceType === 'self' ? { ...values, audienceType: 'person', audienceId: currentUserId } : values
}

export function todoFormRecipientValues(values, users, currentUserId) {
  const allowed = new Set(todoEligibleParticipants(todoFormAudience(values, currentUserId), users).map((entry) => entry.id))
  return {
    ...values,
    reminderRecipientMode: values.reminderRecipientMode === 'selected' ? 'selected' : 'all',
    reminderRecipientUserIds: values.reminderRecipientMode === 'selected'
      ? [...new Set(values.reminderRecipientUserIds || [])].filter((id) => allowed.has(id)) : [],
  }
}
