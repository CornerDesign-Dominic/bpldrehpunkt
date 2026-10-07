import { shipmentTrackingBerlinLocal } from './shared/shipmentTrackingDryRun.js'

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function weekday(date) { return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(`${date}T12:00:00Z`).getUTCDay()] }

export function shipmentTrackingDateTime(value) {
  const local = shipmentTrackingBerlinLocal(value)
  if (!local) return 'Nicht hinterlegt'
  const [year, month, day] = local.date.split('-')
  return `${weekday(local.date)}, ${day}.${month}.${year}, ${local.time} Uhr`
}

/** Formats a time window compactly while preserving unambiguous dates. */
export function shipmentTrackingTimeWindow(window) {
  const from = shipmentTrackingBerlinLocal(window?.from)
  const until = shipmentTrackingBerlinLocal(window?.until)
  if (!from && !until) return 'Nicht hinterlegt'
  if (!from) return `bis ${shipmentTrackingDateTime(window?.until)}`
  if (!until) return shipmentTrackingDateTime(window?.from)
  if (from.date !== until.date) return `${shipmentTrackingDateTime(window?.from)} bis ${shipmentTrackingDateTime(window?.until)}`
  const [year, month, day] = from.date.split('-')
  const date = `${weekday(from.date)}, ${day}.${month}.${year}`
  if (from.time === until.time) return `${date}, ${from.time} Uhr`
  return `${date}, ${from.time}–${until.time} Uhr`
}

function location(value) { return text(value?.city) || text(value?.originalText) || 'Nicht hinterlegt' }
function transportOrderNumber(imported, externalNumber) { return text(externalNumber) || text(imported?.externalNumber) || text(imported?.orderNumber) || 'Nicht hinterlegt' }

/** Values available in every shipment-tracking system mail template. */
export function shipmentTrackingMailTemplateValues(imported, externalNumber) {
  const loadingWindow = imported?.loading?.window
  const unloadingWindow = imported?.unloading?.window
  return {
    transportOrderNumber: transportOrderNumber(imported, externalNumber),
    loadingLocation: location(imported?.loading),
    unloadingLocation: location(imported?.unloading),
    loadingTimeFrom: shipmentTrackingDateTime(loadingWindow?.from),
    loadingTimeUntil: shipmentTrackingDateTime(loadingWindow?.until),
    loadingTime: shipmentTrackingTimeWindow(loadingWindow),
    unloadingTimeFrom: shipmentTrackingDateTime(unloadingWindow?.from),
    unloadingTimeUntil: shipmentTrackingDateTime(unloadingWindow?.until),
    unloadingTime: shipmentTrackingTimeWindow(unloadingWindow),
  }
}
