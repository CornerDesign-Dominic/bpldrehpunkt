import { HttpsError } from 'firebase-functions/v2/https'

// Called only by the superadmin branch of managed-user administration.
export async function timeManagerFields(value = {}, fallback = {}, lookupDepartment) {
  const timeManager = value.timeManager === undefined ? fallback.timeManager === true : value.timeManager === true
  const timeManagerAllDepartments = timeManager && (value.timeManagerAllDepartments === undefined ? fallback.timeManagerAllDepartments === true : value.timeManagerAllDepartments === true)
  const requested = value.timeManagerDepartments === undefined ? fallback.timeManagerDepartments : value.timeManagerDepartments
  if (timeManager && !timeManagerAllDepartments && requested !== undefined && !Array.isArray(requested)) {
    throw new HttpsError('invalid-argument', 'Die Zeitmanager-Abteilungen sind ungültig.')
  }
  const timeManagerDepartments = timeManager && !timeManagerAllDepartments
    ? [...new Set((requested || []).map((id) => {
        if (typeof id !== 'string' || !id.trim() || id.includes('/') || id.length > 128) throw new HttpsError('invalid-argument', 'Eine Zeitmanager-Abteilung ist ungültig.')
        return id.trim()
      }))]
    : []
  if (timeManagerDepartments.length > 200) throw new HttpsError('invalid-argument', 'Zu viele Zeitmanager-Abteilungen.')
  const previous = new Set(fallback.timeManagerDepartments || [])
  for (const id of timeManagerDepartments) {
    const department = await lookupDepartment(id)
    if (!department || (department.active === false && !previous.has(id))) {
      throw new HttpsError('invalid-argument', 'Eine Zeitmanager-Abteilung ist nicht verfügbar.')
    }
  }
  return { timeManager, timeManagerAllDepartments, timeManagerDepartments }
}
