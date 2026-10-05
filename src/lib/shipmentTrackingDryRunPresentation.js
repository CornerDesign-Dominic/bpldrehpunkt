const berlinDateTimeFormatter = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const berlinFullDateTimeFormatter = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function asDate(value) {
  if (value?.toDate) {
    const date = value.toDate()
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
  }
  if (Number.isFinite(value?.seconds)) {
    const date = new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000))
    return Number.isNaN(date.getTime()) ? null : date
  }
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

function formatShipmentTrackingDryRunDateTime(value) {
  const date = asDate(value)
  return date ? berlinFullDateTimeFormatter.format(date) : 'Zeitpunkt nicht verfügbar'
}

function durationText(milliseconds) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000))
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours ? `${hours} Std.` : ''}${hours && remainder ? ' ' : ''}${remainder ? `${remainder} Min.` : ''}` || '0 Min.'
}

function actionState(rule) {
  if (rule.status === 'sent') return 'sent'
  if (rule.status === 'notRequired') return null
  if (rule.status === 'skipped') return 'skipped'
  if (rule.status === 'due') return 'missed'
  if (!asDate(rule.scheduledAt) || (rule.kind === 'external' && rule.recipient?.state !== 'configured')) return 'blocked'
  return 'planned'
}

function actionStatusText(rule, state, now) {
  const scheduledAt = asDate(rule.scheduledAt)
  if (state === 'sent') return `Versendet ${formatShipmentTrackingDryRunDateTime(rule.dispatch?.sentAt)}`
  if (state === 'missed') return `Seit ${durationText(now.getTime() - scheduledAt.getTime())} verpasst`
  if (state === 'skipped') return rule.pause?.reason === 'import-date-change' ? 'Wegen Terminänderung übersprungen' : 'Wegen Pausierung übersprungen'
  if (state === 'blocked') {
    if (!scheduledAt) return 'Blockiert – Zeitpunkt nicht berechenbar'
    return 'Blockiert – Unternehmer-Empfänger fehlt'
  }
  return `Geplant in ${durationText(scheduledAt.getTime() - now.getTime())}`
}

function pauseText(pause) {
  if (pause?.reason === 'import-date-change') return 'Durch eine Terminänderung beim Import lag die Regel bereits in der Vergangenheit.'
  const from = formatShipmentTrackingDryRunDateTime(pause?.from)
  if (pause?.active) return `Die Automatik ist seit ${from} pausiert.`
  const until = formatShipmentTrackingDryRunDateTime(pause?.until)
  return `Die Automatik war von ${from} bis ${until} pausiert.`
}

function triggerLabel(sources) {
  const sourceSet = new Set(sources)
  if (sourceSet.has('arrival-confirmation')) return 'Vor ETA Ladestelle'
  if (sourceSet.has('carrier') && sourceSet.has('customer-required')) return 'Unternehmer und Kunde wichtig'
  if (sourceSet.has('customer-required')) return 'Kunde wichtig'
  if (sourceSet.has('carrier')) return 'Unternehmer'
  return 'Regelwerk'
}

function combineMatchingInternalActions(entries) {
  const combined = []
  for (const entry of entries) {
    const match = entry.kind === 'internal' && entry.scheduledAt && entry.source
      ? combined.find((candidate) => candidate.kind === 'internal' && candidate.topic === entry.topic && candidate.scheduledAt === entry.scheduledAt && candidate.state === entry.state && candidate.sources.length > 0 && !candidate.sources.includes(entry.source))
      : null
    if (!match) {
      combined.push({ ...entry, ruleIds: [entry.id], sources: entry.source ? [entry.source] : [] })
      continue
    }
    match.id = `${match.id}|${entry.id}`
    match.ruleIds.push(entry.id)
    match.sources.push(entry.source)
  }
  return combined.map((entry) => ({ ...entry, trigger: triggerLabel(entry.sources) }))
}

/** Converts the read-only shared result into compact, display-only strings. */
export function shipmentTrackingDryRunPresentation(preview, { now = new Date() } = {}) {
  const rules = Array.isArray(preview?.rules) ? preview.rules : []
  const diagnostics = Array.isArray(preview?.diagnostics) ? preview.diagnostics : []
  const referenceTime = asDate(now) || new Date()
  const entry = (rule) => {
    const state = actionState(rule)
    return {
      id: rule.ruleId,
      time: formatShipmentTrackingDryRunAt(rule.scheduledAt),
      topic: rule.arrivalConfirmation === true ? 'ETA Ladestelle' : topicLabel(rule.topic),
      title: rule.title || (rule.kind === 'internal' ? 'Interne Eskalation' : 'Erinnerung an Unternehmer'),
      recipient: recipientLabel(rule.recipient),
      reason: rule.reason || '',
      adjustmentReason: rule.adjustmentReason || null,
      status: rule.status,
      kind: rule.kind || 'external',
      scheduledAt: rule.scheduledAt || null,
      source: rule.source || null,
      arrivalConfirmation: rule.arrivalConfirmation === true,
      pauseText: rule.pause ? pauseText(rule.pause) : '',
      state,
      statusText: actionStatusText(rule, state, referenceTime),
      sentAt: rule.dispatch?.sentAt || null,
    }
  }
  const entries = combineMatchingInternalActions(rules.map(entry).filter((item) => item.state !== null))
  const summary = entries.reduce((counts, current) => ({ ...counts, [current.state]: counts[current.state] + 1 }), { planned: 0, missed: 0, sent: 0, skipped: 0, blocked: 0 })
  return {
    hints: Array.isArray(preview?.hints) ? preview.hints : [],
    nextAction: preview?.nextAction ? entry(preview.nextAction) : null,
    entries,
    summary,
    emptyMessage: diagnostics[0]?.message || 'In den aktuellen Partnerregeln ist keine aktive Regelstufe vorhanden.',
  }
}
