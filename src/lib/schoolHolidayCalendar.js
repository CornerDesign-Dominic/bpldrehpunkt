function dateValue(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function nextDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return dateValue(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export function schoolHolidayDaysForMonth(records, year, month) {
  const monthStart = dateValue(year, month + 1, 1)
  const monthEndDate = new Date(Date.UTC(year, month + 1, 0))
  const monthEnd = dateValue(monthEndDate.getUTCFullYear(), monthEndDate.getUTCMonth() + 1, monthEndDate.getUTCDate())
  return (Array.isArray(records) ? records : []).reduce((days, holiday) => {
    if (typeof holiday?.startDate !== 'string' || typeof holiday?.endDate !== 'string' || holiday.endDate < monthStart || holiday.startDate > monthEnd) return days
    let current = holiday.startDate > monthStart ? holiday.startDate : monthStart
    const lastDay = holiday.endDate < monthEnd ? holiday.endDate : monthEnd
    while (current <= lastDay) {
      days[current] = [...(days[current] || []), { id: holiday.id, name: holiday.name }]
      current = nextDate(current)
    }
    return days
  }, {})
}
