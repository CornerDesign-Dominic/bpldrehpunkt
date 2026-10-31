const retryableStatuses = new Set(['no_change', 'needs_review', 'error'])

export function statusMailAiLeaseExpiresAt(mail) {
  const value = mail?.aiProcessing?.expiresAt
  const millis = typeof value?.toMillis === 'function' ? value.toMillis()
    : typeof value === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN
  return Number.isFinite(millis) ? millis : null
}

export function canRetryStatusMailAi(mail, now = Date.now()) {
  const expiresAt = statusMailAiLeaseExpiresAt(mail)
  if (!Number.isFinite(now) || (expiresAt !== null && expiresAt > now)) return false
  if (retryableStatuses.has(mail?.ai?.status)) return true
  return mail?.ai?.status === 'pending' && typeof mail?.aiProcessing?.token === 'string'
    && Boolean(mail.aiProcessing.token.trim()) && expiresAt !== null && expiresAt <= now
}
