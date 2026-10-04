import { SHIPMENT_TRACKING_TIMEZONE } from './shipmentTrackingOperatingHours.js'

const bareDateTime = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/
const berlinPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHIPMENT_TRACKING_TIMEZONE,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function berlinParts(value) {
  const parts = Object.fromEntries(berlinPartsFormatter.formatToParts(value).filter((item) => item.type !== 'literal').map((item) => [item.type, Number(item.value)]))
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second }
}

/** Bare date-times are Europe/Berlin wall-clock times, so browser datetime
 * inputs remain correct across CET/CEST. A non-existent local DST time is rejected. */
export function shipmentTrackingDate(value) {
  if (value?.toDate) return value.toDate()
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string' || !value.trim()) return null
  const source = value.trim()
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(source)) {
    const parsed = new Date(source)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const match = source.match(bareDateTime)
  if (!match) {
    const parsed = new Date(source)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const [, yearText, monthText, dayText, hourText = '00', minuteText = '00', secondText = '00', fractionText = '0'] = match
  const expected = { year: Number(yearText), month: Number(monthText), day: Number(dayText), hour: Number(hourText), minute: Number(minuteText), second: Number(secondText) }
  const milliseconds = Number(fractionText.padEnd(3, '0'))
  const utcWallClock = Date.UTC(expected.year, expected.month - 1, expected.day, expected.hour, expected.minute, expected.second, milliseconds)
  const offsets = new Set([-3, 0, 3].map((hours) => {
    const instant = new Date(utcWallClock + hours * 60 * 60 * 1000)
    const parts = berlinParts(instant)
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant.getTime() + milliseconds
  }))
  const candidates = [...offsets].map((offset) => new Date(utcWallClock - offset)).filter((candidate) => {
    const actual = berlinParts(candidate)
    return Object.entries(expected).every(([key, item]) => actual[key] === item)
  }).sort((left, right) => left.getTime() - right.getTime())
  return candidates[0] || null
}
