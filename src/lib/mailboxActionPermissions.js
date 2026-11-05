import { canEdit, canView } from './permissions.js'

export function canStartMailboxAction(profile, kind) {
  if (profile?.active !== true || !canEdit(profile, 'mailboxes')) return false
  if (kind === 'order') return canEdit(profile, 'transportOrders') && canView(profile, 'masterData')
  if (['invoice', 'tracking'].includes(kind)) return canEdit(profile, 'transportOrders')
  if (kind === 'terms') return canView(profile, 'agbChecker')
  if (kind === 'calendar') return canView(profile, 'calendar')
  const module = { todo: 'todos', damage: 'damages', collection: 'inkasso', court: 'legalDisputes' }[kind]
  return Boolean(module && canEdit(profile, module))
}
