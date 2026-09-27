const berlinDateTimeFormatter = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function asDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}
function topicLabel(topic) { return topic === 'loadingSite' ? 'Ladestelle' : 'Kennzeichen' }
function maskEmail(value) {
  const email = typeof value === 'string' ? value.trim() : ''
  if (!email) return 'Empfänger fehlt'
  return `${email.split('@')[0] || '…'}@…`
}
function recipientLabel(recipient) {
  if (recipient?.role === 'internal') return 'BPL intern'
  return recipient?.state === 'configured' ? maskEmail(recipient.email) : 'Empfänger fehlt'
}

export function formatShipmentTrackingDryRunAt(value) {
  const date = asDate(value)
  return date ? berlinDateTimeFormatter.format(date) : 'Zeitpunkt noch nicht berechenbar'
}

/** Converts the read-only shared result into compact, display-only strings. */
export function shipmentTrackingDryRunPresentation(preview) {
  const rules = Array.isArray(preview?.rules) ? preview.rules : []
  const diagnostics = Array.isArray(preview?.diagnostics) ? preview.diagnostics : []
  const entry = (rule) => ({
    id: rule.ruleId,
    time: formatShipmentTrackingDryRunAt(rule.scheduledAt),
    topic: topicLabel(rule.topic),
    title: rule.title || (rule.kind === 'internal' ? 'Interne Eskalation' : 'Erinnerung an Unternehmer'),
    recipient: recipientLabel(rule.recipient),
    reason: rule.reason || '',
    adjustmentReason: rule.adjustmentReason || null,
    status: rule.status,
  })
  return {
    hints: Array.isArray(preview?.hints) ? preview.hints : [],
    nextAction: preview?.nextAction ? entry(preview.nextAction) : null,
    entries: rules.map(entry),
    emptyMessage: diagnostics[0]?.message || 'In den aktuellen Partnerregeln ist keine aktive Regelstufe vorhanden.',
  }
}
