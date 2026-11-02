export const DYCOS_EARLIEST_LOADING_DATE = '2026-01-01'
export const DYCOS_IMPORT_SPACING_MS = 6500

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function dycosImportEligibility(loadingDate, number) {
  const raw = typeof loadingDate === 'string' ? loadingDate.trim() : loadingDate
  const absent = raw == null || raw === '' || typeof raw === 'string' && raw.startsWith('1899-')
  if (!absent) {
    const day = typeof raw === 'string' ? raw.slice(0, 10) : ''
    if (!isCalendarDate(day)) return { allowed: false, reason: 'invalid-date' }
    return { allowed: day >= DYCOS_EARLIEST_LOADING_DATE, reason: day >= DYCOS_EARLIEST_LOADING_DATE ? 'date' : 'before-2026' }
  }
  // DyCoS TA numbers use YYMM followed by a running number. A missing date is
  // not permission to import an older or unrecognizable number.
  const match = /^(\d{2})(0[1-9]|1[0-2])\d+$/.exec(String(number ?? ''))
  return { allowed: Boolean(match && Number(match[1]) >= 26), reason: match && Number(match[1]) >= 26 ? 'number' : 'missing-year' }
}
