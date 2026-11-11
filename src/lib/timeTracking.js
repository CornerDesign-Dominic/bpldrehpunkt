import { httpsCallable } from 'firebase/functions'
import { functions, waitForAppCheckToken } from './firebase.js'

async function call(name, data = {}) {
  await waitForAppCheckToken()
  return (await httpsCallable(functions, name)(data)).data
}

export const listTimeWorkspace = (data) => call('listTimeWorkspace', data)
export const stampTime = (data) => call('stampTime', { ...data, client: 'web' })
export const correctTimeDay = (data) => call('correctTimeDay', { ...data, client: 'web' })
export const listOwnTimeBookings = (data) => call('listOwnTimeBookings', data)
export const saveTimeWorkModel = (model) => call('saveTimeWorkModel', { model })
export const saveTimeAccount = (data) => call('saveTimeAccount', data)
export const listTimeWorkModelTemplates = () => call('listTimeWorkModelTemplates')
export const saveTimeWorkModelTemplate = (data) => call('saveTimeWorkModelTemplate', data)
export const archiveTimeWorkModelTemplate = (data) => call('archiveTimeWorkModelTemplate', data)

export const TIME_ACTIONS = { come: 'Kommen', pause_start: 'Pause beginnen', pause_end: 'Pause beenden', go: 'Gehen' }
export const TIME_REASONS = { forgot_stamp: 'Stempeln vergessen', forgot_break: 'Pause vergessen', wrong_booking: 'Fehlbuchung', other: 'Sonstiges' }

export function timeDate(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function addDays(date, count) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + count)
  return value.toISOString().slice(0, 10)
}

export function minutesLabel(minutes = 0, signed = false) {
  const rounded = Math.round(Number(minutes) || 0)
  const value = Math.abs(rounded)
  return `${rounded < 0 ? '−' : signed && rounded > 0 ? '+' : ''}${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`
}

export function formatTime(at) {
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function localTimeValue(at) {
  return formatTime(at) === '—' ? '' : formatTime(at)
}

// Build an unambiguous Berlin wall-clock timestamp, including DST validation.
export function berlinTimestamp(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Bitte Datum und Uhrzeit vollständig angeben.')
  const candidates = ['+01:00', '+02:00'].map(offset => new Date(`${date}T${time}:00${offset}`))
    .filter(value => timeDate(value) === date && formatTime(value) === time)
  if (candidates.length !== 1) throw new Error('Diese Uhrzeit liegt in der Zeitumstellung. Bitte den Zeitmanager zur Klärung kontaktieren.')
  return candidates[0].toISOString()
}

export function monthRange(month) {
  const first = `${month}-01`
  const next = new Date(`${first}T12:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { from: first, to: addDays(next.toISOString().slice(0, 10), -1) }
}

export function weekRange(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const from = addDays(date, -(weekday || 7) + 1)
  return { from, to: addDays(from, 6) }
}

export function timeError(error) {
  if (error?.code === 'functions/unavailable' || error?.code === 'functions/deadline-exceeded') return 'Keine Verbindung. Bitte später erneut versuchen.'
  if (error?.code === 'functions/internal' || error?.code === 'functions/unknown') return 'Die Zeitdaten konnten derzeit nicht verarbeitet werden. Bitte erneut versuchen.'
  return error?.message || 'Die Zeitdaten konnten nicht verarbeitet werden.'
}
