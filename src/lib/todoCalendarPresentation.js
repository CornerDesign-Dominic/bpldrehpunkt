export function todoProjectionCalendars(userId, profile) {
  if (profile?.active !== true || !(profile.role === 'superadmin' || ['view', 'edit'].includes(profile.permissions?.todos))) return []
  const department = typeof profile.department === 'string' ? profile.department.trim() : ''
  return [
    { id: `personal-${userId}`, name: 'Mein Kalender', color: '#c99a3d', kind: 'personal', ownerUserId: userId, accessLevel: 'view', todoCalendar: true, systemCalendar: true },
    ...(department ? [{ id: `todo-department:${department}`, name: department, color: '#55758d', kind: 'department', accessLevel: 'view', todoCalendar: true, systemCalendar: true }] : []),
  ]
}

export function mergeTodoCalendars(calendars, projectionCalendars) {
  const known = new Set(calendars.map((calendar) => calendar.id))
  return [...calendars, ...projectionCalendars.filter((calendar) => !known.has(calendar.id))]
}
