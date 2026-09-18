function overlapsYear(entry, year) {
  return entry?.startDate <= `${year}-12-31` && entry?.endDate >= `${year}-01-01`
}

function isVacationTaken(entry) {
  return entry?.vacationType === 'normal'
    && entry?.requestKind !== 'cancellation'
    && entry?.cancellationRequest !== true
    && (entry?.status === 'approved' || (entry?.status === 'manual' && entry?.hrManualEntry === true))
}

function vacationDaysInYear(entries, year) {
  return entries.filter((entry) => isVacationTaken(entry) && overlapsYear(entry, year)).reduce((total, entry) => total + (Number(entry.days) || 0), 0)
}

function manualAdjustmentDaysInYear(entries, year) {
  return entries.filter((entry) => entry?.isManual === true && entry?.status === 'manual' && overlapsYear(entry, year)).reduce((total, entry) => total + (Number(entry.days) || 0), 0)
}

export function calculateVacationYearBalance({ annualVacationEntitlement, vacationTrackingStartYear, vacationTrackingOpeningBalance, entries = [], year }) {
  const number = (value) => value === null || value === undefined || value === '' ? Number.NaN : Number(value)
  const annualEntitlement = number(annualVacationEntitlement)
  const hasAnnualEntitlement = Number.isFinite(annualEntitlement)
  const startYear = number(vacationTrackingStartYear)
  const openingBalance = number(vacationTrackingOpeningBalance)
  const hasOpeningBalance = Number.isFinite(openingBalance)
  const initialAvailableDays = hasOpeningBalance ? openingBalance : hasAnnualEntitlement ? annualEntitlement : null
  let carryBalance = initialAvailableDays ?? 0

  if (hasAnnualEntitlement && Number.isFinite(startYear) && year > startYear) {
    carryBalance -= vacationDaysInYear(entries, startYear) - manualAdjustmentDaysInYear(entries, startYear)
    for (let balanceYear = startYear + 1; balanceYear < year; balanceYear += 1) carryBalance += annualEntitlement - vacationDaysInYear(entries, balanceYear) + manualAdjustmentDaysInYear(entries, balanceYear)
  } else if (!Number.isFinite(startYear) || year < startYear) {
    carryBalance = 0
  }

  const takenDays = vacationDaysInYear(entries, year)
  const isTrackingStartYear = Number.isFinite(startYear) && year === startYear
  const availableDays = isTrackingStartYear ? initialAvailableDays : hasAnnualEntitlement ? annualEntitlement + carryBalance : null
  const remainingDays = availableDays === null ? null : availableDays - takenDays + manualAdjustmentDaysInYear(entries, year)

  return { annualEntitlement, availableDays, carryBalance, isTrackingStartYear, remainingDays, takenDays }
}
