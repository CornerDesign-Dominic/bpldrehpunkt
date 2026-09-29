export const shipmentTrackingArrivalConfirmationPath = 'systemSettings/shipmentTrackingArrivalConfirmation'
export const shipmentTrackingArrivalConfirmationTemplateId = 'shipment_tracking_actual_arrival_confirmation'
export const ARRIVAL_CONFIRMATION_RULE_ID = 'actualArrivalConfirmation.external'
export const DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION = Object.freeze({
  enabled: true,
  offsetWorkingHours: 2,
  subject: 'Transportauftrag {{transportOrderNumber}} – Bitte aktuellen Stand bestätigen',
  message: 'Guten Tag,\n\nbitte bestätigen Sie kurz, ob für den Transportauftrag {{transportOrderNumber}} alles wie geplant ist oder ob es Änderungen gibt.\n\nLadestelle: {{loadingLocation}}\nGeplanter Beginn: {{loadingTime}}\n\nBitte teilen Sie uns insbesondere die aktuelle voraussichtliche Ankunftszeit mit.\n\nVielen Dank.',
})

const allowedPlaceholders = new Set(['transportOrderNumber', 'loadingLocation', 'loadingTime'])
const placeholders = (value) => [...String(value || '').matchAll(/{{\s*([^{}\s]+)\s*}}/g)].map((match) => match[1])
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export function normalizeShipmentTrackingArrivalConfirmation(value) {
  const hours = Number(value?.offsetWorkingHours)
  return {
    enabled: value?.enabled !== false,
    offsetWorkingHours: Number.isInteger(hours) && hours >= 1 && hours <= 48 ? hours : DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION.offsetWorkingHours,
    subject: text(value?.subject, 240) || DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION.subject,
    message: text(value?.message, 12000) || DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION.message,
  }
}

export function validateShipmentTrackingArrivalConfirmation(value) {
  if (!value || typeof value !== 'object') throw new Error('Die Einstellungen fehlen.')
  if (typeof value.enabled !== 'boolean') throw new Error('Die Aktivierung muss angegeben werden.')
  if (!Number.isInteger(value.offsetWorkingHours) || value.offsetWorkingHours < 1 || value.offsetWorkingHours > 48) throw new Error('Der Zeitpunkt muss zwischen 1 und 48 Arbeitsstunden liegen.')
  const subject = text(value.subject, 240)
  const message = text(value.message, 12000)
  if (!subject || !message) throw new Error('Betreff und Nachricht dürfen nicht leer sein.')
  if ([...placeholders(subject), ...placeholders(message)].some((placeholder) => !allowedPlaceholders.has(placeholder))) throw new Error('Betreff oder Nachricht enthalten einen nicht verfügbaren Platzhalter.')
  return { enabled: value.enabled, offsetWorkingHours: value.offsetWorkingHours, subject, message }
}
