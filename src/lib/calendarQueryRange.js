function dateString(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function calendarQueryRange(year, month, upcomingFrom) {
  return { from: dateString(new Date(year, month - 1, 1)), until: dateString(new Date(year, month + 2, 0)), upcomingFrom }
}
