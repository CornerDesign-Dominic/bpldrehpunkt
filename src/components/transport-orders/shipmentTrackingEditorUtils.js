import { timestampToDateTimeInput } from '../../lib/shipmentTrackingPresentation.js'

export function existingTransitEntries(events) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => ['transit_position_reported', 'transit_pause_reported'].includes(event.eventType) && !event.removedAt && event.newValue?.transitEntry && event.id)
    .slice(0, 20)
    .reverse()
    .map((event) => {
      const entry = event.newValue.transitEntry
      const duration = String(entry.durationMinutes ?? '')
      return { id: event.id, source: event.source, kind: entry.kind, at: timestampToDateTimeInput(entry.at), location: entry.location || '', kilometersToDestination: String(entry.kilometersToDestination ?? ''), durationChoice: ['15', '30', '45', '540', '660'].includes(duration) ? duration : 'custom', durationMinutes: duration }
    })
}

export function normalizedTransitEntry(entry) {
  if (!entry.at || Number.isNaN(new Date(entry.at).getTime())) throw new Error('Bitte gib für jede Meldung Tag und Uhrzeit an.')
  if (entry.kind === 'position') {
    const kilometers = Number(entry.kilometersToDestination)
    if (entry.kilometersToDestination === '' || !Number.isFinite(kilometers) || kilometers < 0 || kilometers > 100000) throw new Error('Bitte gib gültige Kilometer bis zur Entladestelle an.')
    return { kind: 'position', at: entry.at, kilometersToDestination: kilometers, location: entry.location.trim() }
  }
  const duration = Number(entry.durationMinutes)
  if (!Number.isInteger(duration) || duration < 1 || duration > 10080) throw new Error('Bitte gib eine gültige Pausendauer an.')
  return { kind: 'pause', at: entry.at, durationMinutes: duration }
}
